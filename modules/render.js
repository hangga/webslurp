// render.js
import { logs, selectedId, sendingId, activeTab, activeSubTab,
         setSelectedId, setActiveTab, setActiveSubTab,
         logListContainer, detailEmpty, detailContent, 
        //  countBadge,
          statusText, statusCount,
         expandedGroups, toggleGroup,
         MAX_LOGS, timeoutMs, setOriginalLogSnapshot } from './state.js';
import { escapeHtml, formatOutput, statusClass, headersToArray, headersToObject, 
        buildUrlWithParams, bodyToJson, formatOutputPlain, highlightText, getCategoryIcon,
        getBaseDomain, autoResizeTextarea } from './helpers.js';
import { saveLogs } from './storage.js';
import { filterLogs } from './filter.js';
import { attachSubtabEvents } from './events.js';
import { sendRequest, copyAsCurl, cancelRequest } from './network.js';

const container = document.getElementById('progress-container');
const bar = document.getElementById('progress-bar');
const stickySearch = document.getElementById('sticky-search');
const expandedSubGroups = new Set();

const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
const severityIcons = {
    info: 'ℹ️',
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴'
  };

// --- Batasi jumlah tampilan untuk mencegah hang ---
const MAX_DISPLAY_LOGS = 200;
let delegationInitialized = false;

// ============================================================
// KOMBINASI TEMUAN KEAMANAN
// ============================================================

function getCombinedSecurityInfo(log) {
  const findings = log.securityFindings || [];
  const sensitive = log.sensitiveTypes || { pii: [], secrets: [] };
  const hasSensitive = log.hasSensitiveData || false;

  let combined = [];

  // Temuan dari analyzeSecurityHeaders
  findings.forEach(f => combined.push({ ...f }));

  // Tambahkan temuan dari detectSensitiveData
  if (hasSensitive) {
    if (sensitive.pii && sensitive.pii.length > 0) {
      combined.push({
        type: 'pii',
        severity: 'medium',
        icon: '👤',
        message: `PII detected: ${sensitive.pii.join(', ')}`
      });
    }
    if (sensitive.secrets && sensitive.secrets.length > 0) {
      combined.push({
        type: 'secrets',
        severity: 'high',
        icon: '🔑',
        message: `Secrets detected: ${sensitive.secrets.join(', ')}`
      });
    }
  }

  // Cari temuan dengan severity tertinggi
  let highest = null;
  let highestIndex = -1;
  combined.forEach((item, idx) => {
    const sevIndex = severityOrder.indexOf(item.severity);
    if (sevIndex > highestIndex) {
      highestIndex = sevIndex;
      highest = item;
    }
  });

  return { highest, all: combined };
}

// ── Event delegation: pasang sekali di container ──
export function initDelegation() {
  if (delegationInitialized) return;
  if (!logListContainer) return;

  logListContainer.addEventListener('click', function(e) {
    // 1. Klik pada log entry
    const entry = e.target.closest('.log-entry');
    if (entry) {
      const idx = entry.dataset.index;
      if (idx !== undefined) {
        selectLog(parseInt(idx, 10));
      }
      return;
    }

    // 2. Klik pada header grup (domain atau subdomain)
    const header = e.target.closest('.group-header');
    if (header) {
      // Tentukan apakah itu domain header atau sub-header
      const domain = header.dataset.domain;
      const subKey = header.dataset.subkey;

      if (domain && !subKey) {
        // Header domain utama
        const groupDiv = header.closest('.log-group');
        const body = groupDiv?.querySelector('.group-body');
        const toggle = header.querySelector('.group-toggle');
        if (body && toggle) {
          const isExpanded = !body.classList.contains('collapsed');
          if (isExpanded) {
            body.classList.add('collapsed');
            toggle.textContent = '+  ';
            expandedGroups.delete(domain);
          } else {
            body.classList.remove('collapsed');
            toggle.textContent = '-  ';
            expandedGroups.add(domain);
          }
        }
      } else if (subKey) {
        // Header subdomain
        const subDiv = header.closest('.sub-log-group');
        const body = subDiv?.querySelector('.sub-group-body');
        const toggle = header.querySelector('.group-toggle');
        if (body && toggle) {
          const isExpanded = !body.classList.contains('collapsed');
          if (isExpanded) {
            body.classList.add('collapsed');
            toggle.textContent = '+  ';
            expandedSubGroups.delete(subKey);
          } else {
            body.classList.remove('collapsed');
            toggle.textContent = '-  ';
            expandedSubGroups.add(subKey);
          }
        }
      }
    }
  });

  delegationInitialized = true;
}

