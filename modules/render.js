import { logs, selectedId, editingId, sendingId, activeTab, activeSubTab,
         setSelectedId, setEditingId, setActiveTab, setActiveSubTab,
         logListEl, detailEmpty, detailContent, countBadge, statusText, statusCount,
         expandedGroups, toggleGroup,  // <-- import tambahan
         MAX_LOGS } from './state.js';
import { escapeHtml, formatOutput, statusClass, headersToArray, headersToObject, buildUrlWithParams, bodyToJson } from './helpers.js';
import { saveLogs } from './storage.js';
import { filterLogs } from './filter.js';
import { attachSubtabEvents } from './events.js';
import { sendRequest, copyAsCurl } from './network.js';

// ── Render list ──
// ── Render list (grouped by hostname) ──
export function renderList() {
  const filtered = filterLogs();
  countBadge.textContent = filtered.length;
  statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  // Group by hostname
  const groups = {};
  filtered.forEach(log => {
    let hostname = '';
    try {
      hostname = new URL(log.url).hostname;
    } catch {
      hostname = 'invalid';
    }
    if (!groups[hostname]) groups[hostname] = [];
    groups[hostname].push(log);
  });

  const sortedHostnames = Object.keys(groups).sort();

  logListEl.innerHTML = '';
  sortedHostnames.forEach(hostname => {
    const groupLogs = groups[hostname];
    const groupDiv = document.createElement('div');
    groupDiv.className = 'log-group';

    // Header
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `
      <span class="group-toggle">▶ </span>
      <span class="group-name">${escapeHtml(hostname)}</span>
      <span class="group-count">(${groupLogs.length})</span>
    `;
    header.addEventListener('click', () => {
      const body = groupDiv.querySelector('.group-body');
      const toggle = header.querySelector('.group-toggle');
      const isExpanded = !body.classList.contains('collapsed');
      if (isExpanded) {
        body.classList.add('collapsed');
        toggle.textContent = '▶  ';
        expandedGroups.delete(hostname);  // simpan state
      } else {
        body.classList.remove('collapsed');
        toggle.textContent = '▼  ';
        expandedGroups.add(hostname);     // simpan state
      }
    });
    groupDiv.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'group-body';
    // Terapkan state expand dari memory
    if (expandedGroups.has(hostname)) {
      body.classList.remove('collapsed');
      header.querySelector('.group-toggle').textContent = '▼ ';
    } else {
      body.classList.add('collapsed');
      header.querySelector('.group-toggle').textContent = '▶ ';
    }

    groupLogs.forEach(log => {
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
      body.appendChild(entry);
    });
    groupDiv.appendChild(body);
    logListEl.appendChild(groupDiv);
  });

  if (logs.length === 0) {
    statusText.textContent = 'Listening…';
  } else {
    statusText.textContent = `Showing ${filtered.length} of ${logs.length}`;
  }
}

