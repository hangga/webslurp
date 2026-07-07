# Project Structure

```plaintext
BrutuSuite/
├── manifest.json                # Extension manifest v3
├── devtools.html                # Entry point DevTools
├── devtools.js                  # Membuat panel BrutuSuite di DevTools
├── panel.html                   # UI utama panel
├── panel.css                    # Styling dengan 18 tema (CSS variables)
├── panel.js                     # Entry point utama (orchestrator)
│
├── icons/                       # Ikon ekstensi
│   ├── icon-light-16.png
│   ├── icon-light-32.png
│   ├── icon-light-48.png
│   ├── icon-light-128.png
│   └── logo-light-prop-small.png
│
└── modules/                     # Arsitektur modular
    ├── state.js                 # State global & DOM refs
    ├── helpers.js               # Utility functions (escapeHtml, formatOutput, etc.)
    ├── storage.js               # Operasi chrome.storage (saveLogs, loadLogs)
    ├── filter.js                # Logika filtering (filterLogs)
    ├── render.js                # UI rendering (renderList, renderDetail, subtab render)
    ├── events.js                # Event handlers untuk mode edit (attachSubtabEvents, update*)
    ├── network.js               # Capture, Send, cURL generation
    └── refresh.js               # Refresh & restore state (refresh)
```