# Modul Graph

```plaintext
panel.js (Entry Point)
├── modules/state.js
│   ├── logs, selectedId, editingId, sendingId
│   ├── activeTab, activeSubTab
│   ├── expandedGroups, toggleGroup
│   ├── DOM refs (logListEl, detailEmpty, detailContent, ...)
│   └── setters (setLogs, setSelectedId, ...)
│
├── modules/storage.js
│   ├── saveLogs()
│   └── loadLogs()
│
├── modules/filter.js
│   └── filterLogs()
│
├── modules/render.js
│   ├── renderList()          → menggunakan filterLogs, helpers, state
│   ├── selectLog()           → memanggil renderList, renderDetail
│   ├── renderDetail()        → menggunakan helpers, storage, events, network
│   ├── renderParamsSubtab()
│   ├── renderAuthSubtab()
│   ├── renderHeadersSubtab()
│   └── renderBodySubtab()
│
├── modules/events.js
│   ├── attachSubtabEvents()  → menggunakan renderDetail, helpers, storage
│   ├── updateHeadersFromUI()
│   ├── updateFormFieldsFromUI()
│   ├── attachFormRowEvents()
│   ├── updateUrlencodedFromUI()
│   └── attachUrlencodedRowEvents()
│
├── modules/network.js
│   ├── startCapture()        → menggunakan renderList, renderDetail, storage
│   ├── sendRequest()         → menggunakan renderList, renderDetail, storage, helpers
│   ├── copyAsCurl()          → menggunakan generateCurl
│   └── generateCurl()
│
└── modules/refresh.js
    └── refresh()             → menggunakan storage, renderList, renderDetail, selectLog
```