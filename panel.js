// ── State ──
let logs = [];
let selectedId = null;
let editingId = null;
let sendingId = null;
let isAttached = false;
let activeTab = 'request'; // 'request' | 'response'

// ── DOM refs ──
const logListEl = document.getElementById('log-list');
const detailEmpty = document.getElementById('detail-empty');
const detailContent = document.getElementById('detail-content');
const searchInput = document.getElementById('search');
const countBadge = document.getElementById('count-badge');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');
const divider = document.getElementById('divider');

// ── Resize divider (drag) ──
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
  activeTab = 'request';
  renderList();
  renderDetail(idx);
}

// ── Helper: escape HTML ──
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Helper: format output (JSON pretty) ──
function formatOutput(str) {
  str = String(str ?? '').trim();
  if (!str) return '';
  try {
    const pretty = JSON.stringify(JSON.parse(str), null, 2);
    return escapeHtml(pretty);
  } catch {
    return escapeHtml(str);
  }
}

// ── Helper: status class ──
function statusClass(code) {
  if (code < 300) return 'status-2xx';
  if (code < 400) return 'status-3xx';
  if (code < 500) return 'status-4xx';
  return 'status-5xx';
}

// ── Helper: headers object ↔ array ──
function headersToArray(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers).map(([k, v]) => ({ key: k, value: String(v) }));
}
function headersToObject(arr) {
  const obj = {};
  arr.forEach(({ key, value }) => {
    if (key.trim()) obj[key.trim()] = value;
  });
  return obj;
}