// ── Select log ──
export function selectLog(idx) {
  if (idx === null || idx >= logs.length) {
    setSelectedId(null);
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
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

// ── renderDetail (lanjutan di bawah) ──
export function renderDetail(idx) {
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

  if (!log.queryParams) log.queryParams = [];
  if (!log.bodyMode) log.bodyMode = 'none';
  if (!log.bodyRawType) log.bodyRawType = 'text';
  if (!log.formDataFields) log.formDataFields = [];
  if (!log.auth) log.auth = { type: 'none' };
  if (!log.note) log.note = '';

  let html = '';

  // ── ACTIONS (tidak diubah) ──
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

  // ── TABS ──
  html += `<div class="detail-tabs">
    <button class="detail-tab ${activeTab === 'request' ? 'active' : ''}" data-tab="request">Request</button>
    <button class="detail-tab ${activeTab === 'response' ? 'active' : ''}" data-tab="response">Response ${log.status ? `<span class="badge">${log.status}</span>` : ''}</button>
  </div>`;

  html += `<div class="tab-panel ${activeTab === 'request' ? 'active' : ''}" data-panel="request">`;

  // ── Request meta (tidak diubah) ──
  if (isEditing) {
    html += `<div class="request-meta">
      <div class="method-wrap"><select id="edit-method">${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => `<option value="${m}" ${m === (log.method || 'GET') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="url-wrap"><input type="text" id="edit-url" value="${escapeHtml(log.url)}" /></div>
    </div>`;
  } else {
    const sc = log.status ? statusClass(log.status) : '';
    html += `<div class="request-meta"><div class="readonly-meta">
      <span class="method-label">${log.method || 'GET'}</span>
      <span class="url-label">${escapeHtml(log.url)}</span>
      ${log.status ? `<span class="status-badge ${sc}">${log.status}</span>` : ''}
    </div></div>`;
  }

  // ── Sub-tabs (edit mode only) ──
  if (isEditing) {
    html += `<div class="sub-tabs">
      <button class="sub-tab ${activeSubTab === 'params' ? 'active' : ''}" data-subtab="params">Params</button>
      <button class="sub-tab ${activeSubTab === 'auth' ? 'active' : ''}" data-subtab="auth">Auth</button>
      <button class="sub-tab ${activeSubTab === 'headers' ? 'active' : ''}" data-subtab="headers">Headers</button>
      <button class="sub-tab ${activeSubTab === 'body' ? 'active' : ''}" data-subtab="body">Body</button>
    </div>
    <div class="sub-content">
      ${renderParamsSubtab(log)}
      ${renderAuthSubtab(log)}
      ${renderHeadersSubtab(log)}
      ${renderBodySubtab(log)}
    </div>`;
  } else {
    // ── Readonly detail ──
    html += `<div class="readonly-detail">`;

    // ── Headers ──
    const headersArr = headersToArray(log.requestHeaders || {});
    html += `<div class="ro-section"><label>Headers</label>`;
    if (headersArr.length) {
      headersArr.forEach(h => html += `<div class="ro-row"><span class="ro-key">${escapeHtml(h.key)}</span><span class="ro-value">${escapeHtml(h.value)}</span></div>`);
    } else {
      html += `<div class="ro-empty">(no headers)</div>`;
    }
    html += `</div>`;

    // ── Query Parameters ──
    const queryParams = log.queryParams || [];
    html += `<div class="ro-section"><label>Query Parameters</label>`;
    if (queryParams.length > 0 && queryParams.some(p => p.key.trim())) {
      html += `<div class="ro-body">`;
      queryParams.forEach(p => {
        if (p.key.trim()) {
          html += `<div class="ro-row"><span class="ro-key">${escapeHtml(p.key)}</span><span class="ro-value">${escapeHtml(p.value)}</span></div>`;
        }
      });
      html += `</div>`;
    } else {
      html += `<div class="ro-empty">(no query params)</div>`;
    }
    html += `</div>`;

    // ── Body ──
    html += `<div class="ro-section"><label>Body</label>`;
    const bodyMode = log.bodyMode || 'none';
    const formFields = log.formDataFields || [];

    if (bodyMode === 'form-data') {
      if (formFields.length > 0 && formFields.some(f => f.key.trim())) {
        html += `<div class="ro-body">`;
        formFields.forEach(f => {
          if (f.key.trim()) {
            const val = f.type === 'file' ? `${escapeHtml(f.value)} (file)` : escapeHtml(f.value);
            html += `<div class="ro-row"><span class="ro-key">${escapeHtml(f.key)}</span><span class="ro-value">${val}</span></div>`;
          }
        });
        html += `</div>`;
      } else {
        html += `<div class="ro-empty">(no form-data fields)</div>`;
      }
    } else if (bodyMode === 'x-www-form-urlencoded') {
      if (formFields.length > 0 && formFields.some(f => f.key.trim())) {
        html += `<div class="ro-body">`;
        formFields.forEach(f => {
          if (f.key.trim()) {
            html += `<div class="ro-row"><span class="ro-key">${escapeHtml(f.key)}</span><span class="ro-value">${escapeHtml(f.value)}</span></div>`;
          }
        });
        html += `</div>`;
      } else {
        html += `<div class="ro-empty">(no urlencoded fields)</div>`;
      }
    } else if (bodyMode === 'raw') {
      if (log.requestBody) {
        html += `<div class="ro-body">${bodyToJson(log.requestBody)}</div>`;
      } else {
        html += `<div class="ro-empty">(no raw body)</div>`;
      }
    } else {
      html += `<div class="ro-empty">(no body)</div>`;
    }
    html += `</div>`; // tutup readonly-detail
  }
  html += `</div>`;

  // ── Response panel ──
  html += `<div class="tab-panel ${activeTab === 'response' ? 'active' : ''}" data-panel="response">`;
  
  if (log.status) {
    const sc = statusClass(log.status);
    html += `<div class="response-summary">
      <span class="rstatus"><span class="code ${sc}">${log.status}</span> ${escapeHtml(log.statusText || '')}</span>
      ${log.sendDuration ? `<span class="rtime">⏱ ${log.sendDuration}ms</span>` : ''}
      ${log.response ? `<span class="rsize">📦 ${(log.response.length / 1024).toFixed(1)} KB</span>` : ''}
      <span class="rbadge">${log.mime || 'unknown'}</span>
    </div>`;
    const respHeaders = headersToArray(log.responseHeaders || {});
    console.log('CEK-responseHeaders -----> ', log.responseHeaders)
    html += `<div class="response-headers"><label>Response Headers</label><div class="rheaders-container">`;
    if (respHeaders.length) respHeaders.forEach(h => html += `<div class="rh-row"><span class="rh-key">${escapeHtml(h.key)}</span><span class="rh-value">${escapeHtml(h.value)}</span></div>`);
    else html += `<div style="padding:6px 10px;color:#666;font-style:italic;">(no headers)</div>`;
    html += `</div></div>`;
    html += `<div class="response-body"><label>Response Body</label><div class="rb-content">${log.response ? formatOutput(log.response) : '<span class="empty-hint">(empty)</span>'}</div></div>`;
  } else {
    html += `<div style="color:#666;padding:20px 0;text-align:center;font-style:italic;">No response yet</div>`;
  }
  html += `</div>`;

  // ── Note ──
  html += `<div class="note-area"><label>📝 Note</label><textarea id="log-note" placeholder="Add your note here...">${escapeHtml(log.note || '')}</textarea></div>`;

  detailContent.innerHTML = html;

  // ── Event binding (tetap) ──
  detailContent.querySelectorAll('.detail-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const tabName = this.dataset.tab;
    if (tabName && tabName !== activeTab) { setActiveTab(tabName); renderDetail(idx); }
  }));
  detailContent.querySelectorAll('.sub-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const subTab = this.dataset.subtab;
    if (subTab && subTab !== activeSubTab) { setActiveSubTab(subTab); renderDetail(idx); }
  }));

  const editBtn = detailContent.querySelector('#action-edit');
  if (editBtn) editBtn.addEventListener('click', () => { setEditingId(idx); renderDetail(idx); });
  const cancelBtn = detailContent.querySelector('#action-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { setEditingId(null); renderDetail(idx); });
  const sendBtn = detailContent.querySelector('#action-send');
  if (sendBtn) sendBtn.addEventListener('click', () => sendRequest(idx));
  const copyBtn = detailContent.querySelector('#action-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => copyAsCurl(idx));

  const noteTextarea = document.getElementById('log-note');
  if (noteTextarea) noteTextarea.addEventListener('input', () => {
    logs[idx].note = noteTextarea.value;
    saveLogs();
    renderList();
  });

  if (isEditing) attachSubtabEvents(idx);
}

// ── Subtab render functions ──
export function renderParamsSubtab(log) {
  const params = log.queryParams || [];
  let html = `<div class="sub-panel ${activeSubTab === 'params' ? 'active' : ''}" data-subpanel="params">
    <div class="params-table"><div class="params-row header-row"><span class="pkey">Key</span><span class="pvalue">Value</span><span class="paction"></span></div>`;
  if (params.length === 0) params.push({ key: '', value: '' });
  params.forEach((p, i) => {
    html += `<div class="params-row" data-pindex="${i}">
      <div class="pkey"><input class="param-key" value="${escapeHtml(p.key)}" placeholder="Key" /></div>
      <div class="pvalue"><input class="param-value" value="${escapeHtml(p.value)}" placeholder="Value" /></div>
      <div class="paction"><button class="param-remove" data-pindex="${i}" ${params.length === 1 ? 'disabled' : ''}>×</button></div>
    </div>`;
  });
  html += `<button class="param-add">+ Add Parameter</button></div>
    <div class="params-preview">URL preview: <span id="url-preview">${escapeHtml(buildUrlWithParams(log))}</span></div>
  </div>`;
  return html;
}

export function renderAuthSubtab(log) {
  const auth = log.auth || { type: 'none' };
  let html = `<div class="sub-panel ${activeSubTab === 'auth' ? 'active' : ''}" data-subpanel="auth">
    <div class="auth-row"><label>Auth Type</label><select id="auth-type">
      <option value="none" ${auth.type === 'none' ? 'selected' : ''}>None</option>
      <option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</option>
      <option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
      <option value="oauth2" ${auth.type === 'oauth2' ? 'selected' : ''}>OAuth 2.0</option>
    </select></div>`;
  if (auth.type === 'basic') {
    html += `<div class="auth-fields"><div class="auth-row"><label>Username</label><input id="auth-basic-username" value="${escapeHtml(auth.username || '')}" /></div>
    <div class="auth-row"><label>Password</label><input id="auth-basic-password" type="password" value="${escapeHtml(auth.password || '')}" /></div></div>`;
  } else if (auth.type === 'bearer') {
    html += `<div class="auth-fields"><div class="auth-row"><label>Token</label><input id="auth-bearer-token" value="${escapeHtml(auth.token || '')}" /></div></div>`;
  } else if (auth.type === 'oauth2') {
    const grantType = auth.grantType || 'client_credentials';
    html += `<div class="auth-fields">
      <div class="auth-row"><label>Grant Type</label><select id="auth-oauth2-grant">
        <option value="client_credentials" ${grantType === 'client_credentials' ? 'selected' : ''}>Client Credentials</option>
        <option value="password" ${grantType === 'password' ? 'selected' : ''}>Password Grant</option>
      </select></div>
      <div class="auth-row"><label>Token URL</label><input id="auth-oauth2-tokenurl" value="${escapeHtml(auth.tokenUrl || '')}" /></div>
      <div class="auth-row"><label>Client ID</label><input id="auth-oauth2-clientid" value="${escapeHtml(auth.clientId || '')}" /></div>
      <div class="auth-row"><label>Client Secret</label><input id="auth-oauth2-clientsecret" type="password" value="${escapeHtml(auth.clientSecret || '')}" /></div>
      <div class="auth-row"><label>Scope</label><input id="auth-oauth2-scope" value="${escapeHtml(auth.scope || '')}" /></div>
      ${grantType === 'password' ? `<div class="auth-row"><label>Username</label><input id="auth-oauth2-username" value="${escapeHtml(auth.username || '')}" /></div><div class="auth-row"><label>Password</label><input id="auth-oauth2-password" type="password" value="${escapeHtml(auth.password || '')}" /></div>` : ''}
      <div class="auth-row"><label>Access Token</label><input id="auth-oauth2-accesstoken" value="${escapeHtml(auth.accessToken || '')}" /></div>
      <div class="auth-row"><button id="auth-oauth2-fetch-token" class="btn secondary">Get Access Token</button></div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

export function renderHeadersSubtab(log) {
  const headersArr = headersToArray(log.requestHeaders || {});
  let html = `<div class="sub-panel ${activeSubTab === 'headers' ? 'active' : ''}" data-subpanel="headers">
    <div class="headers-table" id="headers-container"><div class="headers-row header-row"><span class="hkey">Key</span><span class="hvalue">Value</span><span class="haction"></span></div>`;
  const rows = headersArr.length ? headersArr : [{ key: '', value: '' }];
  rows.forEach((h, i) => {
    html += `<div class="headers-row" data-hindex="${i}">
      <div class="hkey"><input class="header-key" value="${escapeHtml(h.key)}" placeholder="Key" /></div>
      <div class="hvalue"><input class="header-value" value="${escapeHtml(h.value)}" placeholder="Value" /></div>
      <div class="haction"><button class="header-remove" data-hindex="${i}" ${rows.length === 1 ? 'disabled' : ''}>×</button></div>
    </div>`;
  });
  html += `<button class="header-add">+ Add Header</button></div></div>`;
  return html;
}

export function renderBodySubtab(log) {
  // console.log('CEK-->renderBodySubtab->', log);
  const mode = log.bodyMode || 'none';
  const rawType = log.bodyRawType || 'text';
  const formFields = log.formDataFields || [];
  let html = `<div class="sub-panel ${activeSubTab === 'body' ? 'active' : ''}" data-subpanel="body">
    <div class="body-mode-row"><label>Body Mode</label><select id="body-mode">
      <option value="none" ${mode === 'none' ? 'selected' : ''}>None</option>
      <option value="form-data" ${mode === 'form-data' ? 'selected' : ''}>Form Data</option>
      <option value="x-www-form-urlencoded" ${mode === 'x-www-form-urlencoded' ? 'selected' : ''}>x-www-form-urlencoded</option>
      <option value="raw" ${mode === 'raw' ? 'selected' : ''}>Raw</option>
    </select></div>`;
  if (mode === 'raw') {
    console.log('CEK-->renderBodySubtab-> yak raw', log);
    html += `<div class="body-raw-row"><label>Raw Type</label><select id="body-raw-type">
      <option value="text" ${rawType === 'text' ? 'selected' : ''}>Text</option>
      <option value="json" ${rawType === 'json' ? 'selected' : ''}>JSON</option>
      <option value="xml" ${rawType === 'xml' ? 'selected' : ''}>XML</option>
    </select></div>
    <div class="body-textarea-row"><textarea id="edit-body" rows="6">${bodyToJson(log.requestBody) || ''}</textarea></div>`;
  } else if (mode === 'form-data') {
    html += `<div class="form-data-fields"><div class="form-row header-row"><span class="fkey">Key</span><span class="fvalue">Value</span><span class="ftype">Type</span><span class="faction"></span></div>`;
    if (formFields.length === 0) formFields.push({ key: '', value: '', type: 'text' });
    formFields.forEach((f, i) => {
      const isFile = f.type === 'file';
      html += `<div class="form-row" data-findex="${i}">
        <div class="fkey"><input class="form-key" value="${escapeHtml(f.key)}" placeholder="Key" /></div>
        <div class="fvalue">${isFile ? `<input class="form-file" type="file" />` : `<input class="form-text" value="${escapeHtml(f.value)}" placeholder="Value" />`}</div>
        <div class="ftype"><select class="form-type"><option value="text" ${!isFile ? 'selected' : ''}>Text</option><option value="file" ${isFile ? 'selected' : ''}>File</option></select></div>
        <div class="faction"><button class="form-remove" data-findex="${i}" ${formFields.length === 1 ? 'disabled' : ''}>×</button></div>
      </div>`;
    });
    html += `<button class="form-add">+ Add Field</button></div>`;
  } else if (mode === 'x-www-form-urlencoded') {
    html += `<div class="urlencoded-fields"><div class="urlencoded-row header-row"><span class="ukey">Key</span><span class="uvalue">Value</span><span class="uaction"></span></div>`;
    const fields = formFields.length ? formFields : [{ key: '', value: '' }];
    fields.forEach((f, i) => {
      html += `<div class="urlencoded-row" data-uindex="${i}">
        <div class="ukey"><input class="urlencoded-key" value="${escapeHtml(f.key)}" placeholder="Key" /></div>
        <div class="uvalue"><input class="urlencoded-value" value="${escapeHtml(f.value)}" placeholder="Value" /></div>
        <div class="uaction"><button class="urlencoded-remove" data-uindex="${i}" ${fields.length === 1 ? 'disabled' : ''}>×</button></div>
      </div>`;
    });
    html += `<button class="urlencoded-add">+ Add Field</button></div>`;
  }
  html += `</div>`;
  return html;
}