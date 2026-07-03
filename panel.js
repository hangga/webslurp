let logs = [];
let selectedId = null;
let editingId = null;
let sendingId = null;
let isAttached = false;
let activeTab = 'request'; // 'request' | 'response'
let activeSubTab = 'params'; // 'params' | 'auth' | 'headers' | 'body'

// ── DOM refs ──
const logListEl = document.getElementById('log-list');
const detailEmpty = document.getElementById('detail-empty');
const detailContent = document.getElementById('detail-content');
const searchInput = document.getElementById('search');
const filterMethod = document.getElementById('filter-method');
const filterStatus = document.getElementById('filter-status');
const filterContent = document.getElementById('filter-content');
const countBadge = document.getElementById('count-badge');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');
const divider = document.getElementById('divider');

// ── Resize divider ──
let isDragging = false;

let ignoreStorageChange = false;

async function saveLogs() {
  ignoreStorageChange = true;
  try {
    await chrome.storage.local.set({ logs });
  } finally {
    ignoreStorageChange = false;
  }
}

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

// ── Helper functions ──
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function statusClass(code) {
  if (code < 300) return 'status-2xx';
  if (code < 400) return 'status-3xx';
  if (code < 500) return 'status-4xx';
  return 'status-5xx';
}

// ── headersToArray: support object & array ──
function headersToArray(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) {
    return headers.map(h => ({
      key: h.name || h.key || '',
      value: String(h.value || '')
    }));
  }
  return Object.entries(headers).map(([k, v]) => ({
    key: k,
    value: String(v)
  }));
}

function headersToObject(arr) {
  const obj = {};
  arr.forEach(({ key, value }) => {
    if (key.trim()) obj[key.trim()] = value;
  });
  return obj;
}

// ── Validasi URL ──
function ensureValidUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

// ── Bersihkan header (hapus yang tidak valid) ──
function cleanHeaders(headers) {
  // Header yang dikelola otomatis oleh browser, tidak boleh dikirim manual
  const forbidden = [
    'host', 'content-length', 'connection', 'keep-alive',
    'transfer-encoding', 'upgrade', 'via', 'proxy-connection'
  ];
  const cleaned = {};
  for (const [key, value] of Object.entries(headers)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;                      // key kosong
    if (trimmedKey.startsWith(':')) continue;      // pseudo-header (HTTP/2)
    if (/[\s:]/.test(trimmedKey)) continue;        // mengandung spasi atau titik dua
    const lowerKey = trimmedKey.toLowerCase();
    if (forbidden.includes(lowerKey)) continue;
    const val = (value !== undefined && value !== null) ? String(value) : '';
    cleaned[trimmedKey] = val;
  }
  return cleaned;
}

// ── Filter logs ──
function filterLogs() {
  const keyword = searchInput.value.toLowerCase().trim();
  const method = filterMethod.value;
  const status = filterStatus.value;
  const content = filterContent.value.toLowerCase().trim();

  return logs.filter(log => {
    // URL filter
    if (keyword && !log.url.toLowerCase().includes(keyword)) return false;
    // Method filter
    if (method && log.method !== method) return false;
    // Status filter
    if (status) {
      const code = log.status;
      if (status === '2xx' && (code < 200 || code >= 300)) return false;
      if (status === '3xx' && (code < 300 || code >= 400)) return false;
      if (status === '4xx' && (code < 400 || code >= 500)) return false;
      if (status === '5xx' && (code < 500 || code >= 600)) return false;
    }
    // Content filter (search in URL, request body, response)
    if (content) {
      const haystack = (log.url + ' ' + (log.requestBody || '') + ' ' + (log.response || '')).toLowerCase();
      if (!haystack.includes(content)) return false;
    }
    return true;
  });
}

// ── Render daftar ──
function renderList() {
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
  activeSubTab = 'params';
  renderList();
  renderDetail(idx);
}

