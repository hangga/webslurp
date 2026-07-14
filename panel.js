// ── panel.js ── Entry point
import { logs, selectedId, sendingId, activeTab, activeSubTab,
         setLogs, setSelectedId, setSendingId,
         setActiveTab, setActiveSubTab, ignoreStorageChange, setIgnoreStorageChange,
         logListEl, detailEmpty, detailContent, searchInput, filterMethod,
         filterStatus, 
         countBadge, statusText, statusCount,
         divider, MAX_LOGS, loadTimeoutSetting} from './modules/state.js';
import { loadLogs, saveLogs, loadCaptureFilter, saveCaptureFilter, exportLogsToFile, importLogsFromFile  } from './modules/storage.js';
import { filterLogs } from './modules/filter.js';
import { renderList, renderDetail, setLoading } from './modules/render.js';
import { startCapture } from './modules/network.js';
import { refresh } from './modules/refresh.js';
import { theme, setTheme, captureFilter } from './modules/state.js';

const reloadBtn = document.getElementById('reload-btn');
const btnIcon = document.getElementById('btn-icon'); // atau img
// const btnSpinner = document.getElementById('btn-spinner');

const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');


// ── Resize divider ──
let isDragging = false;
divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = document.getElementById('split-view').getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = Math.min(Math.max((x / rect.width) * 100, 15), 85);
  logListEl.style.width = percentage + '%';
});
document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// ── Event listeners ──
searchInput.addEventListener('input', renderList);
filterMethod.addEventListener('change', renderList);
filterStatus.addEventListener('change', renderList);
// filterContent.addEventListener('input', renderList);

document.getElementById('clear').onclick = async () => {
  // Cek apakah ada logs
  if (logs.length === 0) {
    statusText.textContent = 'No logs to clear';
    return;
  }
  
  const confirmed = await customConfirm(
    'Are you sure you want to clear all logs?\n\nUnsaved logs will be permanently deleted. Save them to a file first if you want to keep a copy.\n\nThis action cannot be undone.'
  );

  if (!confirmed) return;
  setLogs([]);
  setSelectedId(null);
  setSendingId(null);
  await saveLogs();
  // renderList();
  document.getElementById('log-list-container').replaceChildren();
  detailEmpty.style.display = 'block';
  detailContent.style.display = 'none';
  statusText.textContent = 'Cleared';
};

chrome.storage.onChanged.addListener((changes, ns) => {
  if (ns === 'local' && changes.logs && !ignoreStorageChange) {
    refresh();
  }
});

// ── INIT ──
(async function init() {
  setLogs([]);
  saveLogs();
  await refresh();
  await loadTheme();
  await loadTimeoutSetting();
  startCapture();
  statusText.textContent = 'Listening…';
  console.log('[WebSlurp] Panel siap, menunggu request...');
})();

// ── Tema ──
const themeSelect = document.getElementById('theme-select');

function applyTheme(themeName) {
  document.body.className = 'theme-' + themeName;
  themeSelect.value = themeName;
}

async function loadTheme() {
  const result = await chrome.storage.local.get('theme');
  const saved = result.theme || 'vscode-dark';
  setTheme(saved);
  applyTheme(saved);
}

async function saveTheme(themeName) {
  await chrome.storage.local.set({ theme: themeName });
}

// Event listener untuk ganti tema
themeSelect.addEventListener('change', async (e) => {
  const newTheme = e.target.value;
  setTheme(newTheme);
  applyTheme(newTheme);
  await saveTheme(newTheme);
});

async function initCaptureFilter() {
  // setLoading(false);
  const stored = await loadCaptureFilter();
  if (stored) {
    captureFilter.mode = stored.mode;
    if (stored.custom) Object.assign(captureFilter.custom, stored.custom);
  }

  const modeSelect = document.getElementById('capture-mode');
  modeSelect.value = captureFilter.mode;

  // Set checkbox
  const c = captureFilter.custom;
  document.getElementById('filter-http-only').checked = c.httpOnly;
  document.getElementById('filter-skip-options').checked = c.skipOptions;
  document.getElementById('filter-skip-images').checked = c.skipImages;
  document.getElementById('filter-skip-css').checked = c.skipCSS;
  document.getElementById('filter-skip-js').checked = c.skipJS;
  document.getElementById('filter-skip-fonts').checked = c.skipFonts;
  document.getElementById('filter-skip-media').checked = c.skipMedia;
  document.getElementById('filter-skip-websocket').checked = c.skipWebSocket;

  updateCaptureIcons(captureFilter.mode);

  toggleCustomFilters(captureFilter.mode === 'custom');
}

function updateCaptureIcons(mode) {
  ['api', 'all', 'custom'].forEach(id => {
    document.getElementById(`img-${id}`).hidden = id !== mode;
  });
}

function toggleCustomFilters(show) {
  document.getElementById('custom-filters').classList.toggle('visible', show);
}

// Event listeners
document.getElementById('capture-mode').addEventListener('change', (e) => {
  captureFilter.mode = e.target.value;
  updateCaptureIcons(captureFilter.mode);
  toggleCustomFilters(e.target.value === 'custom');
  saveCaptureFilter(captureFilter);
});

document.querySelectorAll('#custom-filters input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    const id = cb.id;
    const key = id.replace('filter-', '');
    const map = {
      'http-only': 'httpOnly',
      'skip-options': 'skipOptions',
      'skip-images': 'skipImages',
      'skip-css': 'skipCSS',
      'skip-js': 'skipJS',
      'skip-fonts': 'skipFonts',
      'skip-media': 'skipMedia',
      'skip-websocket': 'skipWebSocket',
    };
    captureFilter.custom[map[key]] = cb.checked;
    saveCaptureFilter(captureFilter);
  });
});

reloadBtn.addEventListener('click', () => {
  // Contoh untuk lingkungan DevTools
  if (chrome.devtools && chrome.devtools.inspectedWindow) {
    chrome.devtools.inspectedWindow.reload({
        ignoreCache: true
    });
  } else {
    // Jika di popup atau content script, reload tab aktif
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  }
});

const tabId = chrome.devtools.inspectedWindow.tabId; // tersedia di DevTools

// Pantau perubahan status tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === chrome.devtools.inspectedWindow.tabId) {
    if (changeInfo.status === 'loading') {
      setLoading(true);
    } else if (changeInfo.status === 'complete') {
      setLoading(false);
    }
  }
});

function customConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    msgEl.textContent = message;
    modal.style.display = 'flex';

    const cleanup = () => {
      yesBtn.onclick = null;
      noBtn.onclick = null;
      modal.onclick = null;
    };

    yesBtn.onclick = () => {
      cleanup();
      modal.style.display = 'none';
      resolve(true);
    };

    noBtn.onclick = () => {
      cleanup();
      modal.style.display = 'none';
      resolve(false);
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        cleanup();
        modal.style.display = 'none';
        resolve(false);
      }
    };
  });
}

// Export
document.getElementById('export-btn')?.addEventListener('click', exportLogsToFile);

// Import
document.getElementById('import-btn')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importLogsFromFile(file);
      // Refresh tampilan setelah import
      renderList();
      // Tampilkan detail log pertama (jika ada)
      // if (logs.length > 0) {
      //   setSelectedId(0);
      //   renderDetail(0);
      // } else {
      //   // kosongkan detail
      //   document.getElementById('detail-content').innerHTML = '<p class="empty">No logs</p>';
      // }
    } catch (err) {
      alert('Gagal import: ' + err.message);
    }
  };
  input.click();
});

// Panggil setelah DOM siap
initCaptureFilter();