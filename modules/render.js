import { logs, selectedId, editingId, sendingId, activeTab, activeSubTab,
         setSelectedId, setEditingId, setActiveTab, setActiveSubTab,
         logListContainer, detailEmpty, detailContent, countBadge, statusText, statusCount,
         expandedGroups, toggleGroup,
         MAX_LOGS } from './state.js';
import { escapeHtml, formatOutput, statusClass, headersToArray, headersToObject, buildUrlWithParams, bodyToJson, formatOutputPlain, highlightText } from './helpers.js';
import { saveLogs } from './storage.js';
import { filterLogs } from './filter.js';
import { attachSubtabEvents } from './events.js';
import { sendRequest, copyAsCurl } from './network.js';

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

  logListContainer.innerHTML = '';
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
        expandedGroups.delete(hostname);
      } else {
        body.classList.remove('collapsed');
        toggle.textContent = '▼  ';
        expandedGroups.add(hostname);
      }
    });
    groupDiv.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'group-body';
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
    logListContainer.appendChild(groupDiv);
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
    // Tidak perlu setEditingId
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
    renderList();
    return;
  }
  setSelectedId(idx);
  // editingId diabaikan – selalu mode edit
  setActiveTab('request');
  // setActiveSubTab('params');
  renderList();
  renderDetail(idx);
}