// ── Update log property dan simpan ──
async function updateLogProperty(idx, property, value) {
  if (idx === null || idx >= logs.length) return;
  logs[idx] = { ...logs[idx], [property]: value };
  await chrome.storage.local.set({ logs });
  if (selectedId === idx) {
    renderDetail(idx);
  }
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

  // Normalisasi data (default)
  if (!log.queryParams) log.queryParams = [];
  if (!log.bodyMode) log.bodyMode = 'raw';
  if (!log.bodyRawType) log.bodyRawType = 'text';
  if (!log.formDataFields) log.formDataFields = [];
  if (!log.auth) log.auth = { type: 'none' };
  if (!log.note) log.note = '';

  let html = '';

  // ── Actions ──
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
  if (isSending) {
    html += `<div class="send-status sending"><span class="spinner"></span> Sending...</div>`;
  } else if (log.sendStatus) {
    const label = log.sendStatus === 'success' ? '✅ Sent' : '❌ Failed';
    const cls = log.sendStatus === 'success' ? 'success' : 'error';
    html += `<div class="send-status ${cls}">${label}</div>`;
  }
  html += `</div>`;

  // ── Tabs utama (Request / Response) ──
  html += `<div class="detail-tabs">
    <button class="detail-tab ${activeTab === 'request' ? 'active' : ''}" data-tab="request">
      Request
    </button>
    <button class="detail-tab ${activeTab === 'response' ? 'active' : ''}" data-tab="response">
      Response
      ${log.status ? `<span class="badge">${log.status}</span>` : ''}
    </button>
  </div>`;

  // ── REQUEST PANEL ──
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

  // Sub-tabs (hanya saat editing)
  if (isEditing) {
    html += `<div class="sub-tabs">
      <button class="sub-tab ${activeSubTab === 'params' ? 'active' : ''}" data-subtab="params">Params</button>
      <button class="sub-tab ${activeSubTab === 'auth' ? 'active' : ''}" data-subtab="auth">Auth</button>
      <button class="sub-tab ${activeSubTab === 'headers' ? 'active' : ''}" data-subtab="headers">Headers</button>
      <button class="sub-tab ${activeSubTab === 'body' ? 'active' : ''}" data-subtab="body">Body</button>
    </div>`;

    html += `<div class="sub-content">`;
    html += renderParamsSubtab(log, idx);
    html += renderAuthSubtab(log, idx);
    html += renderHeadersSubtab(log, idx);
    html += renderBodySubtab(log, idx);
    html += `</div>`;
  } else {
    // Read-only mode: tampilkan semua info secara ringkas
    html += `<div class="readonly-detail">`;
    // Headers
    const headersArr = headersToArray(log.requestHeaders || {});
    html += `<div class="ro-section"><label>Headers</label>`;
    if (headersArr.length) {
      headersArr.forEach(h => {
        html += `<div class="ro-row"><span class="ro-key">${escapeHtml(h.key)}</span><span class="ro-value">${escapeHtml(h.value)}</span></div>`;
      });
    } else {
      html += `<div class="ro-empty">(no headers)</div>`;
    }
    html += `</div>`;
    // Body
    html += `<div class="ro-section"><label>Body</label>`;
    if (log.requestBody) {
      html += `<div class="ro-body">${formatOutput(log.requestBody)}</div>`;
    } else {
      html += `<div class="ro-empty">(no body)</div>`;
    }
    html += `</div>`;
    html += `</div>`;
  }

  html += `</div>`; // end request panel

  // ── RESPONSE PANEL ──
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
    const respHeaders = headersToArray(log.responseHeaders || {});
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
      <div class="rb-content">${log.response ? formatOutput(log.response) : '<span class="empty-hint">(empty)</span>'}</div>
    </div>`;
  } else {
    html += `<div style="color:#666;padding:20px 0;text-align:center;font-style:italic;">No response yet</div>`;
  }
  html += `</div>`; // end response panel

  // ── NOTE SECTION ──
  html += `<div class="note-area">
    <label>📝 Note</label>
    <textarea id="log-note" placeholder="Add your note here...">${escapeHtml(log.note || '')}</textarea>
  </div>`;

  detailContent.innerHTML = html;

  // ── Wire up events ──

  // Tabs utama (Request / Response)
  detailContent.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
      const tabName = this.dataset.tab;
      if (tabName && tabName !== activeTab) {
        activeTab = tabName;
        renderDetail(idx);
      }
    });
  });

  // Sub-tabs
  detailContent.querySelectorAll('.sub-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
      const subTab = this.dataset.subtab;
      if (subTab && subTab !== activeSubTab) {
        activeSubTab = subTab;
        renderDetail(idx);
      }
    });
  });

  // Edit, Cancel, Send, Copy
  const editBtn = detailContent.querySelector('#action-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      editingId = idx;
      renderDetail(idx);
    });
  }
  const cancelBtn = detailContent.querySelector('#action-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      editingId = null;
      renderDetail(idx);
    });
  }
  const sendBtn = detailContent.querySelector('#action-send');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendRequest(idx));
  }
  const copyBtn = detailContent.querySelector('#action-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyAsCurl(idx));
  }

  // Note textarea auto-save
  const noteTextarea = document.getElementById('log-note');
  if (noteTextarea) {
    noteTextarea.addEventListener('input', () => {
      const newNote = noteTextarea.value;
      logs[idx].note = newNote;
      chrome.storage.local.set({ logs });
      // Update daftar jika note berubah
      renderList();
    });
  }

  if (isEditing) {
    attachSubtabEvents(idx);
  }
}

// ── Render Params Subtab ──
function renderParamsSubtab(log, idx) {
  const params = log.queryParams || [];
  let html = `<div class="sub-panel ${activeSubTab === 'params' ? 'active' : ''}" data-subpanel="params">
    <div class="params-table">
      <div class="params-row header-row">
        <span class="pkey">Key</span>
        <span class="pvalue">Value</span>
        <span class="paction"></span>
      </div>`;
  if (params.length === 0) {
    params.push({ key: '', value: '' });
  }
  params.forEach((p, i) => {
    html += `<div class="params-row" data-pindex="${i}">
      <div class="pkey"><input class="param-key" value="${escapeHtml(p.key)}" placeholder="Key" /></div>
      <div class="pvalue"><input class="param-value" value="${escapeHtml(p.value)}" placeholder="Value" /></div>
      <div class="paction"><button class="param-remove" data-pindex="${i}" ${params.length === 1 ? 'disabled' : ''}>×</button></div>
    </div>`;
  });
  html += `<button class="param-add">+ Add Parameter</button>
    </div>
    <div class="params-preview">URL preview: <span id="url-preview">${escapeHtml(buildUrlWithParams(log))}</span></div>
  </div>`;
  return html;
}

// ── Render Auth Subtab ──
function renderAuthSubtab(log, idx) {
  const auth = log.auth || { type: 'none' };
  let html = `<div class="sub-panel ${activeSubTab === 'auth' ? 'active' : ''}" data-subpanel="auth">
    <div class="auth-row">
      <label>Auth Type</label>
      <select id="auth-type">
        <option value="none" ${auth.type === 'none' ? 'selected' : ''}>None</option>
        <option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</option>
        <option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
        <option value="oauth2" ${auth.type === 'oauth2' ? 'selected' : ''}>OAuth 2.0</option>
      </select>
    </div>`;

  if (auth.type === 'basic') {
    html += `<div class="auth-fields">
      <div class="auth-row"><label>Username</label><input id="auth-basic-username" value="${escapeHtml(auth.username || '')}" /></div>
      <div class="auth-row"><label>Password</label><input id="auth-basic-password" type="password" value="${escapeHtml(auth.password || '')}" /></div>
    </div>`;
  } else if (auth.type === 'bearer') {
    html += `<div class="auth-fields">
      <div class="auth-row"><label>Token</label><input id="auth-bearer-token" value="${escapeHtml(auth.token || '')}" /></div>
    </div>`;
  } else if (auth.type === 'oauth2') {
    const grantType = auth.grantType || 'client_credentials';
    html += `<div class="auth-fields">
      <div class="auth-row"><label>Grant Type</label>
        <select id="auth-oauth2-grant">
          <option value="client_credentials" ${grantType === 'client_credentials' ? 'selected' : ''}>Client Credentials</option>
          <option value="password" ${grantType === 'password' ? 'selected' : ''}>Password Grant</option>
        </select>
      </div>
      <div class="auth-row"><label>Token URL</label><input id="auth-oauth2-tokenurl" value="${escapeHtml(auth.tokenUrl || '')}" /></div>
      <div class="auth-row"><label>Client ID</label><input id="auth-oauth2-clientid" value="${escapeHtml(auth.clientId || '')}" /></div>
      <div class="auth-row"><label>Client Secret</label><input id="auth-oauth2-clientsecret" type="password" value="${escapeHtml(auth.clientSecret || '')}" /></div>
      <div class="auth-row"><label>Scope</label><input id="auth-oauth2-scope" value="${escapeHtml(auth.scope || '')}" /></div>
      ${grantType === 'password' ? `
        <div class="auth-row"><label>Username</label><input id="auth-oauth2-username" value="${escapeHtml(auth.username || '')}" /></div>
        <div class="auth-row"><label>Password</label><input id="auth-oauth2-password" type="password" value="${escapeHtml(auth.password || '')}" /></div>
      ` : ''}
      <div class="auth-row"><label>Access Token</label><input id="auth-oauth2-accesstoken" value="${escapeHtml(auth.accessToken || '')}" /></div>
      <div class="auth-row"><button id="auth-oauth2-fetch-token" class="btn secondary">Get Access Token</button></div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── Render Headers Subtab ──
function renderHeadersSubtab(log, idx) {
  const headersArr = headersToArray(log.requestHeaders || {});
  let html = `<div class="sub-panel ${activeSubTab === 'headers' ? 'active' : ''}" data-subpanel="headers">
    <div class="headers-table" id="headers-container">
      <div class="headers-row header-row">
        <span class="hkey">Key</span>
        <span class="hvalue">Value</span>
        <span class="haction"></span>
      </div>`;
  const rows = headersArr.length ? headersArr : [{ key: '', value: '' }];
  rows.forEach((h, i) => {
    html += `<div class="headers-row" data-hindex="${i}">
      <div class="hkey"><input class="header-key" value="${escapeHtml(h.key)}" placeholder="Key" /></div>
      <div class="hvalue"><input class="header-value" value="${escapeHtml(h.value)}" placeholder="Value" /></div>
      <div class="haction"><button class="header-remove" data-hindex="${i}" ${rows.length === 1 ? 'disabled' : ''}>×</button></div>
    </div>`;
  });
  html += `<button class="header-add">+ Add Header</button>
    </div>
  </div>`;
  return html;
}

// ── Render Body Subtab ──
function renderBodySubtab(log, idx) {
  const mode = log.bodyMode || 'none';
  const rawType = log.bodyRawType || 'text';
  const formFields = log.formDataFields || [];
  let html = `<div class="sub-panel ${activeSubTab === 'body' ? 'active' : ''}" data-subpanel="body">
    <div class="body-mode-row">
      <label>Body Mode</label>
      <select id="body-mode">
        <option value="none" ${mode === 'none' ? 'selected' : ''}>None</option>
        <option value="form-data" ${mode === 'form-data' ? 'selected' : ''}>Form Data</option>
        <option value="x-www-form-urlencoded" ${mode === 'x-www-form-urlencoded' ? 'selected' : ''}>x-www-form-urlencoded</option>
        <option value="raw" ${mode === 'raw' ? 'selected' : ''}>Raw</option>
      </select>
    </div>`;

  if (mode === 'raw') {
    html += `<div class="body-raw-row">
      <label>Raw Type</label>
      <select id="body-raw-type">
        <option value="text" ${rawType === 'text' ? 'selected' : ''}>Text</option>
        <option value="json" ${rawType === 'json' ? 'selected' : ''}>JSON</option>
        <option value="xml" ${rawType === 'xml' ? 'selected' : ''}>XML</option>
      </select>
    </div>
    <div class="body-textarea-row">
      <textarea id="edit-body" rows="6">${escapeHtml(log.requestBody || '')}</textarea>
    </div>`;
  } else if (mode === 'form-data') {
    html += `<div class="form-data-fields">
      <div class="form-row header-row">
        <span class="fkey">Key</span>
        <span class="fvalue">Value</span>
        <span class="ftype">Type</span>
        <span class="faction"></span>
      </div>`;
    if (formFields.length === 0) {
      formFields.push({ key: '', value: '', type: 'text' });
    }
    formFields.forEach((f, i) => {
      const isFile = f.type === 'file';
      html += `<div class="form-row" data-findex="${i}">
        <div class="fkey"><input class="form-key" value="${escapeHtml(f.key)}" placeholder="Key" /></div>
        <div class="fvalue">${isFile ? 
          `<input class="form-file" type="file" />` : 
          `<input class="form-text" value="${escapeHtml(f.value)}" placeholder="Value" />`}
        </div>
        <div class="ftype"><select class="form-type">
          <option value="text" ${!isFile ? 'selected' : ''}>Text</option>
          <option value="file" ${isFile ? 'selected' : ''}>File</option>
        </select></div>
        <div class="faction"><button class="form-remove" data-findex="${i}" ${formFields.length === 1 ? 'disabled' : ''}>×</button></div>
      </div>`;
    });
    html += `<button class="form-add">+ Add Field</button>
    </div>`;
  } else if (mode === 'x-www-form-urlencoded') {
    html += `<div class="urlencoded-fields">
      <div class="urlencoded-row header-row">
        <span class="ukey">Key</span>
        <span class="uvalue">Value</span>
        <span class="uaction"></span>
      </div>`;
    const fields = formFields.length ? formFields : [{ key: '', value: '' }];
    fields.forEach((f, i) => {
      html += `<div class="urlencoded-row" data-uindex="${i}">
        <div class="ukey"><input class="urlencoded-key" value="${escapeHtml(f.key)}" placeholder="Key" /></div>
        <div class="uvalue"><input class="urlencoded-value" value="${escapeHtml(f.value)}" placeholder="Value" /></div>
        <div class="uaction"><button class="urlencoded-remove" data-uindex="${i}" ${fields.length === 1 ? 'disabled' : ''}>×</button></div>
      </div>`;
    });
    html += `<button class="urlencoded-add">+ Add Field</button>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── Helper: build URL with query params ──
function buildUrlWithParams(log) {
  let url = log.url || '';
  const params = log.queryParams || [];
  const qs = params.filter(p => p.key.trim()).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  if (qs) {
    const separator = url.includes('?') ? '&' : '?';
    url = url + separator + qs;
  }
  return url;
}

// ── Attach events for subtabs ──
function attachSubtabEvents(idx) {
  const log = logs[idx];
  if (!log) return;

  // ── Params ──
  const paramRows = document.querySelectorAll('.params-row:not(.header-row)');
  const paramAdd = document.querySelector('.param-add');
  const paramContainer = document.querySelector('.params-table');

  // Update params on input
  paramRows.forEach(row => {
    const keyInput = row.querySelector('.param-key');
    const valInput = row.querySelector('.param-value');
    const removeBtn = row.querySelector('.param-remove');
    const update = () => {
      const params = [];
      document.querySelectorAll('.params-row:not(.header-row)').forEach(r => {
        const k = r.querySelector('.param-key').value.trim();
        const v = r.querySelector('.param-value').value;
        if (k) params.push({ key: k, value: v });
      });
      log.queryParams = params;
      const preview = document.getElementById('url-preview');
      if (preview) preview.textContent = buildUrlWithParams(log);
      const urlInput = document.getElementById('edit-url');
      if (urlInput) {
        const newUrl = buildUrlWithParams(log);
        log.url = newUrl;
        urlInput.value = newUrl;
      }
      // chrome.storage.local.set({ logs });
      saveLogs();
    };
    if (keyInput) keyInput.addEventListener('input', update);
    if (valInput) valInput.addEventListener('input', update);
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const rows = document.querySelectorAll('.params-row:not(.header-row)');
        if (rows.length <= 1) return;
        row.remove();
        update();
      });
    }
  });

  if (paramAdd) {
    paramAdd.addEventListener('click', () => {
      const container = document.querySelector('.params-table');
      const row = document.createElement('div');
      row.className = 'params-row';
      row.innerHTML = `
        <div class="pkey"><input class="param-key" placeholder="Key" /></div>
        <div class="pvalue"><input class="param-value" placeholder="Value" /></div>
        <div class="paction"><button class="param-remove">×</button></div>
      `;
      container.insertBefore(row, paramAdd);
      container.querySelectorAll('.param-remove').forEach(b => b.disabled = false);
      attachSubtabEvents(idx);
      const keyInput = row.querySelector('.param-key');
      const valInput = row.querySelector('.param-value');
      const update = () => {
        const params = [];
        document.querySelectorAll('.params-row:not(.header-row)').forEach(r => {
          const k = r.querySelector('.param-key').value.trim();
          const v = r.querySelector('.param-value').value;
          if (k) params.push({ key: k, value: v });
        });
        log.queryParams = params;
        const preview = document.getElementById('url-preview');
        if (preview) preview.textContent = buildUrlWithParams(log);
        const urlInput = document.getElementById('edit-url');
        if (urlInput) {
          const newUrl = buildUrlWithParams(log);
          log.url = newUrl;
          urlInput.value = newUrl;
        }
        chrome.storage.local.set({ logs });
      };
      keyInput.addEventListener('input', update);
      valInput.addEventListener('input', update);
      row.querySelector('.param-remove').addEventListener('click', () => {
        const rows = document.querySelectorAll('.params-row:not(.header-row)');
        if (rows.length <= 1) return;
        row.remove();
        update();
      });
      update();
    });
  }

  // ── Auth ──
  const authType = document.getElementById('auth-type');
  if (authType) {
    authType.addEventListener('change', () => {
      log.auth.type = authType.value;
      if (authType.value === 'none') {
        log.auth = { type: 'none' };
      } else if (authType.value === 'basic') {
        log.auth = { type: 'basic', username: '', password: '' };
      } else if (authType.value === 'bearer') {
        log.auth = { type: 'bearer', token: '' };
      } else if (authType.value === 'oauth2') {
        log.auth = { type: 'oauth2', grantType: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', accessToken: '' };
      }
      chrome.storage.local.set({ logs });
      renderDetail(idx);
    });
  }

  const basicUsername = document.getElementById('auth-basic-username');
  const basicPassword = document.getElementById('auth-basic-password');
  if (basicUsername) {
    basicUsername.addEventListener('input', () => {
      log.auth.username = basicUsername.value;
      chrome.storage.local.set({ logs });
    });
  }
  if (basicPassword) {
    basicPassword.addEventListener('input', () => {
      log.auth.password = basicPassword.value;
      chrome.storage.local.set({ logs });
    });
  }

  const bearerToken = document.getElementById('auth-bearer-token');
  if (bearerToken) {
    bearerToken.addEventListener('input', () => {
      log.auth.token = bearerToken.value;
      chrome.storage.local.set({ logs });
    });
  }

  const oauth2Grant = document.getElementById('auth-oauth2-grant');
  const oauth2TokenUrl = document.getElementById('auth-oauth2-tokenurl');
  const oauth2ClientId = document.getElementById('auth-oauth2-clientid');
  const oauth2ClientSecret = document.getElementById('auth-oauth2-clientsecret');
  const oauth2Scope = document.getElementById('auth-oauth2-scope');
  const oauth2Username = document.getElementById('auth-oauth2-username');
  const oauth2Password = document.getElementById('auth-oauth2-password');
  const oauth2AccessToken = document.getElementById('auth-oauth2-accesstoken');
  const fetchTokenBtn = document.getElementById('auth-oauth2-fetch-token');

  const saveOAuth2Field = (field, value) => {
    if (!log.auth) log.auth = { type: 'oauth2' };
    log.auth[field] = value;
    chrome.storage.local.set({ logs });
  };

  if (oauth2Grant) {
    oauth2Grant.addEventListener('change', () => {
      log.auth.grantType = oauth2Grant.value;
      chrome.storage.local.set({ logs });
      renderDetail(idx);
    });
  }
  if (oauth2TokenUrl) oauth2TokenUrl.addEventListener('input', () => saveOAuth2Field('tokenUrl', oauth2TokenUrl.value));
  if (oauth2ClientId) oauth2ClientId.addEventListener('input', () => saveOAuth2Field('clientId', oauth2ClientId.value));
  if (oauth2ClientSecret) oauth2ClientSecret.addEventListener('input', () => saveOAuth2Field('clientSecret', oauth2ClientSecret.value));
  if (oauth2Scope) oauth2Scope.addEventListener('input', () => saveOAuth2Field('scope', oauth2Scope.value));
  if (oauth2Username) oauth2Username.addEventListener('input', () => saveOAuth2Field('username', oauth2Username.value));
  if (oauth2Password) oauth2Password.addEventListener('input', () => saveOAuth2Field('password', oauth2Password.value));
  if (oauth2AccessToken) oauth2AccessToken.addEventListener('input', () => saveOAuth2Field('accessToken', oauth2AccessToken.value));

  if (fetchTokenBtn) {
    fetchTokenBtn.addEventListener('click', async () => {
      const auth = log.auth;
      if (!auth.tokenUrl) {
        statusText.textContent = 'Token URL is required';
        return;
      }
      const body = new URLSearchParams();
      body.append('grant_type', auth.grantType);
      if (auth.grantType === 'client_credentials') {
        body.append('client_id', auth.clientId || '');
        body.append('client_secret', auth.clientSecret || '');
      } else if (auth.grantType === 'password') {
        body.append('username', auth.username || '');
        body.append('password', auth.password || '');
        body.append('client_id', auth.clientId || '');
        body.append('client_secret', auth.clientSecret || '');
      }
      if (auth.scope) body.append('scope', auth.scope);
      try {
        statusText.textContent = 'Fetching token...';
        const resp = await fetch(auth.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        const data = await resp.json();
        if (data.access_token) {
          auth.accessToken = data.access_token;
          if (oauth2AccessToken) oauth2AccessToken.value = data.access_token;
          statusText.textContent = 'Token obtained!';
          chrome.storage.local.set({ logs });
        } else {
          statusText.textContent = 'Error: ' + (data.error || 'No access_token');
        }
      } catch (err) {
        statusText.textContent = 'Error: ' + err.message;
      }
    });
  }

  // ── Headers ──
  const headersContainer = document.getElementById('headers-container');
  if (headersContainer) {
    headersContainer.addEventListener('click', (e) => {
      const rmBtn = e.target.closest('.header-remove');
      if (!rmBtn) return;
      const row = rmBtn.closest('.headers-row');
      if (!row) return;
      const rows = headersContainer.querySelectorAll('.headers-row:not(.header-row)');
      if (rows.length <= 1) return;
      row.remove();
      updateHeadersFromUI(idx);
    });
    const addBtn = headersContainer.querySelector('.header-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'headers-row';
        row.innerHTML = `
          <div class="hkey"><input class="header-key" placeholder="Key" /></div>
          <div class="hvalue"><input class="header-value" placeholder="Value" /></div>
          <div class="haction"><button class="header-remove">×</button></div>
        `;
        headersContainer.insertBefore(row, addBtn);
        headersContainer.querySelectorAll('.header-remove').forEach(b => b.disabled = false);
        attachHeaderEvents(row, idx);
        updateHeadersFromUI(idx);
      });
    }
    headersContainer.querySelectorAll('.headers-row:not(.header-row)').forEach(row => {
      attachHeaderEvents(row, idx);
    });
  }

  // ── Body ──
  const bodyMode = document.getElementById('body-mode');
  if (bodyMode) {
    bodyMode.addEventListener('change', () => {
      log.bodyMode = bodyMode.value;
      if (bodyMode.value === 'none') {
        log.requestBody = '';
        log.formDataFields = [];
      } else if (bodyMode.value === 'form-data') {
        log.formDataFields = log.formDataFields || [];
        if (log.formDataFields.length === 0) log.formDataFields = [{ key: '', value: '', type: 'text' }];
      } else if (bodyMode.value === 'x-www-form-urlencoded') {
        log.formDataFields = log.formDataFields || [];
        if (log.formDataFields.length === 0) log.formDataFields = [{ key: '', value: '' }];
      } else if (bodyMode.value === 'raw') {
        log.requestBody = log.requestBody || '';
      }
      chrome.storage.local.set({ logs });
      renderDetail(idx);
    });
  }

  const bodyRawType = document.getElementById('body-raw-type');
  if (bodyRawType) {
    bodyRawType.addEventListener('change', () => {
      log.bodyRawType = bodyRawType.value;
      chrome.storage.local.set({ logs });
    });
  }

  const bodyTextarea = document.getElementById('edit-body');
  if (bodyTextarea) {
    bodyTextarea.addEventListener('input', () => {
      log.requestBody = bodyTextarea.value;
      chrome.storage.local.set({ logs });
    });
  }

  const formContainer = document.querySelector('.form-data-fields');
  if (formContainer) {
    const addFormBtn = formContainer.querySelector('.form-add');
    if (addFormBtn) {
      addFormBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'form-row';
        row.innerHTML = `
          <div class="fkey"><input class="form-key" placeholder="Key" /></div>
          <div class="fvalue"><input class="form-text" placeholder="Value" /></div>
          <div class="ftype"><select class="form-type"><option value="text" selected>Text</option><option value="file">File</option></select></div>
          <div class="faction"><button class="form-remove">×</button></div>
        `;
        formContainer.insertBefore(row, addFormBtn);
        attachFormRowEvents(row, idx);
        updateFormFieldsFromUI(idx);
      });
    }
    formContainer.querySelectorAll('.form-row:not(.header-row)').forEach(row => {
      attachFormRowEvents(row, idx);
    });
    formContainer.addEventListener('click', (e) => {
      const rmBtn = e.target.closest('.form-remove');
      if (!rmBtn) return;
      const row = rmBtn.closest('.form-row');
      if (!row) return;
      const rows = formContainer.querySelectorAll('.form-row:not(.header-row)');
      if (rows.length <= 1) return;
      row.remove();
      updateFormFieldsFromUI(idx);
    });
  }

  const urlencodedContainer = document.querySelector('.urlencoded-fields');
  if (urlencodedContainer) {
    const addUrlencodedBtn = urlencodedContainer.querySelector('.urlencoded-add');
    if (addUrlencodedBtn) {
      addUrlencodedBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'urlencoded-row';
        row.innerHTML = `
          <div class="ukey"><input class="urlencoded-key" placeholder="Key" /></div>
          <div class="uvalue"><input class="urlencoded-value" placeholder="Value" /></div>
          <div class="uaction"><button class="urlencoded-remove">×</button></div>
        `;
        urlencodedContainer.insertBefore(row, addUrlencodedBtn);
        attachUrlencodedRowEvents(row, idx);
        updateUrlencodedFromUI(idx);
      });
    }
    urlencodedContainer.querySelectorAll('.urlencoded-row:not(.header-row)').forEach(row => {
      attachUrlencodedRowEvents(row, idx);
    });
    urlencodedContainer.addEventListener('click', (e) => {
      const rmBtn = e.target.closest('.urlencoded-remove');
      if (!rmBtn) return;
      const row = rmBtn.closest('.urlencoded-row');
      if (!row) return;
      const rows = urlencodedContainer.querySelectorAll('.urlencoded-row:not(.header-row)');
      if (rows.length <= 1) return;
      row.remove();
      updateUrlencodedFromUI(idx);
    });
  }

  const methodSelect = document.getElementById('edit-method');
  const urlInput = document.getElementById('edit-url');
  if (methodSelect) {
    methodSelect.addEventListener('change', () => {
      log.method = methodSelect.value;
      chrome.storage.local.set({ logs });
    });
  }
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      log.url = urlInput.value;
      chrome.storage.local.set({ logs });
      const preview = document.getElementById('url-preview');
      if (preview) preview.textContent = buildUrlWithParams(log);
    });
  }
}

function updateHeadersFromUI(idx) {
  const log = logs[idx];
  if (!log) return;
  const headers = [];
  document.querySelectorAll('#headers-container .headers-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.header-key').value.trim();
    const val = row.querySelector('.header-value').value;
    if (key) headers.push({ key, value: val });
  });
  log.requestHeaders = headersToObject(headers);
  chrome.storage.local.set({ logs });
}

function attachHeaderEvents(row, idx) {
  const keyInput = row.querySelector('.header-key');
  const valInput = row.querySelector('.header-value');
  const rmBtn = row.querySelector('.header-remove');
  if (keyInput) keyInput.addEventListener('input', () => updateHeadersFromUI(idx));
  if (valInput) valInput.addEventListener('input', () => updateHeadersFromUI(idx));
  if (rmBtn) rmBtn.addEventListener('click', () => updateHeadersFromUI(idx));
}

function updateFormFieldsFromUI(idx) {
  const log = logs[idx];
  if (!log) return;
  const fields = [];
  document.querySelectorAll('.form-data-fields .form-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.form-key').value.trim();
    const typeSelect = row.querySelector('.form-type');
    const type = typeSelect ? typeSelect.value : 'text';
    if (key) {
      if (type === 'text') {
        const val = row.querySelector('.form-text').value;
        fields.push({ key, value: val, type: 'text' });
      } else {
        const fileInput = row.querySelector('.form-file');
        const filename = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0].name : '';
        // Simpan fileObj sementara untuk dikirim (tidak disimpan di storage)
        const fileObj = fileInput && fileInput.files[0] ? fileInput.files[0] : null;
        fields.push({ key, value: filename, type: 'file', fileObj });
      }
    }
  });
  log.formDataFields = fields;
  chrome.storage.local.set({ logs });
}

function attachFormRowEvents(row, idx) {
  const keyInput = row.querySelector('.form-key');
  const valInput = row.querySelector('.form-text');
  const fileInput = row.querySelector('.form-file');
  const typeSelect = row.querySelector('.form-type');
  const rmBtn = row.querySelector('.form-remove');

  const update = () => updateFormFieldsFromUI(idx);
  if (keyInput) keyInput.addEventListener('input', update);
  if (valInput) valInput.addEventListener('input', update);
  if (fileInput) fileInput.addEventListener('change', update);
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const valueCell = row.querySelector('.fvalue');
      if (typeSelect.value === 'file') {
        valueCell.innerHTML = `<input class="form-file" type="file" />`;
        const newFile = valueCell.querySelector('.form-file');
        if (newFile) newFile.addEventListener('change', update);
      } else {
        const currentVal = row.querySelector('.form-file') ? '' : (row.querySelector('.form-text') ? row.querySelector('.form-text').value : '');
        valueCell.innerHTML = `<input class="form-text" value="${escapeHtml(currentVal)}" placeholder="Value" />`;
        const newText = valueCell.querySelector('.form-text');
        if (newText) newText.addEventListener('input', update);
      }
      update();
    });
  }
  if (rmBtn) rmBtn.addEventListener('click', update);
}

function updateUrlencodedFromUI(idx) {
  const log = logs[idx];
  if (!log) return;
  const fields = [];
  document.querySelectorAll('.urlencoded-fields .urlencoded-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.urlencoded-key').value.trim();
    const val = row.querySelector('.urlencoded-value').value;
    if (key) fields.push({ key, value: val });
  });
  log.formDataFields = fields;
  chrome.storage.local.set({ logs });
}

function attachUrlencodedRowEvents(row, idx) {
  const keyInput = row.querySelector('.urlencoded-key');
  const valInput = row.querySelector('.urlencoded-value');
  const rmBtn = row.querySelector('.urlencoded-remove');
  const update = () => updateUrlencodedFromUI(idx);
  if (keyInput) keyInput.addEventListener('input', update);
  if (valInput) valInput.addEventListener('input', update);
  if (rmBtn) rmBtn.addEventListener('click', update);
}

// ── Send request (diperbaiki) ──
async function sendRequest(idx) {
  if (sendingId !== null) return;
  const log = logs[idx];
  if (!log) return;

  const urlInput = document.getElementById('edit-url');
  const methodSelect = document.getElementById('edit-method');
  const bodyTextarea = document.getElementById('edit-body');

  let url = urlInput ? urlInput.value : log.url;
  let method = methodSelect ? methodSelect.value : (log.method || 'GET');
  let body = bodyTextarea ? bodyTextarea.value : (log.requestBody || '');

  // Kumpulkan headers dari UI
  const headersArr = [];
  document.querySelectorAll('#headers-container .headers-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.header-key').value.trim();
    const val = row.querySelector('.header-value').value;
    if (key) headersArr.push({ key, value: val });
  });
  let headers = headersToObject(headersArr);

  // Auth
  const auth = log.auth || { type: 'none' };
  if (auth.type === 'basic') {
    const creds = btoa(unescape(encodeURIComponent(`${auth.username || ''}:${auth.password || ''}`)));
    headers['Authorization'] = `Basic ${creds}`;
  } else if (auth.type === 'bearer') {
    if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'oauth2') {
    if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }

  // Bersihkan header (buang yang tidak valid)
  headers = cleanHeaders(headers);

  const mode = log.bodyMode || 'none';
  let fetchOptions = { method, headers };

  // Siapkan body berdasarkan mode
  if (mode === 'raw') {
    const rawType = log.bodyRawType || 'text';
    if (rawType === 'json' && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    } else if (rawType === 'xml' && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/xml';
    }
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }
  } else if (mode === 'form-data') {
    const formData = new FormData();
    const fields = log.formDataFields || [];
    fields.forEach(f => {
      if (f.type === 'file') {
        if (f.fileObj && f.fileObj instanceof File) {
          formData.append(f.key, f.fileObj, f.fileObj.name);
        } else if (f.value) {
          // fallback: kirim nama file sebagai string
          formData.append(f.key, f.value);
        }
      } else {
        formData.append(f.key, f.value || '');
      }
    });
    fetchOptions.body = formData;
    // Hapus Content-Type agar browser mengatur boundary
    delete headers['Content-Type'];
    delete headers['content-type'];
  } else if (mode === 'x-www-form-urlencoded') {
    const params = new URLSearchParams();
    const fields = log.formDataFields || [];
    fields.forEach(f => {
      if (f.key) params.append(f.key, f.value || '');
    });
    fetchOptions.body = params.toString();
    if (!headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  // Hapus body untuk method GET/HEAD
  if (method === 'GET' || method === 'HEAD') {
    delete fetchOptions.body;
  }

  // Update headers setelah modifikasi
  fetchOptions.headers = headers;

  // Validasi URL
  url = ensureValidUrl(url);

  // Debug (bisa dihapus setelah selesai)
  console.log('[BrutuSuite] Sending:', { url, method, headers, body: fetchOptions.body });

  sendingId = idx;
  delete log.sendStatus;
  renderDetail(idx);

  try {
    statusText.textContent = 'Sending…';
    const start = Date.now();
    const response = await fetch(url, fetchOptions);
    const elapsed = Date.now() - start;
    const responseBody = await response.text();

    const respHeaders = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });

    const newLog = {
      ...log,
      url,
      method,
      requestHeaders: headers,
      requestBody: (mode === 'form-data' || mode === 'x-www-form-urlencoded') ? '' : body,
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
    await saveLogs();
    sendingId = null;
    selectedId = idx;
    activeTab = 'response';
    renderList();
    renderDetail(idx);
    statusText.textContent = `Sent (${response.status}) in ${elapsed}ms`;
  } catch (err) {
    logs[idx] = { ...log, sendStatus: 'error', sendError: err.message };
    await saveLogs();
    sendingId = null;
    renderDetail(idx);
    statusText.textContent = `❌ Error: ${err.message}`;
    console.error('[BrutuSuite] Send error:', err);
  }
}

// ── Copy cURL dengan flag -b jika ada Cookie ──
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

// ── generateCurl dengan -b untuk Cookie ──
function generateCurl(log) {
  const method = log.method || 'GET';
  const url = log.url;
  const headers = log.requestHeaders || {};
  const body = log.requestBody || '';
  let parts = [`curl -X ${method}`];
  
  let cookieHeader = '';
  // Loop header, pisahkan Cookie
  for (const [k, v] of Object.entries(headers)) {
    const keyLower = k.toLowerCase();
    if (keyLower === 'cookie') {
      cookieHeader = v;
      continue; // skip tambahkan sebagai -H
    }
    if (keyLower === 'host') continue;
    parts.push(`-H "${k}: ${v.replace(/"/g, '\\"')}"`);
  }
  // Tambahkan -b jika ada cookie
  if (cookieHeader) {
    parts.push(`-b "${cookieHeader.replace(/"/g, '\\"')}"`);
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
searchInput.addEventListener('input', renderList);
filterMethod.addEventListener('change', renderList);
filterStatus.addEventListener('change', renderList);
filterContent.addEventListener('input', renderList);

document.getElementById('clear').onclick = async () => {
  const res = await chrome.runtime.sendMessage({ action: 'clear' });
  if (res?.success) {
    logs = [];
    selectedId = null;
    editingId = null;
    sendingId = null;
    renderList();
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
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
  if (ns === 'local' && changes.logs && !ignoreStorageChange) {
    refresh();
  }
});

// ── Init ──
(async function init() {
  await refresh();
  await autoAttach();
})();