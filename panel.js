// ── State ──
let logs = [];
let selectedId = null;
let editingId = null;
let sendingId = null;
let isAttached = false;

// ── DOM refs ──
const logListEl = document.getElementById('log-list');
const detailEmpty = document.getElementById('detail-empty');
const detailContent = document.getElementById('detail-content');
const searchInput = document.getElementById('search');
const countBadge = document.getElementById('count-badge');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');

// ── Render daftar di kiri ──
function renderList() {
  const keyword = searchInput.value.toLowerCase().trim();
  const filtered = keyword
    ? logs.filter(log => log.url.toLowerCase().includes(keyword))
    : logs;

  countBadge.textContent = filtered.length;
  statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  logListEl.innerHTML = '';
  filtered.forEach((log, idx) => {
    const realIdx = logs.indexOf(log);
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (selectedId === realIdx ? ' active' : '');

    const statusClass = log.status < 300 ? 'status-2xx' :
                        log.status < 400 ? 'status-3xx' :
                        log.status < 500 ? 'status-4xx' : 'status-5xx';
    entry.innerHTML = `
      <span class="status ${statusClass}">${log.status}</span>
      <span class="method">${log.method || 'GET'}</span>
      <span class="url">${log.url}</span>
      <span class="time">${log.time || ''}</span>
    `;
    entry.addEventListener('click', () => selectLog(realIdx));
    logListEl.appendChild(entry);
  });

  if (logs.length === 0) {
    statusText.textContent = isAttached ? 'Attached, waiting…' : 'Not attached';
  } else {
    statusText.textContent = `Showing ${filtered.length} of ${logs.length}`;
  }
}

// ── Pilih log ──
function selectLog(idx) {
  if (idx === null || idx >= logs.length) {
    selectedId = null;
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
    renderList();
    return;
  }
  selectedId = idx;
  editingId = null;
  renderList();
  renderDetail(idx);
}

// ── Render detail di kanan ──
function renderDetail(idx) {
  const log = logs[idx];
  if (!log) {
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
    return;
  }

  detailEmpty.style.display = 'none';
  detailContent.style.display = 'block';

  const isEditing = (editingId === idx);
  const isSending = (sendingId === idx);
  const headersStr = JSON.stringify(log.requestHeaders || {}, null, 2);
  const bodyStr = log.response || '';
  const reqBody = log.requestBody || '';

  let sendStatusHtml = '';
  if (isSending) {
    sendStatusHtml = `<div class="send-status sending"><span class="spinner"></span> Sending...</div>`;
  } else if (log.sendStatus) {
    const label = log.sendStatus === 'success' ? '✅ Sent' : '❌ Failed';
    const cls = log.sendStatus === 'success' ? 'success' : 'error';
    sendStatusHtml = `<div class="send-status ${cls}">${label}</div>`;
  }

  detailContent.innerHTML = `
    <div class="detail-section">
      <label>URL</label>
      <div class="value ${isEditing ? 'editable' : ''}" data-field="url">
        ${isEditing ? `<input type="text" value="${escapeHtml(log.url)}" />` : escapeHtml(log.url)}
      </div>
    </div>
    <div class="detail-section">
      <label>Method</label>
      <div class="value ${isEditing ? 'editable' : ''}" data-field="method">
        ${isEditing ? `<input type="text" value="${log.method || 'GET'}" />` : (log.method || 'GET')}
      </div>
    </div>
    <div class="detail-section">
      <label>Request Headers</label>
      <div class="value ${isEditing ? 'editable' : ''}" data-field="headers">
        ${isEditing ? `<textarea rows="3">${escapeHtml(headersStr)}</textarea>` : escapeHtml(headersStr)}
      </div>
    </div>
    <div class="detail-section">
      <label>Request Body</label>
      <div class="value ${isEditing ? 'editable' : ''}" data-field="body">
        ${isEditing ? `<textarea rows="2">${escapeHtml(reqBody)}</textarea>` : (reqBody ? escapeHtml(reqBody) : '<i style="color:#666">(none)</i>')}
      </div>
    </div>
    <div class="detail-section">
      <label>Response</label>
      <div class="value" style="max-height:200px;">
        ${escapeHtml(bodyStr)}
      </div>
    </div>
    <div class="detail-actions">
      ${isEditing ? `
        <button class="btn btn-send" data-action="send" ${isSending ? 'disabled' : ''}>
          ${isSending ? '⏳ Sending...' : '▶ Send'}
        </button>
        <button class="btn btn-cancel" data-action="cancel" ${isSending ? 'disabled' : ''}>Cancel</button>
      ` : `
        <button class="btn btn-edit" data-action="edit">✎ Edit</button>
        <button class="btn btn-copy" data-action="copy">📋 Copy cURL</button>
      `}
      ${sendStatusHtml}
    </div>
  `;

  // Event listeners tombol
  detailContent.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
    editingId = idx;
    renderDetail(idx);
  });
  detailContent.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
    editingId = null;
    renderDetail(idx);
  });
  detailContent.querySelector('[data-action="send"]')?.addEventListener('click', () => {
    sendRequest(idx);
  });
  detailContent.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
    copyAsCurl(idx);
  });
}

