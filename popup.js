// ── State ──
let logs = [];
let expandedId = null;
let editingId = null;
let isAttached = false;

// ── DOM refs ──
const logsContainer = document.getElementById('logs');
const searchInput = document.getElementById('search');
const countBadge = document.getElementById('count-badge');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');

// ── Render logs ──
async function refresh() {
  const result = await chrome.storage.local.get('logs');
  logs = result.logs || [];
  render();
}

function render() {
  const keyword = searchInput.value.toLowerCase().trim();
  const filtered = keyword
    ? logs.filter(log => log.url.toLowerCase().includes(keyword))
    : logs;

  countBadge.textContent = filtered.length;
  statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  logsContainer.innerHTML = '';
  filtered.forEach((log, idx) => {
    const realIdx = logs.indexOf(log);
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    // Summary
    const summary = document.createElement('div');
    summary.className = 'log-summary';
    const statusClass = log.status < 300 ? 'status-2xx' :
                        log.status < 400 ? 'status-3xx' :
                        log.status < 500 ? 'status-4xx' : 'status-5xx';
    summary.innerHTML = `
      <span class="status ${statusClass}">${log.status}</span>
      <span class="method">${log.method || 'GET'}</span>
      <span class="url">${log.url}</span>
      <span class="time">${log.time || ''}</span>
    `;
    summary.addEventListener('click', () => toggleExpand(realIdx));
    entry.appendChild(summary);

    // Detail
    const detail = document.createElement('div');
    detail.className = 'log-detail' + (expandedId === realIdx ? ' open' : '');
    detail.dataset.index = realIdx;
    detail.innerHTML = buildDetailContent(log, realIdx);
    entry.appendChild(detail);
    logsContainer.appendChild(entry);

    attachDetailEvents(realIdx);
  });

  if (logs.length === 0) {
    statusText.textContent = isAttached ? 'Attached, waiting for requests…' : 'Not attached';
  } else {
    statusText.textContent = `Showing ${filtered.length} of ${logs.length}`;
  }
}

function buildDetailContent(log, idx) {
  const isEditing = (editingId === idx);
  const headersStr = JSON.stringify(log.requestHeaders || {}, null, 2);
  const bodyStr = log.response || '';
  const reqBody = log.requestBody || '';

  return `
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
      <label>Request Body (if any)</label>
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
        <button class="btn btn-send" data-action="send" data-idx="${idx}">▶ Send</button>
        <button class="btn btn-cancel" data-action="cancel" data-idx="${idx}">Cancel</button>
      ` : `
        <button class="btn btn-edit" data-action="edit" data-idx="${idx}">✎ Edit</button>
        <button class="btn btn-copy" data-action="copy" data-idx="${idx}">📋 Copy cURL</button>
      `}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/\n/g,'&#10;');
}

function toggleExpand(idx) {
  if (expandedId === idx) {
    expandedId = null;
    editingId = null;
  } else {
    expandedId = idx;
    editingId = null;
  }
  render();
}

function attachDetailEvents(idx) {
  const detail = document.querySelector(`.log-detail[data-index="${idx}"]`);
  if (!detail) return;
  const sendBtn = detail.querySelector('[data-action="send"]');
  const cancelBtn = detail.querySelector('[data-action="cancel"]');
  const editBtn = detail.querySelector('[data-action="edit"]');
  const copyBtn = detail.querySelector('[data-action="copy"]');

  if (sendBtn) {
    sendBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendRequest(idx);
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editingId = null;
      render();
    });
  }
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editingId = idx;
      render();
    });
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyAsCurl(idx);
    });
  }
}

// ── Copy as cURL ──
function copyAsCurl(idx) {
  const log = logs[idx];
  if (!log) return;

  const curl = generateCurl(log);
  navigator.clipboard.writeText(curl).then(() => {
    statusText.textContent = 'cURL copied!';
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = curl;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    statusText.textContent = 'cURL copied!';
  });
}

function generateCurl(log) {
  const method = log.method || 'GET';
  const url = log.url;
  const headers = log.requestHeaders || {};
  const body = log.requestBody || '';

  let parts = [`curl -X ${method}`];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'host') continue;
    parts.push(`-H "${key}: ${value.replace(/"/g, '\\"')}"`);
  }
  if (body && method !== 'GET' && method !== 'HEAD') {
    const escapedBody = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    parts.push(`-d "${escapedBody}"`);
  }
  parts.push(`"${url}"`);
  return parts.join(' \\\n  ');
}

// ── Send request (replay) ──
async function sendRequest(idx) {
  const log = logs[idx];
  if (!log) return;

  const detail = document.querySelector(`.log-detail[data-index="${idx}"]`);
  if (!detail) return;

  const urlInput = detail.querySelector('[data-field="url"] input');
  const methodInput = detail.querySelector('[data-field="method"] input');
  const headersInput = detail.querySelector('[data-field="headers"] textarea');
  const bodyInput = detail.querySelector('[data-field="body"] textarea');

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

  try {
    statusText.textContent = 'Sending…';
    const fetchOptions = {
      method: method,
      headers: headers,
    };
    if (method !== 'GET' && method !== 'HEAD' && body) {
      fetchOptions.body = body;
    }
    const response = await fetch(url, fetchOptions);
    const responseBody = await response.text();

    const newLog = {
      ...log,
      url: url,
      method: method,
      requestHeaders: headers,
      requestBody: body,
      response: responseBody,
      status: response.status,
      statusText: response.statusText,
      time: new Date().toLocaleTimeString(),
    };
    logs[idx] = newLog;
    await chrome.storage.local.set({ logs });
    editingId = null;
    expandedId = idx;
    render();
    statusText.textContent = `Sent (${response.status})`;
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
  }
}

// ── Auto Attach ──
async function autoAttach() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      statusText.textContent = 'No active tab';
      return;
    }
    const response = await chrome.runtime.sendMessage({ 
      action: 'attach', 
      tabId: tabs[0].id 
    });
    if (response && response.success) {
      isAttached = true;
      statusText.textContent = `Attached to tab ${tabs[0].id}`;
    } else {
      isAttached = false;
      statusText.textContent = 'Attach failed';
    }
  } catch (err) {
    isAttached = false;
    statusText.textContent = `Attach error: ${err.message}`;
  }
}

// ── Event listeners ──
document.getElementById('search').onkeyup = refresh;

document.getElementById('clear').onclick = async () => {
  const response = await chrome.runtime.sendMessage({ action: 'clear' });
  if (response && response.success) {
    logs = [];
    expandedId = null;
    editingId = null;
    render();
    statusText.textContent = 'Cleared';
  } else {
    statusText.textContent = 'Clear failed';
  }
};

// Tombol Attach tetap tersedia untuk re-attach manual
document.getElementById('attach').onclick = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({ action: 'attach', tabId: tabs[0].id });
  if (response && response.success) {
    isAttached = true;
    statusText.textContent = `Attached to tab ${tabs[0].id}`;
  } else {
    isAttached = false;
    statusText.textContent = 'Attach failed';
  }
};

// ── 🔥 STORAGE ONCHANGED (TANPA POLLING) 🔥 ──
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.logs) {
    // Hanya refresh jika data logs berubah
    refresh();
  }
});

// ── Inisialisasi ──
(async function init() {
  await refresh();
  await autoAttach();
})();

// ── ❌ TIDAK ADA setInterval lagi! ──
// Ekstensi hanya akan update saat ada perubahan storage