// ── Render list (grouped by hostname) ──
export function renderList(callback) {
  // Pastikan delegation terpasang
  initDelegation();
  
  const filtered = filterLogs();
  // countBadge.textContent = filtered.length;
  statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  // Batasi jumlah log yang ditampilkan (ambil N terakhir)
  let displayLogs = filtered;
  let truncated = false;
  if (displayLogs.length > MAX_DISPLAY_LOGS) {
    displayLogs = displayLogs.slice(-MAX_DISPLAY_LOGS);
    truncated = true;
  }

  // ---- 1. Kelompokkan berdasarkan domain utama ----
  const domainGroups = {};
  displayLogs.forEach(log => {
    let hostname = '';
    try {
      hostname = new URL(log.url).hostname;
    } catch {
      hostname = 'invalid';
    }
    const domain = getBaseDomain(hostname);
    if (!domainGroups[domain]) domainGroups[domain] = [];
    domainGroups[domain].push(log);
  });

  const sortedDomains = Object.keys(domainGroups).sort();
  logListContainer.innerHTML = '';

  sortedDomains.forEach(domain => {
    const domainLogs = domainGroups[domain];
    const domainDiv = document.createElement('div');
    domainDiv.className = 'log-group';
    domainDiv.dataset.domain = domain;

    // ---- Header domain utama ----
    const domainHeader = document.createElement('div');
    domainHeader.className = 'group-header';
    domainHeader.dataset.domain = domain;
    domainHeader.innerHTML = `
      <span class="group-toggle">+ </span>
      <span class="group-name">🗂️ ${escapeHtml(domain)}</span>
      <span class="group-count">(${domainLogs.length})</span>
    `;
    domainDiv.appendChild(domainHeader);

    // ---- Body domain utama ----
    const domainBody = document.createElement('div');
    domainBody.className = 'group-body';
    if (expandedGroups.has(domain)) {
      domainBody.classList.remove('collapsed');
      domainHeader.querySelector('.group-toggle').textContent = '- ';
    } else {
      domainBody.classList.add('collapsed');
      domainHeader.querySelector('.group-toggle').textContent = '+ ';
    }

    // ---- 2. Di dalam domain, kelompokkan berdasarkan hostname lengkap ----
    const hostGroups = {};
    domainLogs.forEach(log => {
      let hostname = '';
      try {
        hostname = new URL(log.url).hostname;
      } catch {
        hostname = 'invalid';
      }
      if (!hostGroups[hostname]) hostGroups[hostname] = [];
      hostGroups[hostname].push(log);
    });

    const sortedHosts = Object.keys(hostGroups).sort();
    sortedHosts.forEach(hostname => {
      const hostLogs = hostGroups[hostname];
      const subKey = `${domain}|${hostname}`;

      const subDiv = document.createElement('div');
      subDiv.className = 'sub-log-group';
      subDiv.dataset.subkey = subKey;

      // ---- Header subdomain ----
      const subHeader = document.createElement('div');
      subHeader.className = 'group-header sub-header';
      subHeader.dataset.subkey = subKey;
      subHeader.innerHTML = `
        <span class="group-toggle">+ </span>
        <span class="group-name">🗂️ ${escapeHtml(hostname)}</span>
        <span class="group-count">(${hostLogs.length})</span>
      `;
      subDiv.appendChild(subHeader);

      // ---- Body subdomain (daftar request) ----
      const subBody = document.createElement('div');
      subBody.className = 'sub-group-body';
      if (expandedSubGroups.has(subKey)) {
        subBody.classList.remove('collapsed');
        subHeader.querySelector('.group-toggle').textContent = '- ';
      } else {
        subBody.classList.add('collapsed');
        subHeader.querySelector('.group-toggle').textContent = '+ ';
      }

      hostLogs.forEach(log => {
        const realIdx = logs.indexOf(log);
        const entry = document.createElement('div');
        const sc = statusClass(log.status);
        entry.className = `log-entry ${sc}${selectedId === realIdx ? ' active' : ''}`;
        if (log.note) entry.classList.add('has-note');
        entry.dataset.index = realIdx;

        // masih PR disini
        const securityFindings = log.securityFindings || [];

        const combinedSecurity = getCombinedSecurityInfo(log);
        const highest = combinedSecurity.highest;
        const securityBadge = highest
          ? `<span class="security-badge ${highest.severity}"
                title="${escapeHtml(combinedSecurity.all.map(f => f.message).join('\n'))}">
                ${highest.icon}
              </span>`
          : '';

            // ${securityBadge}
            //${log.hasSensitiveData ? '<span class="sensitive-indicator">⚠️</span>' : ''}
        entry.innerHTML = `
          ${securityBadge? securityBadge :''}
          <span class="req-icon">${getCategoryIcon(log.category)}</span>
          ${log.hasAuth ? '<span class="auth-indicator">🔐</span>' : ''}
          
          <span class="status ${sc}">${log.status}</span>
          <span class="method">${log.method || 'GET'}</span>
          <span class="url">${escapeHtml(log.url)}</span>
          ${log.note ? '<span class="note-icon">📝</span>' : ''}
          <span class="time">${log.time || ''}</span>
        `;

        const authTitle = log.hasAuth ? '🔐 Authenticated' : '';
        const pii = log.sensitiveTypes?.pii?.length ? '👤 PII' : '';
        const secrets = log.sensitiveTypes?.secrets?.length ? '🔑 Secrets' : '';
        const sec = securityFindings.length > 0 ? securityFindings.message : '';
        entry.title = [authTitle, pii, secrets, sec].filter(Boolean).join(' • ');
        
        subBody.appendChild(entry);
      });

      subDiv.appendChild(subBody);
      domainBody.appendChild(subDiv);
    });

    domainDiv.appendChild(domainBody);
    logListContainer.appendChild(domainDiv);
  });

  // Jika ada log yang terpotong, tampilkan info
  if (truncated) {
    const info = document.createElement('div');
    info.style.cssText = 'padding:10px; text-align:center; color:#888; font-style:italic;';
    info.textContent = `Only showing last ${MAX_DISPLAY_LOGS} of ${filtered.length} requests. Use filters to narrow down.`;
    logListContainer.appendChild(info);
  }

  // Panggil callback jika diberikan
  if (callback) callback();

  // Update status text
  statusText.textContent = logs.length
    ? `Showing ${displayLogs.length} of ${logs.length} (filtered ${filtered.length})`
    : 'Listening…';
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
  renderList();
  renderDetail(idx);
}


