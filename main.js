import md5 from 'blueimp-md5';

// DOM Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const saveSettings = document.getElementById('save-settings');
const apiKeyInput = document.getElementById('api-key');
const apiSecretInput = document.getElementById('api-secret');
const logoutBtn = document.getElementById('logout-btn');

const authSection = document.getElementById('auth-section');
const loginBtn = document.getElementById('login-btn');
const uploadSection = document.getElementById('upload-section');
const statusSection = document.getElementById('status-section');

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const logList = document.getElementById('log-list');

// State
let apiKey = localStorage.getItem('lf_api_key') || '';
let apiSecret = localStorage.getItem('lf_api_secret') || '';
let sessionKey = localStorage.getItem('lf_session_key') || '';
let isProcessing = false;

// Initialization
function init() {
  apiKeyInput.value = apiKey;
  apiSecretInput.value = apiSecret;

  if (sessionKey) {
    logoutBtn.classList.remove('hidden');
  }

  // Check URL for auth token
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (token && apiKey && apiSecret) {
    window.history.replaceState({}, document.title, window.location.pathname); // Clean URL
    fetchSession(token);
  } else {
    updateUI();
  }
}

function updateUI() {
  authSection.classList.add('hidden');
  uploadSection.classList.add('hidden');
  
  if (!apiKey || !apiSecret) {
    settingsModal.classList.remove('hidden');
  } else if (!sessionKey) {
    authSection.classList.remove('hidden');
  } else {
    uploadSection.classList.remove('hidden');
  }
}

// Event Listeners
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettings.addEventListener('click', () => {
  if (apiKey && apiSecret) settingsModal.classList.add('hidden');
});

saveSettings.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  apiSecret = apiSecretInput.value.trim();
  if (apiKey && apiSecret) {
    localStorage.setItem('lf_api_key', apiKey);
    localStorage.setItem('lf_api_secret', apiSecret);
    settingsModal.classList.add('hidden');
    updateUI();
  } else {
    alert("Please provide both API Key and Secret.");
  }
});

logoutBtn.addEventListener('click', () => {
  sessionKey = '';
  localStorage.removeItem('lf_session_key');
  logoutBtn.classList.add('hidden');
  settingsModal.classList.add('hidden');
  updateUI();
});

loginBtn.addEventListener('click', () => {
  const cb = encodeURIComponent(window.location.href);
  window.location.href = `http://www.last.fm/api/auth/?api_key=${apiKey}&cb=${cb}`;
});

// Drag and Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function() {
  if (this.files.length) handleFiles(this.files);
});

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

// File Processing
function handleFiles(files) {
  if (isProcessing) return;
  const file = files[0];
  if (!file) return;

  isProcessing = true;
  uploadSection.classList.add('hidden');
  statusSection.classList.remove('hidden');
  logList.innerHTML = '';
  progressBar.style.width = '0%';
  statusText.textContent = `Reading file: ${file.name}...`;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    processLog(text).catch(err => {
      alert(`Fatal Error processing log: ${err.message}`);
      isProcessing = false;
      statusText.textContent = 'Error processing file.';
    });
  };
  reader.onerror = () => {
    alert("Error reading file from disk.");
    isProcessing = false;
  };
  reader.readAsText(file);
}

