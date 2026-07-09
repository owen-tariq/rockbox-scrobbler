import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Configuration
const API_KEY = '1b7cd045cbd4b48d6e2d44c38215e7c0';
const API_SECRET = 'c17cbfc8fa05c63596363b98511555ab';
const USERNAME = 'TarikulMesuk';
const PASSWORD = 'getput-cisde0-wEttov';

const SESSION_FILE = path.join(process.env.HOME, '.lastfm_session');
const LOG_FILE = path.join(process.env.HOME, '.rockbox_scrobbler.log');
const SONGS_EXPORT_FILE = path.join(process.env.HOME, 'Desktop', 'iPod_Songs_List.txt');

// Logging utility
function logInfo(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function logError(msg, err) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ERROR: ${msg} ${err ? err.message || err : ''}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.error(line.trim());
}

// MD5 Signature
function generateSignature(params) {
  const keys = Object.keys(params).sort();
  let sigString = '';
  keys.forEach(k => {
    sigString += k + params[k];
  });
  sigString += API_SECRET;
  return crypto.createHash('md5').update(sigString, 'utf8').digest('hex');
}

// Fetch Mobile Session
async function getSession() {
  if (fs.existsSync(SESSION_FILE)) {
    return fs.readFileSync(SESSION_FILE, 'utf8').trim();
  }
  
  logInfo("No session found. Authenticating with Last.fm...");
  const params = {
    method: 'auth.getMobileSession',
    username: USERNAME,
    password: PASSWORD,
    api_key: API_KEY
  };
  params.api_sig = generateSignature(params);
  params.format = 'json';

  const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  
  const data = await res.json();
  if (data.error) {
    throw new Error(`Last.fm Auth Error: ${data.message}`);
  }
  
  const sessionKey = data.session.key;
  fs.writeFileSync(SESSION_FILE, sessionKey);
  logInfo("Successfully authenticated and saved session key.");
  return sessionKey;
}

// Scrobbling Engine
async function scrobbleBatch(sessionKey, tracks) {
  const params = {
    method: 'track.scrobble',
    api_key: API_KEY,
    sk: sessionKey
  };
  
  tracks.forEach((track, idx) => {
    params[`artist[${idx}]`] = track.artist;
    params[`track[${idx}]`] = track.track;
    params[`timestamp[${idx}]`] = track.timestamp;
    if (track.album) params[`album[${idx}]`] = track.album;
  });
  
  params.api_sig = generateSignature(params);
  params.format = 'json';
  
  const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  
  const data = await res.json();
  if (data.error) {
    throw new Error(data.message);
  }
  return data;
}

function parseLine(line) {
  const cols = line.split('\t');
  if (cols.length < 5) return null;
  
  const firstCol = cols[0].trim();
  const isAudioScrobbler = isNaN(firstCol) || firstCol === '';
  
  if (isAudioScrobbler) {
    return {
      artist: cols[0]?.trim(),
      album: cols[1]?.trim(),
      track: cols[2]?.trim(),
      timestamp: cols[6]?.trim()
    };
  } else {
    return {
      timestamp: cols[3]?.trim(),
      artist: cols[5]?.trim(),
      album: cols[6]?.trim(),
      track: cols[7]?.trim()
    };
  }
}

// Export Songs List
function exportSongsList(volumePath) {
  try {
    let fileList = [];
    const walkSync = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filepath = path.join(dir, file);
        if (fs.existsSync(filepath)) {
          const stat = fs.statSync(filepath);
          if (stat.isDirectory()) {
            if (!file.startsWith('.')) {
              walkSync(filepath);
            }
          } else {
            const ext = path.extname(file).toLowerCase();
            if (['.mp3', '.flac', '.m4a', '.wav', '.ogg', '.wma', '.aac'].includes(ext)) {
              // Store relative path so it's cleaner
              fileList.push(path.relative(volumePath, filepath));
            }
          }
        }
      });
    };
    
    walkSync(volumePath);
    
    if (fileList.length > 0) {
      const header = "--- iPod Music Library Export ---\nTotal Tracks: " + fileList.length + "\n\n";
      fs.writeFileSync(SONGS_EXPORT_FILE, header + fileList.join('\n'));
      logInfo(`Exported list of ${fileList.length} songs to ${SONGS_EXPORT_FILE}`);
    }
  } catch (err) {
    logError("Failed to export songs list", err);
  }
}

// Main Routine
async function main() {
  logInfo("Starting automated scrobbler check...");
  
  // 1. Find .scrobbler.log on any mounted volume
  const volumesDir = '/Volumes';
  let targetVolumePath = null;
  let targetFile = null;
  
  try {
    const volumes = fs.readdirSync(volumesDir);
    for (const vol of volumes) {
      if (vol === 'Macintosh HD') continue;
      const volPath = path.join(volumesDir, vol);
      const checkPath = path.join(volPath, '.scrobbler.log');
      if (fs.existsSync(checkPath)) {
        targetVolumePath = volPath;
        targetFile = checkPath;
        break;
      }
    }
  } catch (err) {
    logError("Could not read /Volumes", err);
    return;
  }
  
  if (targetVolumePath) {
     logInfo(`iPod detected at: ${targetVolumePath}. Exporting song list...`);
     exportSongsList(targetVolumePath);
  }

  if (!targetFile) {
    logInfo("No .scrobbler.log file found on any connected drive.");
    return;
  }
  
  logInfo(`Found log file at: ${targetFile}`);
  
  // 2. Parse file
  const text = fs.readFileSync(targetFile, 'utf8');
  const lines = text.split('\n');
  const tracksToScrobble = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    try {
      const track = parseLine(line);
      if (track && track.artist && track.track && track.timestamp && track.timestamp !== '0') {
        tracksToScrobble.push(track);
      }
    } catch (e) {
      logError(`Failed to parse line ${i+1}: ${line}`, e);
    }
  }

  if (tracksToScrobble.length === 0) {
    logInfo("No valid tracks to scrobble in the file. Deleting empty file.");
    fs.unlinkSync(targetFile);
    return;
  }
  
  // 3. Authenticate
  let sessionKey;
  try {
    sessionKey = await getSession();
  } catch (err) {
    logError("Authentication failed", err);
    return;
  }
  
  // 4. Batch Upload
  logInfo(`Uploading ${tracksToScrobble.length} tracks...`);
  const BATCH_SIZE = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tracksToScrobble.length; i += BATCH_SIZE) {
    const batch = tracksToScrobble.slice(i, i + BATCH_SIZE);
    try {
      await scrobbleBatch(sessionKey, batch);
      successCount += batch.length;
    } catch (err) {
      logError(`Failed to upload batch ${i/BATCH_SIZE + 1}`, err);
      failCount += batch.length;
    }
  }
  
  logInfo(`Finished uploading. Success: ${successCount}, Failed: ${failCount}`);
  
  // 5. Delete file only if there were no failures
  if (failCount === 0) {
    try {
      fs.unlinkSync(targetFile);
      logInfo("Successfully deleted .scrobbler.log from the device.");
    } catch (err) {
      logError("Failed to delete .scrobbler.log", err);
    }
  } else {
    logInfo("Not deleting .scrobbler.log because some tracks failed to upload.");
  }
}

main().catch(err => logError("Unhandled exception in main", err));