// ── renderDetail (selalu dalam mode edit untuk request) ──
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

  const isSending = (sendingId === idx);

  if (!log.queryParams) log.queryParams = [];
  if (!log.bodyMode) log.bodyMode = 'none';
  if (!log.bodyRawType) log.bodyRawType = 'text';
  if (!log.formDataFields) log.formDataFields = [];
  if (!log.auth) log.auth = { type: 'none' };
  if (!log.note) log.note = '';

  let html = '';

  html += `<style>
  .highlight { background-color: #ff0; color: #000; }
  .highlight.active { background-color: #ff9632; }
  .response-search-wrap { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .response-search-wrap input { flex: 1; padding: 4px 8px; }
  .search-nav { padding: 4px 8px; cursor: pointer; }
  </style>`;

  // Siapkan teks response yang sudah diformat (plain)
  const formattedText = log.response ? formatOutputPlain(log.response) : '';

  

  // ── TABS ──
  html += `<div class="detail-tabs">
    <button class="detail-tab ${activeTab === 'request' ? 'active' : ''}" data-tab="request">Request</button>
    <button class="detail-tab ${activeTab === 'response' ? 'active' : ''}" data-tab="response">Response ${log.status ? `<span class="badge">${log.status}</span>` : ''}</button>
  </div>`;

  html += `<div class="tab-panel ${activeTab === 'request' ? 'active' : ''}" data-panel="request">`;

  

  // ── Request meta (selalu editable) ──
  html += `<div class="request-meta">
    <div class="method-wrap"><select id="edit-method">${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => `<option value="${m}" ${m === (log.method || 'GET') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="url-wrap"><input type="text" id="edit-url" value="${escapeHtml(log.url)}" /></div>`;
  
  // ── ACTIONS ──
  html += `<div style="width:300px;">`;
  html += `<button class="btn btn-send" id="action-send" ${isSending ? 'disabled' : ''}>
    ${isSending ? '⏳ Sending...' : '▶ Send'}
  </button>`;
  html += `<button class="btn btn-copy" id="action-copy">📋 Copy cURL</button>`;
  if (isSending) {
    html += `<div class="send-status sending"><span class="spinner"></span> Sending...</div>`;
  } else if (log.sendStatus) {
    const label = log.sendStatus === 'success' ? '✅ Sent' : '❌ Failed';
    const cls = log.sendStatus === 'success' ? 'success' : 'error';
    html += `<div class="send-status ${cls}">${label}</div>`;
  }
  html += `</div>`;
  
  html +=`
  </div>`;

  // ── Sub-tabs (selalu ditampilkan) ──
  html += `<div class="sub-tabs">
    <button class="sub-tab ${activeSubTab === 'params' ? 'active' : ''}" data-subtab="params">Params</button>
    <button class="sub-tab ${activeSubTab === 'headers' ? 'active' : ''}" data-subtab="headers">Headers</button>
    <button class="sub-tab ${activeSubTab === 'body' ? 'active' : ''}" data-subtab="body">Body</button>
  </div>
  <div class="sub-content">
    ${renderParamsSubtab(log)}
    ${renderHeadersSubtab(log)}
    ${renderBodySubtab(log)}
  </div>`;
  
  html += `</div>`; // tutup panel request

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
    
    // ── Response Headers (expandable) ──
    html += `<div class="response-headers">
      <label style="display:flex; cursor: pointer;" id="headers-toggle">
        <span>Response Headers</span>
        <span id="headers-toggle-icon">▶</span>
      </label>
      <div class="rheaders-container" id="rheaders-container" style="max-height:0;overflow:hidden;transition:max-height 0.2s ease;">
        <div class="rh-inner">`;
    if (respHeaders.length) {
      respHeaders.forEach(h => html += `<div class="rh-row"><span class="rh-key">${escapeHtml(h.key)}</span><span class="rh-value">${escapeHtml(h.value)}</span></div>`);
    } else {
      html += `<div style="padding:6px 10px;color:#666;font-style:italic;">(no headers)</div>`;
    }
    html += `</div></div></div>`;

    const highlightedBody = highlightText(formattedText, '');

    html += `<div class="response-body">
      <label>Response Body</label>
      <div class="response-search-wrap" id="search-bar">
        <input type="text" id="response-search" placeholder="Search in body response..." />
        <span id="response-search-count"></span>
        <button id="response-search-prev" class="search-nav">◀</button>
        <button id="response-search-next" class="search-nav">▶</button>
      </div>
      <div class="rb-content" id="response-body-content">${highlightedBody}</div>
    </div>`;
  } else {
    html += `<div style="color:#666;padding:20px 0;text-align:center;font-style:italic;">No response yet</div>`;
  }
  html += `</div>`;

  // ── Note ──
  html += `<div class="note-area"><label>Note</label><textarea id="log-note" placeholder="Add your note here...">${escapeHtml(log.note || '')}</textarea></div>`;

  detailContent.innerHTML = html;

  // ── Response headers expandable toggle ──
  const headersToggle = document.getElementById('headers-toggle');
  const headersContainer = document.getElementById('rheaders-container');
  const toggleIcon = document.getElementById('headers-toggle-icon');
  let headersExpanded = false;

  if (headersToggle && headersContainer) {
    // Hitung jumlah header
    const headerRows = headersContainer.querySelectorAll('.rh-row');
    const inner = headersContainer.querySelector('.rh-inner');

    // Jika tidak ada header, sembunyikan toggle dan label
    if (headerRows.length === 0) {
      headersToggle.style.display = 'none';
      headersContainer.style.display = 'none';
    } else {
      // Default: collapsed jika > 5, expanded jika <= 5
      if (headerRows.length > 5) {
        headersExpanded = false;
        headersContainer.style.maxHeight = '0';
        toggleIcon.textContent = '▶';
      } else {
        headersExpanded = true;
        // Set max-height sesuai konten
        const height = inner ? inner.scrollHeight : 0;
        headersContainer.style.maxHeight = height + 'px';
        toggleIcon.textContent = '▼';
      }

      headersToggle.addEventListener('click', () => {
        headersExpanded = !headersExpanded;
        if (headersExpanded) {
          const innerNow = headersContainer.querySelector('.rh-inner');
          const heightNow = innerNow ? innerNow.scrollHeight : 0;
          headersContainer.style.maxHeight = heightNow + 'px';
          toggleIcon.textContent = '▼';
        } else {
          headersContainer.style.maxHeight = '0';
          toggleIcon.textContent = '▶';
        }
      });
    }
  }

  // ── Event binding ──
  detailContent.querySelectorAll('.detail-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const tabName = this.dataset.tab;
    if (tabName && tabName !== activeTab) { setActiveTab(tabName); renderDetail(idx); }
  }));
  detailContent.querySelectorAll('.sub-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const subTab = this.dataset.subtab;
    if (subTab && subTab !== activeSubTab) { setActiveSubTab(subTab); renderDetail(idx); }
  }));

  // Tombol Send
  const sendBtn = detailContent.querySelector('#action-send');
  if (sendBtn) sendBtn.addEventListener('click', () => sendRequest(idx));

  // Tombol Copy cURL
  const copyBtn = detailContent.querySelector('#action-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => copyAsCurl(idx));

  // Note
  const noteTextarea = document.getElementById('log-note');
  if (noteTextarea) noteTextarea.addEventListener('input', () => {
    logs[idx].note = noteTextarea.value;
    saveLogs();
    renderList();
  });

  // Selalu pasang event untuk subtab (update log saat input berubah)
  attachSubtabEvents(idx);

  // ── Response body search ──
  const searchInputResp = document.getElementById('response-search');
  const searchCountResp = document.getElementById('response-search-count');
  const rbContent = document.getElementById('response-body-content');
  const prevBtnResp = document.getElementById('response-search-prev');
  const nextBtnResp = document.getElementById('response-search-next');

  let currentKeyword = '';
  let currentMatches = [];
  let currentMatchIndex = -1;

  function updateHighlight(keyword) {
    currentKeyword = keyword;
    const highlighted = highlightText(formattedText, keyword);
    rbContent.innerHTML = highlighted;
    const matches = rbContent.querySelectorAll('.highlight');
    currentMatches = Array.from(matches);
    currentMatchIndex = -1;
    if (currentMatches.length > 0) {
      searchCountResp.textContent = `${currentMatches.length} matches`;
      currentMatchIndex = 0;
      currentMatches[0].classList.add('active');
      currentMatches[0].scrollIntoView({ block: 'center' });
    } else {
      searchCountResp.textContent = 'No matches';
    }
  }

  if (searchInputResp) {
    searchInputResp.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();
      updateHighlight(keyword);
    });
  }
  if (prevBtnResp) {
    prevBtnResp.addEventListener('click', () => {
      if (currentMatches.length === 0) return;
      currentMatches[currentMatchIndex]?.classList.remove('active');
      currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length;
      currentMatches[currentMatchIndex].classList.add('active');
      currentMatches[currentMatchIndex].scrollIntoView({ block: 'center' });
    });
  }
  if (nextBtnResp) {
    nextBtnResp.addEventListener('click', () => {
      if (currentMatches.length === 0) return;
      currentMatches[currentMatchIndex]?.classList.remove('active');
      currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
      currentMatches[currentMatchIndex].classList.add('active');
      currentMatches[currentMatchIndex].scrollIntoView({ block: 'center' });
    });
  }
  // Inisialisasi (tanpa keyword)
  updateHighlight('');
}

export function renderParamsSubtab(log) {
  const params = (log.queryParams || []).map(param => ({
    key: param.key ?? param.name ?? "",
    value: param.value ?? ""
  }));

  let html = `<div class="sub-panel ${activeSubTab === 'params' ? 'active' : ''}" data-subpanel="params">
    <div class="params-table">
      <div class="params-row header-row">
        <span class="pkey">Key</span>
        <span class="pvalue">Value</span>
        <span class="paction"></span>
      </div>`;

  params.forEach((p, i) => {
    html += `
      <div class="params-row" data-pindex="${i}">
        <div class="pkey">
          <input class="param-key" value="${escapeHtml(p.key)}" placeholder="Key" />
        </div>
        <div class="pvalue">
          <input class="param-value" value="${escapeHtml(p.value)}" placeholder="Value" />
        </div>
        <div class="paction">
          <button class="param-remove" data-pindex="${i}" ${params.length === 1 ? "disabled" : ""}>×</button>
        </div>
      </div>`;
  });

  html += `
      <button class="param-add">+ Add Parameter</button>
    </div>
  </div>`;

  return html;
}

// export function renderAuthSubtab(log) {
//   const auth = log.auth || { type: 'none' };
//   let html = `<div class="sub-panel ${activeSubTab === 'auth' ? 'active' : ''}" data-subpanel="auth">
//     <div class="auth-row"><label>Auth Type</label><select id="auth-type">
//       <option value="none" ${auth.type === 'none' ? 'selected' : ''}>None</option>
//       <option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</option>
//       <option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
//       <option value="oauth2" ${auth.type === 'oauth2' ? 'selected' : ''}>OAuth 2.0</option>
//     </select></div>`;
//   if (auth.type === 'basic') {
//     html += `<div class="auth-fields"><div class="auth-row"><label>Username</label><input id="auth-basic-username" value="${escapeHtml(auth.username || '')}" /></div>
//     <div class="auth-row"><label>Password</label><input id="auth-basic-password" type="password" value="${escapeHtml(auth.password || '')}" /></div></div>`;
//   } else if (auth.type === 'bearer') {
//     html += `<div class="auth-fields"><div class="auth-row"><label>Token</label><input id="auth-bearer-token" value="${escapeHtml(auth.token || '')}" /></div></div>`;
//   } else if (auth.type === 'oauth2') {
//     const grantType = auth.grantType || 'client_credentials';
//     html += `<div class="auth-fields">
//       <div class="auth-row"><label>Grant Type</label><select id="auth-oauth2-grant">
//         <option value="client_credentials" ${grantType === 'client_credentials' ? 'selected' : ''}>Client Credentials</option>
//         <option value="password" ${grantType === 'password' ? 'selected' : ''}>Password Grant</option>
//       </select></div>
//       <div class="auth-row"><label>Token URL</label><input id="auth-oauth2-tokenurl" value="${escapeHtml(auth.tokenUrl || '')}" /></div>
//       <div class="auth-row"><label>Client ID</label><input id="auth-oauth2-clientid" value="${escapeHtml(auth.clientId || '')}" /></div>
//       <div class="auth-row"><label>Client Secret</label><input id="auth-oauth2-clientsecret" type="password" value="${escapeHtml(auth.clientSecret || '')}" /></div>
//       <div class="auth-row"><label>Scope</label><input id="auth-oauth2-scope" value="${escapeHtml(auth.scope || '')}" /></div>
//       ${grantType === 'password' ? `<div class="auth-row"><label>Username</label><input id="auth-oauth2-username" value="${escapeHtml(auth.username || '')}" /></div><div class="auth-row"><label>Password</label><input id="auth-oauth2-password" type="password" value="${escapeHtml(auth.password || '')}" /></div>` : ''}
//       <div class="auth-row"><label>Access Token</label><input id="auth-oauth2-accesstoken" value="${escapeHtml(auth.accessToken || '')}" /></div>
//       <div class="auth-row"><button id="auth-oauth2-fetch-token" class="btn secondary">Get Access Token</button></div>
//     </div>`;
//   }
//   html += `</div>`;
//   return html;
// }

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
  let html = `<div class="sub-panel ${activeSubTab === 'body' ? 'active' : ''}" data-subpanel="body">
  <div class="body-textarea-row"><textarea id="edit-body" rows="6">${bodyToJson(log.requestBody) || ''}</textarea></div></div>`;
  return html;
}