// ── Render detail ──
function renderDetail(idx) {
  const log = logs[idx];
  if (!log) {
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
    return;
  }

  detailEmpty.style.display = 'none';
  detailContent.style.display = 'flex';
  detailContent.className = 'active';

  const isEditing = (editingId === idx);
  const isSending = (sendingId === idx);
  const headersArr = headersToArray(log.requestHeaders || {});
  const bodyStr = log.requestBody || '';
  const responseBody = log.response || '';
  const responseHeaders = log.responseHeaders || {};

  // ── Build HTML ──
  let html = '';

  // ── Actions di atas ──
  html += `<div class="detail-actions">`;
  if (isEditing) {
    html += `<button class="btn btn-send" id="action-send" ${isSending ? 'disabled' : ''}>
      ${isSending ? '⏳ Sending...' : '▶ Send'}
    </button>
    <button class="btn btn-cancel" id="action-cancel" ${isSending ? 'disabled' : ''}>Cancel</button>`;
  } else {
    html += `<button class="btn btn-edit" id="action-edit">✎ Edit</button>
    <button class="btn btn-copy" id="action-copy">📋 Copy cURL</button>`;
  }
  // Send status
  if (isSending) {
    html += `<div class="send-status sending"><span class="spinner"></span> Sending...</div>`;
  } else if (log.sendStatus) {
    const label = log.sendStatus === 'success' ? '✅ Sent' : '❌ Failed';
    const cls = log.sendStatus === 'success' ? 'success' : 'error';
    html += `<div class="send-status ${cls}">${label}</div>`;
  }
  html += `</div>`;

  // Tabs
  html += `<div class="detail-tabs">
    <button class="detail-tab ${activeTab === 'request' ? 'active' : ''}" data-tab="request">
      Request
    </button>
    <button class="detail-tab ${activeTab === 'response' ? 'active' : ''}" data-tab="response">
      Response
      ${log.status ? `<span class="badge">${log.status}</span>` : ''}
    </button>
  </div>`;

  // ── REQUEST TAB ──
  html += `<div class="tab-panel ${activeTab === 'request' ? 'active' : ''}" data-panel="request">`;

  // Meta: method + URL
  if (isEditing) {
    html += `<div class="request-meta">
      <div class="method-wrap">
        <select id="edit-method">
          ${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m =>
            `<option value="${m}" ${m === (log.method || 'GET') ? 'selected' : ''}>${m}</option>`
          ).join('')}
        </select>
      </div>
      <div class="url-wrap">
        <input type="text" id="edit-url" value="${escapeHtml(log.url)}" />
      </div>
    </div>`;
  } else {
    const sc = log.status ? statusClass(log.status) : '';
    html += `<div class="request-meta">
      <div class="readonly-meta">
        <span class="method-label">${log.method || 'GET'}</span>
        <span class="url-label">${escapeHtml(log.url)}</span>
        ${log.status ? `<span class="status-badge ${sc}">${log.status}</span>` : ''}
      </div>
    </div>`;
  }

  // Headers
  html += `<div class="headers-section">
    <label>Headers</label>
    <div class="headers-table" id="headers-container">
      <div class="headers-row header-row">
        <span class="hkey">Key</span>
        <span class="hvalue">Value</span>
        <span class="haction"></span>
      </div>`;

  if (isEditing) {
    // Editable headers
    const rows = headersArr.length ? headersArr : [{ key: '', value: '' }];
    rows.forEach((h, i) => {
      html += `<div class="headers-row" data-hindex="${i}">
        <div class="hkey"><input class="header-key" value="${escapeHtml(h.key)}" placeholder="Key" /></div>
        <div class="hvalue"><input class="header-value" value="${escapeHtml(h.value)}" placeholder="Value" /></div>
        <div class="haction"><button class="header-remove" data-hindex="${i}" ${rows.length === 1 ? 'disabled' : ''}>×</button></div>
      </div>`;
    });
    html += `<button class="header-add" id="header-add-btn">+ Add Header</button>`;
  } else {
    // Read-only headers
    if (headersArr.length) {
      headersArr.forEach(h => {
        html += `<div class="headers-row">
          <span class="hkey readonly-key">${escapeHtml(h.key)}</span>
          <span class="hvalue readonly-value">${escapeHtml(h.value)}</span>
          <span class="haction"></span>
        </div>`;
      });
    } else {
      html += `<div class="headers-row" style="color:#666;padding:6px 10px;font-style:italic;font-size:12px;">(no headers)</div>`;
    }
  }
  html += `</div></div>`;

  // Body
  html += `<div class="body-section">
    <label>Body</label>`;
  if (isEditing) {
    const ct = (log.requestHeaders && log.requestHeaders['content-type']) || '';
    const ctLower = ct.toLowerCase();
    let suggestedType = 'text';
    if (ctLower.includes('json')) suggestedType = 'json';
    else if (ctLower.includes('xml')) suggestedType = 'xml';
    else if (ctLower.includes('form')) suggestedType = 'form';
    html += `<div class="body-meta">
      <select id="body-content-type">
        <option value="text" ${suggestedType === 'text' ? 'selected' : ''}>Text</option>
        <option value="json" ${suggestedType === 'json' ? 'selected' : ''}>JSON</option>
        <option value="xml" ${suggestedType === 'xml' ? 'selected' : ''}>XML</option>
        <option value="form" ${suggestedType === 'form' ? 'selected' : ''}>Form</option>
      </select>
    </div>
    <textarea id="edit-body" rows="5">${escapeHtml(bodyStr)}</textarea>`;
  } else {
    if (bodyStr) {
      html += `<div class="readonly-body">${formatOutput(bodyStr)}</div>`;
    } else {
      html += `<div class="readonly-body"><span class="empty-hint">(no body)</span></div>`;
    }
  }
  html += `</div>`;

  html += `</div>`; // end request panel

  // ── RESPONSE TAB ──
  html += `<div class="tab-panel ${activeTab === 'response' ? 'active' : ''}" data-panel="response">`;

  if (log.status) {
    const sc = statusClass(log.status);
    html += `<div class="response-summary">
      <span class="rstatus"><span class="code ${sc}">${log.status}</span> ${escapeHtml(log.statusText || '')}</span>
      ${log.sendDuration ? `<span class="rtime">⏱ ${log.sendDuration}ms</span>` : ''}
      ${log.response ? `<span class="rsize">📦 ${(log.response.length / 1024).toFixed(1)} KB</span>` : ''}
      <span class="rbadge">${log.mime || 'unknown'}</span>
    </div>`;

    // Response headers
    const respHeaders = headersToArray(responseHeaders);
    html += `<div class="response-headers">
      <label>Response Headers</label>
      <div class="rheaders-container">`;
    if (respHeaders.length) {
      respHeaders.forEach(h => {
        html += `<div class="rh-row">
          <span class="rh-key">${escapeHtml(h.key)}</span>
          <span class="rh-value">${escapeHtml(h.value)}</span>
        </div>`;
      });
    } else {
      html += `<div style="padding:6px 10px;color:#666;font-style:italic;font-size:12px;">(no headers)</div>`;
    }
    html += `</div></div>`;

    // Response body
    html += `<div class="response-body">
      <label>Response Body</label>
      <div class="rb-content">${responseBody ? formatOutput(responseBody) : '<span class="empty-hint">(empty)</span>'}</div>
    </div>`;
  } else {
    html += `<div style="color:#666;padding:20px 0;text-align:center;font-style:italic;">No response yet</div>`;
  }

  html += `</div>`; // end response panel

  detailContent.innerHTML = html;

  // ── Wire up events ──

  // Tabs
  detailContent.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      renderDetail(idx);
    });
  });

  // Edit
  const editBtn = detailContent.querySelector('#action-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      editingId = idx;
      renderDetail(idx);
    });
  }

  // Cancel
  const cancelBtn = detailContent.querySelector('#action-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      editingId = null;
      renderDetail(idx);
    });
  }

  // Send
  const sendBtn = detailContent.querySelector('#action-send');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendRequest(idx));
  }

  // Copy cURL
  const copyBtn = detailContent.querySelector('#action-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyAsCurl(idx));
  }

  // Header add
  const addBtn = detailContent.querySelector('#header-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const container = document.getElementById('headers-container');
      // find last row index
      const rows = container.querySelectorAll('.headers-row:not(.header-row)');
      const idx2 = rows.length;
      const row = document.createElement('div');
      row.className = 'headers-row';
      row.dataset.hindex = idx2;
      row.innerHTML = `
        <div class="hkey"><input class="header-key" placeholder="Key" /></div>
        <div class="hvalue"><input class="header-value" placeholder="Value" /></div>
        <div class="haction"><button class="header-remove" data-hindex="${idx2}">×</button></div>
      `;
      // insert before the add button
      container.insertBefore(row, addBtn);
      // enable all remove buttons
      container.querySelectorAll('.header-remove').forEach(b => b.disabled = false);
    });
  }

  // Header remove (event delegation)
  const headersContainer = detailContent.querySelector('#headers-container');
  if (headersContainer) {
    headersContainer.addEventListener('click', (e) => {
      const rmBtn = e.target.closest('.header-remove');
      if (!rmBtn) return;
      const row = rmBtn.closest('.headers-row');
      if (!row) return;
      const rows = headersContainer.querySelectorAll('.headers-row:not(.header-row)');
      if (rows.length <= 1) return; // keep at least one
      row.remove();
      // update indices
      headersContainer.querySelectorAll('.headers-row:not(.header-row)').forEach((r, i) => {
        r.dataset.hindex = i;
        const btn = r.querySelector('.header-remove');
        if (btn) btn.dataset.hindex = i;
      });
    });
  }
}

