# BrutuSuite

<p align="center">
  <img src="logo-dark.png" width="320" alt="BrutuSuite Logo">
</p>

<p align="center">

![Version](https://img.shields.io/badge/version-1.3-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)
![Chrome](https://img.shields.io/badge/Chrome-DevTools-success)
![License](https://img.shields.io/badge/license-MIT-green)

</p>

**BrutuSuite** is a lightweight Chrome DevTools extension for inspecting, modifying, and replaying HTTP requests without leaving the browser.

Designed for developers, QA engineers, penetration testers, and bug bounty hunters, BrutuSuite brings API debugging directly into Chrome DevTools with a familiar workflow inspired by tools like Burp Suite and Postman.

---

## Preview

[![Demo](preview.gif)](https://github.com/user-attachments/assets/f1d04663-022e-4385-9243-9cd3e7988e11)

---

# Features

### Network Inspection

- Capture XHR and Fetch requests
- Inspect request and response headers
- Pretty-print JSON responses
- View response body
- View request body
- Group requests by hostname
- Search captured requests
- Filter requests quickly

### Request Editing

- Edit URL
- Edit HTTP method
- Edit query parameters
- Edit request headers
- Edit request body
- Support JSON
- Support raw text
- Support multipart/form-data
- Support x-www-form-urlencoded

### Authentication

- No Authentication
- Basic Authentication
- Bearer Token
- OAuth 2.0

### Productivity

- Copy as cURL
- Request notes
- Live URL preview
- Persistent request history
- Auto save using chrome.storage
- Dark & Light themes

---

# Why BrutuSuite?

Most API tools require switching between the browser and another application.

BrutuSuite keeps everything inside Chrome DevTools.

Instead of:

```
Browser
↓
Copy Request
↓
Open Postman
↓
Import
↓
Edit
↓
Send
```

You simply:

```
Chrome DevTools
↓
Inspect
↓
Edit
↓
Replay
```

No context switching.

No import/export.

Just faster debugging.

---

# Installation

Clone the repository

```bash
git clone https://github.com/hangga/brutusuite.git
```

Open Chrome Extensions

```
chrome://extensions
```

Enable

```
Developer Mode
```

Click

```
Load unpacked
```

Select the project directory.

Open DevTools.

A new **BrutuSuite** tab will appear.

---

# Project Structure

```
BrutuSuite
│
├── manifest.json
├── panel.html
├── panel.css
├── panel.js
├── devtools.html
├── devtools.js
│
├── icons/
│
└── modules/
    ├── state.js
    ├── helpers.js
    ├── storage.js
    ├── filter.js
    ├── render.js
    ├── events.js
    ├── network.js
    └── refresh.js
```

---

# Architecture

```
panel.js
    │
    ├──────────────┐
    │              │
state.js      storage.js
    │              │
    ├──────────────┘
    │
filter.js
    │
render.js
    │
events.js
    │
network.js
    │
refresh.js
```

---

# Module Responsibilities

## panel.js

Application entry point.

Responsible for initializing the panel and connecting every module.

---

## state.js

Stores application state.

Examples

- logs
- selected request
- active tabs
- expanded groups
- DOM references

---

## storage.js

Handles persistence using

```
chrome.storage.local
```

Functions

- saveLogs()
- loadLogs()

---

## filter.js

Responsible for filtering requests.

Supports searching by

- URL
- Method
- Status

---

## render.js

Responsible for rendering the interface.

Includes

- Request list
- Detail panel
- Request editor
- Response viewer
- Params
- Headers
- Body
- Authentication

---

## events.js

Contains UI event handlers.

Examples

- editing headers
- editing parameters
- editing form data
- updating URL preview

---

## network.js

Handles network-related operations.

Includes

- request capture
- send request
- replay request
- Copy as cURL
- body parsing

---

## refresh.js

Keeps the UI synchronized after changes.

---

# Current Capabilities

✅ Capture requests

✅ Replay requests

✅ Edit requests

✅ Copy as cURL

✅ Query parameter editor

✅ Header editor

✅ JSON formatter

✅ Form-data editor

✅ URL encoded editor

✅ Authentication editor

✅ Notes

✅ Request grouping

---

# Built With

- Vanilla JavaScript
- Chrome DevTools API
- Chrome Storage API
- Fetch API

No frameworks.

No build tools.

No runtime dependencies.

---

# Contributing

Pull requests are welcome.

If you'd like to improve BrutuSuite:

1. Fork the repository

2. Create a feature branch

```bash
git checkout -b feature/my-feature
```

3. Commit your changes

```bash
git commit -m "Add awesome feature"
```

4. Push

```bash
git push origin feature/my-feature
```

5. Open a Pull Request

---

# License

MIT License

---

# Inspiration

BrutuSuite is inspired by tools such as

- Burp Suite
- Postman
- Insomnia

while keeping the workflow native to Chrome DevTools.

---

<p align="center">

Made with ❤️ by Hangga Aji Sayekti

</p>