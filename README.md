# iPod Classic Rockbox Scrobbler for Last.fm

A sleek, modern, and completely client-side web application for scrobbling music directly from your **Apple iPod Classic running the custom Rockbox firmware** to Last.fm. 

## Features
* **Client-Side:** Runs entirely in your browser. No data is sent to a third-party server.
* **Easy to Use:** Just drag and drop your `.scrobbler.log` file.
* **Secure:** Your Last.fm credentials are saved directly in your browser's local storage and only communicate with Last.fm's official API.

## How to use it (It's super easy!)

You don't need to install anything! Just follow these steps:

1. **Get your iPod ready:** Connect your Rockbox-enabled iPod to your computer via USB.
2. **Find your log file:** Open your iPod's drive on your computer. You are looking for a file named `.scrobbler.log` in the main/root folder. 
   *(Mac users: If you can't see the file, press `Cmd + Shift + .` to show hidden files!)*
3. **Open the App:** Go to **[https://owen-tariq.github.io/rockbox-scrobbler/](https://owen-tariq.github.io/rockbox-scrobbler/)**.
4. **Drag and Drop:** Simply drag your `.scrobbler.log` file from your iPod directly onto the webpage!

The app will parse your file, filter out invalid plays, and securely batch-upload everything to your Last.fm profile. 

> **Note:** This tool runs in the browser so it should work anywhere, but it has currently **only been tested on macOS / MacBooks**.

> **Tip:** After you've successfully uploaded your scrobbles, remember to **delete** the `.scrobbler.log` file from your iPod! Rockbox will automatically create a fresh one next time you play music. This prevents you from accidentally scrobbling the same songs twice.

---

### One-time Setup: Getting a Last.fm API Key
To use this tool, you need to provide your own Last.fm API Key (this keeps the app serverless and secure). It takes 10 seconds and it's completely free:
1. Go to the [Last.fm API Account Creation Page](https://www.last.fm/api/account/create).
2. Fill out the form. You can use the following for the required fields:
   * **Application homepage:** `https://owen-tariq.github.io/rockbox-scrobbler/`
   * **Callback URL:** `https://owen-tariq.github.io/rockbox-scrobbler/`
3. Click Submit. You will be given an **API Key** and a **Shared Secret**.
4. Open the Rockbox Scrobbler app, click the settings gear ⚙️, and paste them in! They will be saved securely in your browser so you never have to do it again.

## For Developers (Running locally)
If you want to modify or run the code yourself locally:
```bash
# Clone the repository
git clone https://github.com/owen-tariq/rockbox-scrobbler.git
cd rockbox-scrobbler

# Install dependencies
npm install

# Run the dev server
npm run dev
```

Built with HTML, CSS (Glassmorphism design), Vanilla JS, and Vite.