// ── renderDetail (tidak diubah, hanya perbaikan error null di clearHighlight) ──
export function renderDetail(idx) {
  const log = logs[idx];
  if (!log) {
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
    return;
  }

  setOriginalLogSnapshot(structuredClone(log));

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

  // Siapkan teks response yang sudah diformat (plain)
  const formattedText = log.response ? formatOutputPlain(log.response) : '';
  let fullResponseText = ''; // akan diisi jika ada status

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
  
  html += `
  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
    <button class="btn btn-send" id="action-send" ${isSending ? 'disabled' : ''}>
      ${isSending ? '⏳ Sending...' : '▶ Send'}
    </button>
    ${isSending ? `<button class="btn btn-cancel" id="action-cancel">✕ Cancel</button>` : ''}
    <button class="btn btn-copy" id="action-copy">📋 Copy cURL</button>
    <div class="timeout-wrapper">
      <label for="timeout-input">Timeout (ms):</label>
      <input type="number" id="timeout-input" value="${timeoutMs}" min="1000" step="500" />
    </div>
  </div>
`;

  // Status setelah send
  if (isSending) {
    html += `<div class="send-status sending"><span class="spinner"></span> Sending...</div>`;
  } else if (log.sendStatus) {
    let label, cls;
    if (log.sendStatus === 'success') {
      label = '✅ Sent';
      cls = 'success';
    } else if (log.sendStatus === 'timeout') {
      label = '⏱ Timeout';
      cls = 'timeout';
    } else if (log.sendStatus === 'canceled') {
      label = '✕ Canceled';
      cls = 'canceled';
    } else {
      label = '❌ Failed';
      cls = 'error';
    }
    html += `<div class="send-status ${cls}">${label}</div>`;
  }
  
  html += `
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

    // --- Security Warning Box ---
    const combinedSecurity = getCombinedSecurityInfo(log);
    if (combinedSecurity.all.length > 0) {
      html += `<div class="security-warning-box">`;
      html += `<div class="sw-title">🛡️ Security Summary</div>`;
      combinedSecurity.all.forEach(f => {
        html += `<div class="sw-item">
                  <span>${f.icon || '⚠️'}</span>
                  <span>${escapeHtml(f.message)}</span>
                  <span class="sw-severity ${f.severity.toLowerCase().trim()}">${f.severity}</span>
                </div>`;
      });
      html += `</div>`;
    }
    
    const respHeaders = headersToArray(log.responseHeaders || {});

    // --- Buat teks lengkap response (status + headers + body) ---
    let statusLine = `HTTP/1.1 ${log.status} ${log.statusText || ''}`.trim();
    let headersString = respHeaders.map(h => `${h.key}: ${h.value}`).join('\r\n');
    fullResponseText = statusLine + '\r\n' + headersString + '\r\n\r\n' + formattedText;

    // Hilangkan div.response-headers, langsung tampilkan satu area response
    let sensitiveBadge = '';
    if (log.hasSensitiveData) {
      const types = [...log.sensitiveTypes.pii, ...log.sensitiveTypes.secrets];
      sensitiveBadge = `<span class="sensitive-badge">⚠️ Sensitive: ${types.join(', ')}</span>`;
    }
    
    // // ── Response Headers (expandable) ──
    // html += `<div class="response-headers">
    //   <label style="display:flex; cursor: pointer;" id="headers-toggle">
    //     <span>Response Headers</span>        
    //   </label>
    //   <div class="rheaders-container" id="rheaders-container" >
    //     <div class="rh-inner">`;
    // if (respHeaders.length) {
    //   respHeaders.forEach(h => html += `<div class="rh-row"><span class="rh-key">${escapeHtml(h.key)}</span><span class="rh-value">${escapeHtml(h.value)}</span></div>`);
    // } else {
    //   html += `<div style="padding:6px 10px;color:#666;font-style:italic;">(no headers)</div>`;
    // }
    // html += `</div></div></div>`;

    const highlightedFull = highlightText(fullResponseText, '');
    // const highlightedBody = highlightText(formattedText, '');

    // let sensitiveBadge = '';
    if (log.hasSensitiveData) {
      const types = [...log.sensitiveTypes.pii, ...log.sensitiveTypes.secrets];
      sensitiveBadge = `<span class="sensitive-badge">⚠️ Sensitive: ${types.join(', ')}</span>`;
    }
    
    html += `<div class="response-body">
    <label>Response</label>
      <div class="rb-content" id="response-body-content">${highlightedFull}</div>
    </div>`;
  } else {
    html += `<div style="color:#666;padding:20px 0;text-align:center;font-style:italic;">No response yet</div>`;
  }
  html += `</div>`;

  // ── Note ──
  html += `<div class="note-area"><label>Note</label><textarea id="log-note" placeholder="Add your note here...">${escapeHtml(log.note || '')}</textarea></div>`;

  detailContent.innerHTML = html;

  stickySearch.hidden = activeTab !== 'response';

  // ── Event binding ──
  detailContent.querySelectorAll('.detail-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const tabName = this.dataset.tab;
    if (tabName && tabName !== activeTab) { setActiveTab(tabName); renderDetail(idx); }
    stickySearch.hidden = activeTab !== 'response';
  }));
  detailContent.querySelectorAll('.sub-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const subTab = this.dataset.subtab;
    if (subTab && subTab !== activeSubTab) { setActiveSubTab(subTab); renderDetail(idx); }
  }));

  // Tombol Send
  const sendBtn = detailContent.querySelector('#action-send');
  if (sendBtn) sendBtn.addEventListener('click', () => sendRequest(idx));

  // Tombol Cancel
  const cancelBtn = detailContent.querySelector('#action-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => cancelRequest(idx));

  // Tombol Copy cURL
  const copyBtn = detailContent.querySelector('#action-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => copyAsCurl(idx));

  const timeoutInput = document.getElementById('timeout-input');
  if (timeoutInput) {
    timeoutInput.addEventListener('change', function() {
      const val = parseInt(this.value, 10);
      if (!isNaN(val) && val >= 1000) {
        import('./network.js').then(module => {
          module.updateTimeout(val);
        });
      } else {
        this.value = timeoutMs; // revert
        statusText.textContent = 'Invalid timeout';
      }
    });
  }

  // Note
  const noteTextarea = document.getElementById('log-note');
  if (noteTextarea) noteTextarea.addEventListener('input', () => {
    logs[idx].note = noteTextarea.value;
  });

  // Selalu pasang event untuk subtab (update log saat input berubah)
  attachSubtabEvents(idx);

  // ── Response body search ─────────────────────────────────────────────
  const searchInputResp = document.getElementById('response-search');
  const rbContent = document.getElementById('response-body-content');
  const prevBtnResp = document.getElementById('response-search-prev');
  const nextBtnResp = document.getElementById('response-search-next');

  let currentKeyword = '';
  let currentMatches = [];
  let currentMatchIndex = -1;

  function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function clearHighlight() {
    if (!rbContent) return;
    // rbContent.textContent = formattedText;
    rbContent.textContent = fullResponseText;  // ← menggunakan fullResponseText
    currentMatches = [];
    currentMatchIndex = -1;
    if (statusCount) statusCount.textContent = '';
  }

  function updateHighlight(keyword) {
    keyword = keyword.trim();
    if (keyword === currentKeyword) return;
    currentKeyword = keyword;
    if (!keyword) {
      clearHighlight();
      return;
    }
    if (keyword.length < 2) {
      clearHighlight();
      return;
    }
    if (!fullResponseText.toLowerCase().includes(keyword.toLowerCase())) {
      clearHighlight();
      return;
    }
    requestAnimationFrame(() => {
      if (!rbContent) return;
      rbContent.innerHTML = highlightText(fullResponseText, keyword); // ← menggunakan fullResponseText
      currentMatches = [...rbContent.querySelectorAll('.highlight')];
      currentMatchIndex = -1;
      if (currentMatches.length === 0) {
        if (statusCount) statusCount.textContent = '';
        return;
      }
      if (statusCount) statusCount.textContent = `${currentMatches.length} matches`;
      currentMatchIndex = 0;
      currentMatches[0].classList.add('active');
    });
  }

  // function updateHighlight(keyword) {
  //   keyword = keyword.trim();
  //   if (keyword === currentKeyword) return;
  //   currentKeyword = keyword;
  //   if (!keyword) {
  //     clearHighlight();
  //     return;
  //   }
  //   if (keyword.length < 2) {
  //     clearHighlight();
  //     return;
  //   }
  //   if (!formattedText.toLowerCase().includes(keyword.toLowerCase())) {
  //     clearHighlight();
  //     return;
  //   }
  //   requestAnimationFrame(() => {
  //     if (!rbContent) return;
  //     rbContent.innerHTML = highlightText(formattedText, keyword);
  //     currentMatches = [...rbContent.querySelectorAll('.highlight')];
  //     currentMatchIndex = -1;
  //     if (currentMatches.length === 0) {
  //       if (statusCount) statusCount.textContent = '';
  //       return;
  //     }
  //     if (statusCount) statusCount.textContent = `${currentMatches.length} matches`;
  //     currentMatchIndex = 0;
  //     currentMatches[0].classList.add('active');
  //   });
  // }

  if (searchInputResp) {
    searchInputResp.addEventListener('input', debounce((e) => {
      updateHighlight(e.target.value);
    }, 250));
    searchInputResp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        gotoMatch(currentMatchIndex + 1);
      }
    });
  }

  function gotoMatch(index) {
    if (!currentMatches.length) return;
    currentMatches[currentMatchIndex]?.classList.remove('active');
    currentMatchIndex = (index + currentMatches.length) % currentMatches.length;
    const el = currentMatches[currentMatchIndex];
    el.classList.add('active');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  prevBtnResp?.addEventListener('click', () => gotoMatch(currentMatchIndex - 1));
  nextBtnResp?.addEventListener('click', () => gotoMatch(currentMatchIndex + 1));

  clearHighlight();
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