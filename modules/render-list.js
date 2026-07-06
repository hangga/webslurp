// modules/render-list.js
import {
  logs, selectedId, setSelectedId, setEditingId, setActiveTab, setActiveSubTab,
  logListEl, countBadge, statusText, statusCount,
  searchInput, filterMethod, filterStatus, filterContent
} from './state.js';
import { escapeHtml, statusClass } from './utils.js';
import { loadLogs } from './storage.js';
import { renderDetail } from './render-detail.js';

export function filterLogs() {
  const keyword = searchInput.value.toLowerCase().trim();
  const method = filterMethod.value;
  const status = filterStatus.value;
  const content = filterContent.value.toLowerCase().trim();

  return logs.filter(log => {
    if (keyword && !log.url.toLowerCase().includes(keyword)) return false;
    if (method && log.method !== method) return false;
    if (status) {
      const code = log.status;
      if (status === '2xx' && (code < 200 || code >= 300)) return false;
      if (status === '3xx' && (code < 300 || code >= 400)) return false;
      if (status === '4xx' && (code < 400 || code >= 500)) return false;
      if (status === '5xx' && (code < 500 || code >= 600)) return false;
    }
    if (content) {
      const haystack = (log.url + ' ' + (log.requestBody || '') + ' ' + (log.response || '')).toLowerCase();
      if (!haystack.includes(content)) return false;
    }
    return true;
  });
}

export function renderList() {
  const filtered = filterLogs();
  countBadge.textContent = filtered.length;
  statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  logListEl.innerHTML = '';
  filtered.forEach((log, idx) => {
    const realIdx = logs.indexOf(log);
    const entry = document.createElement('div');
    const sc = statusClass(log.status);
    entry.className = `log-entry ${sc}${selectedId === realIdx ? ' active' : ''}`;
    if (log.note) entry.classList.add('has-note');

    entry.innerHTML = `
      <span class="status ${sc}">${log.status}</span>
      <span class="method">${log.method || 'GET'}</span>
      <span class="url">${escapeHtml(log.url)}</span>
      ${log.note ? `<span class="note-icon">📝</span>` : ''}
      <span class="time">${log.time || ''}</span>
    `;
    entry.addEventListener('click', () => selectLog(realIdx));
    logListEl.appendChild(entry);
  });

  if (logs.length === 0) {
    statusText.textContent = 'Listening…';
  } else {
    statusText.textContent = `Showing ${filtered.length} of ${logs.length}`;
  }
}

export function selectLog(idx) {
  if (idx === null || idx >= logs.length) {
    setSelectedId(null);
    document.getElementById('detail-empty').style.display = 'block';
    document.getElementById('detail-content').style.display = 'none';
    renderList();
    return;
  }
  setSelectedId(idx);
  setEditingId(null);
  setActiveTab('request');
  setActiveSubTab('params');
  renderList();
  renderDetail(idx);
}

export async function refresh() {
  await loadLogs();
  renderList();
  if (selectedId !== null && !logs[selectedId]) {
    setSelectedId(null);
  }
  if (selectedId !== null) {
    renderDetail(selectedId);
  } else if (logs.length > 0) {
    selectLog(0);
  } else {
    document.getElementById('detail-empty').style.display = 'block';
    document.getElementById('detail-content').style.display = 'none';
  }
}

// Event listeners
searchInput.addEventListener('input', renderList);
filterMethod.addEventListener('change', renderList);
filterStatus.addEventListener('change', renderList);
filterContent.addEventListener('input', renderList);

document.getElementById('clear').onclick = async () => {
  logs.length = 0;
  setSelectedId(null);
  setEditingId(null);
  setSendingId(null);
  await saveLogs();
  renderList();
  document.getElementById('detail-empty').style.display = 'block';
  document.getElementById('detail-content').style.display = 'none';
  statusText.textContent = 'Cleared';
};

// Storage listener
import { saveLogs, loadLogs } from './storage.js';
import { ignoreStorageChange } from './state.js';
import { setSendingId } from './state.js';

chrome.storage.onChanged.addListener((changes, ns) => {
  if (ns === 'local' && changes.logs && !ignoreStorageChange) {
    refresh();
  }
});