async function processLog(text) {
  try {
    const lines = text.split('\n');
    const tracksToScrobble = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.startsWith('#')) continue;
      
      try {
        const track = parseLine(line);
        if (track && track.artist && track.track && track.timestamp && track.timestamp !== '0') {
          tracksToScrobble.push(track);
        } else {
          addLogItem(`Line ${i+1}: Missing required data. Parsed as: ${JSON.stringify(track)}`, false);
        }
      } catch (e) {
        addLogItem(`Line ${i+1}: Parse error: ${e.message}`, false);
      }
    }

    if (tracksToScrobble.length === 0) {
      statusText.textContent = 'No valid scrobbles found in file. Check the log below for details.';
      isProcessing = false;
      
      const backBtn = document.createElement('button');
      backBtn.className = 'primary-btn';
      backBtn.style.marginTop = '1rem';
      backBtn.textContent = 'Try Again';
      backBtn.onclick = () => {
        statusSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        backBtn.remove();
        fileInput.value = '';
      };
      statusSection.appendChild(backBtn);
      return;
    }

    statusText.textContent = `Found ${tracksToScrobble.length} tracks. Uploading...`;
    
    // Batch up to 50 tracks
    const BATCH_SIZE = 50;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tracksToScrobble.length; i += BATCH_SIZE) {
      const batch = tracksToScrobble.slice(i, i + BATCH_SIZE);
      try {
        await scrobbleBatch(batch);
        successCount += batch.length;
        batch.forEach(t => addLogItem(`${t.artist} - ${t.track}`, true));
      } catch (err) {
        console.error(err);
        failCount += batch.length;
        batch.forEach(t => addLogItem(`${t.artist} - ${t.track} (Failed)`, false));
      }
      
      const progress = Math.min(100, Math.round(((i + BATCH_SIZE) / tracksToScrobble.length) * 100));
      progressBar.style.width = `${progress}%`;
    }

    statusText.textContent = `Done! ${successCount} successful, ${failCount} failed.`;
    isProcessing = false;
    
    // Provide a button to go back
    const backBtn = document.createElement('button');
    backBtn.className = 'primary-btn';
    backBtn.style.marginTop = '1rem';
    backBtn.textContent = 'Upload Another File';
    backBtn.onclick = () => {
      statusSection.classList.add('hidden');
      uploadSection.classList.remove('hidden');
      backBtn.remove();
      fileInput.value = '';
    };
    statusSection.appendChild(backBtn);

  } catch (fatalErr) {
    alert(`Fatal error during processing: ${fatalErr.message}`);
    isProcessing = false;
  }
}

function parseLine(line) {
  const cols = line.split('\t');
  if (cols.length < 5) return null;
  
  // Try to determine format based on first column
  const firstCol = cols[0].trim();
  const isAudioScrobbler = isNaN(firstCol) || firstCol === '';
  
  if (isAudioScrobbler) {
    // Audioscrobbler: Artist, Album, Track, TrackNum, Duration, L/T, Timestamp, MBID
    return {
      artist: cols[0]?.trim(),
      album: cols[1]?.trim(),
      track: cols[2]?.trim(),
      timestamp: cols[6]?.trim()
    };
  } else {
    // Rockbox specific: Status, Duration, L/T, Timestamp, MBID, Artist, Album, Track
    // Wait, let's be more lenient with the indices just in case it's slightly shifted
    return {
      timestamp: cols[3]?.trim(),
      artist: cols[5]?.trim(),
      album: cols[6]?.trim(),
      track: cols[7]?.trim()
    };
  }
}

function addLogItem(text, success) {
  const li = document.createElement('li');
  li.className = success ? 'success' : 'error';
  li.textContent = text;
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
}

// Last.fm API Interaction
function generateSignature(params) {
  const keys = Object.keys(params).sort();
  let sigString = '';
  keys.forEach(k => {
    sigString += k + params[k];
  });
  sigString += apiSecret;
  return md5(sigString);
}

async function fetchSession(token) {
  const params = {
    method: 'auth.getSession',
    api_key: apiKey,
    token: token
  };
  
  params.api_sig = generateSignature(params);
  params.format = 'json';
  
  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${new URLSearchParams(params)}`);
    const data = await res.json();
    
    if (data.error) {
      alert(`Last.fm Error: ${data.message}`);
      updateUI();
    } else if (data.session) {
      sessionKey = data.session.key;
      localStorage.setItem('lf_session_key', sessionKey);
      logoutBtn.classList.remove('hidden');
      updateUI();
    }
  } catch (e) {
    alert("Failed to authenticate with Last.fm.");
    updateUI();
  }
}

async function scrobbleBatch(tracks) {
  const params = {
    method: 'track.scrobble',
    api_key: apiKey,
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params).toString()
  });
  
  const data = await res.json();
  if (data.error) {
    throw new Error(data.message);
  }
  return data;
}

// Start
init();