// ── Send request ──
async function sendRequest(idx) {
  if (sendingId !== null) return;
  const log = logs[idx];
  if (!log) return;

  // Gather values from UI
  const urlInput = document.getElementById('edit-url');
  const methodSelect = document.getElementById('edit-method');
  const bodyTextarea = document.getElementById('edit-body');
  const ctSelect = document.getElementById('body-content-type');

  let url = urlInput ? urlInput.value : log.url;
  let method = methodSelect ? methodSelect.value : (log.method || 'GET');
  let body = bodyTextarea ? bodyTextarea.value : (log.requestBody || '');

  // Gather headers from table
  const headerRows = document.querySelectorAll('#headers-container .headers-row:not(.header-row)');
  const headersArr = [];
  headerRows.forEach(row => {
    const keyInput = row.querySelector('.header-key');
    const valInput = row.querySelector('.header-value');
    if (keyInput && valInput && keyInput.value.trim()) {
      headersArr.push({ key: keyInput.value.trim(), value: valInput.value });
    }
  });
  const headers = headersToObject(headersArr);

  // If body is JSON and content-type not set, add it
  if (ctSelect) {
    const ct = ctSelect.value;
    if (ct === 'json' && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    } else if (ct === 'xml' && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/xml';
    } else if (ct === 'form' && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

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

    // Capture response headers
    const respHeaders = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });

    const newLog = {
      ...log,
      url,
      method,
      requestHeaders: headers,
      requestBody: body,
      response: responseBody,
      responseHeaders: respHeaders,
      status: response.status,
      statusText: response.statusText,
      time: new Date().toLocaleTimeString(),
      sendStatus: response.ok ? 'success' : 'error',
      sendDuration: elapsed,
      mime: response.headers.get('content-type') || '',
    };
    logs[idx] = newLog;
    await chrome.storage.local.set({ logs });
    sendingId = null;
    selectedId = idx;
    activeTab = 'response'; // switch to response tab after send
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
document.getElementById('search').addEventListener('input', refresh);

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