// ── Helper ──
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/\n/g,'&#10;');
}

// ── Copy cURL ──
function copyAsCurl(idx) {
  const log = logs[idx];
  if (!log) return;
  const curl = generateCurl(log);
  navigator.clipboard.writeText(curl).then(() => {
    statusText.textContent = 'cURL copied!';
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = curl;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    statusText.textContent = 'cURL copied!';
  });
}

function generateCurl(log) {
  const method = log.method || 'GET';
  const url = log.url;
  const headers = log.requestHeaders || {};
  const body = log.requestBody || '';
  let parts = [`curl -X ${method}`];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'host') continue;
    parts.push(`-H "${k}: ${v.replace(/"/g, '\\"')}"`);
  }
  if (body && method !== 'GET' && method !== 'HEAD') {
    const escaped = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    parts.push(`-d "${escaped}"`);
  }
  parts.push(`"${url}"`);
  return parts.join(' \\\n  ');
}

// ── Send request ──
async function sendRequest(idx) {
  if (sendingId !== null) return;
  const log = logs[idx];
  if (!log) return;

  const urlInput = detailContent.querySelector('[data-field="url"] input');
  const methodInput = detailContent.querySelector('[data-field="method"] input');
  const headersInput = detailContent.querySelector('[data-field="headers"] textarea');
  const bodyInput = detailContent.querySelector('[data-field="body"] textarea');

  let url = urlInput ? urlInput.value : log.url;
  let method = methodInput ? methodInput.value : (log.method || 'GET');
  let headers = {};
  try {
    if (headersInput) headers = JSON.parse(headersInput.value);
    else headers = log.requestHeaders || {};
  } catch {
    headers = log.requestHeaders || {};
  }
  let body = bodyInput ? bodyInput.value : (log.requestBody || '');

  sendingId = idx;
  delete log.sendStatus;
  renderDetail(idx);

  try {
    statusText.textContent = 'Sending…';
    const fetchOptions = { method, headers };
    if (method !== 'GET' && method !== 'HEAD' && body) {
      fetchOptions.body = body;
    }
    const start = Date.now();
    const response = await fetch(url, fetchOptions);
    const elapsed = Date.now() - start;
    const responseBody = await response.text();

    const newLog = {
      ...log,
      url, method, requestHeaders: headers, requestBody: body,
      response: responseBody,
      status: response.status,
      statusText: response.statusText,
      time: new Date().toLocaleTimeString(),
      sendStatus: response.ok ? 'success' : 'error',
      sendDuration: elapsed,
    };
    logs[idx] = newLog;
    await chrome.storage.local.set({ logs });
    sendingId = null;
    selectedId = idx;
    renderList();
    renderDetail(idx);
    statusText.textContent = `Sent (${response.status}) in ${elapsed}ms`;
  } catch (err) {
    logs[idx] = { ...log, sendStatus: 'error', sendError: err.message };
    await chrome.storage.local.set({ logs });
    sendingId = null;
    renderDetail(idx);
    statusText.textContent = `Error: ${err.message}`;
  }
}

// ── Refresh data ──
async function refresh() {
  const result = await chrome.storage.local.get('logs');
  logs = result.logs || [];
  renderList();
  if (selectedId !== null && !logs[selectedId]) {
    selectedId = null;
  }
  if (selectedId !== null) {
    renderDetail(selectedId);
  } else if (logs.length > 0) {
    selectLog(0);
  } else {
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
  }
}

// ── Auto attach ──
async function autoAttach() {
  try {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const res = await chrome.runtime.sendMessage({ action: 'attach', tabId });
    if (res?.success) {
      isAttached = true;
      statusText.textContent = `Attached to tab ${tabId}`;
    }
  } catch (e) {
    statusText.textContent = 'Attach error';
  }
}

// ── Event listeners ──
document.getElementById('search').onkeyup = refresh;

document.getElementById('clear').onclick = async () => {
  const res = await chrome.runtime.sendMessage({ action: 'clear' });
  if (res?.success) {
    logs = [];
    selectedId = null;
    editingId = null;
    sendingId = null;
    refresh();
    statusText.textContent = 'Cleared';
  }
};

document.getElementById('attach').onclick = async () => {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  const res = await chrome.runtime.sendMessage({ action: 'attach', tabId });
  if (res?.success) {
    isAttached = true;
    statusText.textContent = `Attached to tab ${tabId}`;
  }
};

// ── Storage onChanged ──
chrome.storage.onChanged.addListener((changes, ns) => {
  if (ns === 'local' && changes.logs) {
    refresh();
  }
});

// ── Init ──
(async function init() {
  await refresh();
  await autoAttach();
})();