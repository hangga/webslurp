# BrutuSuite

<p align="center">
  <img src="logo-dark.png" width="300" alt="BrutuSuite Logo">
</p>

![BrutuSuite](https://img.shields.io/badge/version-1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Chrome](https://img.shields.io/badge/Chrome-Extension-orange)

**BrutuSuite** is a powerful Chrome DevTools extension that lets you **intercept, inspect, modify, and replay** HTTP/HTTPS API requests directly from your browser's DevTools. It's designed for developers, testers, and security enthusiasts who need deep visibility and control over network traffic.

[![Demo](preview.gif)](https://github.com/user-attachments/assets/f1d04663-022e-4385-9243-9cd3e7988e11)

---

## 🚀 Features

- **Intercept requests** – Automatically captures all XHR and Fetch requests from the current tab.
- **Rich inspection** – View request/response headers, body, status, timing, and MIME type.
- **Edit & replay** – Modify any part of a request (URL, method, headers, body, query params, auth) and resend it instantly.
- **Authentication support** – Built-in support for Basic Auth, Bearer Token, and OAuth 2.0 (Client Credentials & Password Grant) with token fetching.
- **Query parameter editor** – Add, remove, or edit URL parameters with live preview.
- **Form data & file upload** – Supports `multipart/form-data` and `x-www-form-urlencoded` payloads.
- **Copy as cURL** – Export any request as a `curl` command with cookies preserved (`-b` flag).
- **Persistent notes** – Add custom notes to each request for documentation or collaboration.
- **Filter & search** – Filter by URL, method, status code, or content within request/response.
- **Dark theme** – Optimized for low‑light environments.
- **Lightweight & fast** – Built with vanilla JavaScript and minimal dependencies.

---

## 📦 Installation

Since BrutuSuite is open‑source, you can install it directly from the source code.

### Prerequisites

- Google Chrome (or any Chromium‑based browser)

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/brutusuite.git
   cd brutusuite
   ```

2. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in the top‑right corner)

3. **Load unpacked extension**
   - Click **Load unpacked**
   - Select the folder containing the extension files (where `manifest.json` is located)

4. The extension is now installed. You can pin it to the toolbar for quick access.

---

## 🧑‍💻 How to Use

### 1. Attach to a tab

- Open the DevTools (F12 or right‑click → Inspect) on the page you want to monitor.
- Go to the **BrutuSuite** panel (you may need to click the double‑arrow to see it).
- Click the **Intercept** button – the extension will attach to the current tab and start capturing requests.

### 2. View captured requests

- All captured requests appear in the left sidebar.
- Click any entry to see its full details on the right.
- Use the search bar and filters to quickly find specific requests.

### 3. Edit and replay

- Click the **✎ Edit** button on a selected request.
- Modify any of the following:
  - **URL** – change the endpoint directly.
  - **Method** – switch between GET, POST, PUT, etc.
  - **Params** – add, edit, or remove query parameters.
  - **Auth** – set Basic, Bearer, or OAuth 2.0 credentials.
  - **Headers** – add, remove, or modify request headers.
  - **Body** – choose from `raw` (with JSON/XML/Text), `form-data`, or `x-www-form-urlencoded`.
- Click **▶ Send** to replay the modified request.
- The new response will appear in the **Response** tab.

### 4. Copy as cURL

- Click **📋 Copy cURL** to copy a `curl` command that exactly replicates the request (including cookies via `-b`).

### 5. Add notes

- Each request has a **Note** field where you can write comments, todos, or observations. Notes are saved automatically.

---

## 🧱 Architecture

BrutuSuite consists of three main components:

| Component       | File          | Role |
|-----------------|---------------|------|
| **Background Service Worker** | `background.js` | Uses the Chrome `debugger` API to capture network events (`Network.requestWillBeSent`, `Network.responseReceived`), merges headers from `ExtraInfo`, and fetches cookies via the `cookies` API if missing. Stores logs in `chrome.storage.local`. |
| **DevTools Panel** | `panel.html`, `panel.js`, `panel.css` | The UI that displays the list of requests, detailed inspection, and edit/replay interface. Communicates with the background script via `chrome.runtime.sendMessage` to attach/detach and clear logs. |
| **DevTools Entry** | `devtools.js`, `devtools.html` | Creates the BrutuSuite panel in Chrome DevTools. |

Data flow:

1. Background script intercepts network requests from the attached tab.
2. Logs are stored in `chrome.storage.local`.
3. The panel reads the logs and renders them.
4. When the user edits and sends a request, the panel uses the `fetch` API directly (from the DevTools context) to replay the request, applying any modifications.

---

## 🤝 Contributing

Contributions are welcome! Whether you want to report a bug, suggest a feature, or submit a pull request, please follow these steps:

1. **Fork** the repository.
2. **Create a new branch** for your feature/fix:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes** with clear messages.
4. **Push** to your fork.
5. Open a **Pull Request** describing your changes.

Please ensure your code follows the existing style and includes comments where necessary.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 🙏 Acknowledgements

- Built with the Chrome Extensions API.
- Icons from the Material Design library.
- Inspired by tools like Postman, Insomnia, and Burp Suite.
  
> **Fun fact:** "Brutu" is Javanese for the chicken's tail. It has a cult following because it's unexpectedly delicious. Hopefully, this extension becomes as beloved as its namesake. 😆

---

**Enjoy hacking with BrutuSuite!** 🧪