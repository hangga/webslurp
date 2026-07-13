import { logs, selectedId,sendingId, activeTab, activeSubTab,
         setSelectedId, setActiveTab, setActiveSubTab,
         logListContainer, detailEmpty, detailContent, countBadge, statusText, statusCount,
         expandedGroups, toggleGroup,
         MAX_LOGS, timeoutMs } from './state.js';
import { escapeHtml, formatOutput, statusClass, headersToArray, headersToObject, 
        buildUrlWithParams, bodyToJson, formatOutputPlain, highlightText, getCategoryIcon, getBaseDomain } from './helpers.js';
import { saveLogs } from './storage.js';
import { filterLogs } from './filter.js';
import { attachSubtabEvents } from './events.js';
import { sendRequest, copyAsCurl, cancelRequest } from './network.js';

const container = document.getElementById('progress-container');
const bar = document.getElementById('progress-bar');
const stickySearch = document.getElementById('sticky-search');
// const expandedGroups = new Set();      // untuk domain utama (base domain)
const expandedSubGroups = new Set();   // untuk subdomain (hostname lengkap), simpan sebaga

// ── Render list (grouped by hostname) ──
export function renderList(callback) {
  const filtered = filterLogs();
  countBadge.textContent = filtered.length;
  statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

  // ---- 1. Kelompokkan berdasarkan domain utama ----
  const domainGroups = {};
  filtered.forEach(log => {
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

    // ---- Header domain utama ----
    const domainHeader = document.createElement('div');
    domainHeader.className = 'group-header';
    domainHeader.innerHTML = `
      <span class="group-toggle">+ </span>
      <span class="group-name">🗂️ ${escapeHtml(domain)}</span>
      <span class="group-count">(${domainLogs.length})</span>
    `;
    domainHeader.addEventListener('click', () => {
      const body = domainDiv.querySelector('.group-body');
      const toggle = domainHeader.querySelector('.group-toggle');
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
    });
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
      const subKey = `${domain}|${hostname}`; // untuk state ekspansi

      const subDiv = document.createElement('div');
      subDiv.className = 'sub-log-group';

      // ---- Header subdomain ----
      const subHeader = document.createElement('div');
      subHeader.className = 'group-header sub-header';
      subHeader.innerHTML = `
        <span class="group-toggle">+ </span>
        <span class="group-name">📁 ${escapeHtml(hostname)}</span>
        <span class="group-count">(${hostLogs.length})</span>
      `;
      subHeader.addEventListener('click', () => {
        const body = subDiv.querySelector('.sub-group-body');
        const toggle = subHeader.querySelector('.group-toggle');
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
      });
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
        const icon = getCategoryIcon(log.category);
        entry.innerHTML = `
          <span class="req-icon">${icon}</span>
          <span class="status ${sc}">${log.status}</span>
          <span class="method">${log.method || 'GET'}</span>
          <span class="url">${escapeHtml(log.url)}</span>
          ${log.note ? `<span class="note-icon">📝</span>` : ''}
          <span class="time">${log.time || ''}</span>
        `;
        entry.addEventListener('click', () => selectLog(realIdx));
        subBody.appendChild(entry);
      });

      subDiv.appendChild(subBody);
      domainBody.appendChild(subDiv);
    });

    domainDiv.appendChild(domainBody);
    logListContainer.appendChild(domainDiv);
  });

  // Panggil callback jika diberikan
  if (callback) callback();

  // Update status text
  if (logs.length === 0) {
    statusText.textContent = 'Listening…';
  } else {
    statusText.textContent = `Showing ${filtered.length} of ${logs.length}`;
  }
}

// export function renderList(callback) {
//   const filtered = filterLogs();
//   countBadge.textContent = filtered.length;
//   statusCount.textContent = `${filtered.length} request${filtered.length !== 1 ? 's' : ''}`;

//   // Group by hostname
//   const groups = {};
//   filtered.forEach(log => {
//     let hostname = '';
//     try {
//       hostname = new URL(log.url).hostname;
//     } catch {
//       hostname = 'invalid';
//     }
//     if (!groups[hostname]) groups[hostname] = [];
//     groups[hostname].push(log);
//   });

//   const sortedHostnames = Object.keys(groups).sort();

//   logListContainer.innerHTML = '';
//   sortedHostnames.forEach(hostname => {
//     const groupLogs = groups[hostname];
//     const groupDiv = document.createElement('div');
//     groupDiv.className = 'log-group';

//     // Header
//     const header = document.createElement('div');
//     header.className = 'group-header';
//     header.innerHTML = `
//       <span class="group-toggle">+ </span>
//       <span class="group-name">🗂️ ${escapeHtml(hostname)}</span>
//       <span class="group-count">(${groupLogs.length})</span>
//     `;
//     header.addEventListener('click', () => {
//       const body = groupDiv.querySelector('.group-body');
//       const toggle = header.querySelector('.group-toggle');
//       const isExpanded = !body.classList.contains('collapsed');
//       if (isExpanded) {
//         body.classList.add('collapsed');
//         toggle.textContent = '+  ';
//         expandedGroups.delete(hostname);
//       } else {
//         body.classList.remove('collapsed');
//         toggle.textContent = '-  ';
//         expandedGroups.add(hostname);
//       }
//     });
//     groupDiv.appendChild(header);

//     // Body
//     const body = document.createElement('div');
//     body.className = 'group-body';
//     if (expandedGroups.has(hostname)) {
//       body.classList.remove('collapsed');
//       header.querySelector('.group-toggle').textContent = '- ';
//     } else {
//       body.classList.add('collapsed');
//       header.querySelector('.group-toggle').textContent = '+ ';
//     }
    
//     groupLogs.forEach(log => {
//       const realIdx = logs.indexOf(log);
//       const entry = document.createElement('div');
//       const sc = statusClass(log.status);
//       entry.className = `log-entry ${sc}${selectedId === realIdx ? ' active' : ''}`;
//       if (log.note) entry.classList.add('has-note');
//       const icon = getCategoryIcon(log.category);
//       entry.innerHTML = `
//         <span class="req-icon">${icon}</span>
//         <span class="status ${sc}">${log.status}</span>
//         <span class="method">${log.method || 'GET'}</span>
//         <span class="url">${escapeHtml(log.url)}</span>
//         ${log.note ? `<span class="note-icon">📝</span>` : ''}
//         <span class="time">${log.time || ''}</span>
//       `;
//       entry.addEventListener('click', () => selectLog(realIdx));
//       body.appendChild(entry);
//     });
//     groupDiv.appendChild(body);
//     logListContainer.appendChild(groupDiv);
//   });

//   if (callback) callback();

//   // console.log('CEK-calback =========>', callback? "Ada":"tak")

//   if (logs.length === 0) {
//     statusText.textContent = 'Listening…';
//   } else {
//     statusText.textContent = `Showing ${filtered.length} of ${logs.length}`;
//   }
// }


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
  // setActiveTab('request'); // jangan dibuka.. Awas..
  // setActiveSubTab('params');
  renderList();
  renderDetail(idx);
}

export function setLoading(isLoading) {

  if (isLoading) {
    container.hidden = false;
    bar.classList.add('indeterminate');
  } else {
    container.hidden = true;
    bar.classList.remove('indeterminate');
    bar.style.width = '0%'; // reset
  }
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
  // Di bagian actions, tambahkan:
  // html += `<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">`;
  // html += `<button class="btn btn-send" id="action-send" ${isSending ? 'disabled' : ''}>
  //   ${isSending ? '⏳ Sending...' : '▶ Send'}
  // </button>`;
  // if (isSending) {
  //   html += `<button class="btn btn-cancel" id="action-cancel">✕ Cancel</button>`;
  // }
  // html += `<button class="btn btn-copy" id="action-copy">📋 Copy cURL</button>`;
  // // Tambahkan input timeout
  // html += `
  //   <div style="display:inline-flex; align-items:center; gap:4px; margin-left:8px;">
  //     <label style="font-size:12px; color:#888;">Timeout (ms):</label>
  //     <input type="number" id="timeout-input" value="${timeoutMs}" min="1000" step="500" 
  //           style="width:80px; padding:4px; border:1px solid #ccc; border-radius:4px; background:var(--input-bg); color:var(--text-color);" />
  //   </div>
  // `;
  // html += `</div>`;

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

  stickySearch.style.visibility = activeTab === 'response' ? 'visible' : 'hidden';

  // ── Event binding ──
  detailContent.querySelectorAll('.detail-tab').forEach(tab => tab.addEventListener('click', function(e) {
    const tabName = this.dataset.tab;
    if (tabName && tabName !== activeTab) { setActiveTab(tabName); renderDetail(idx); }
    stickySearch.style.visibility = activeTab === 'response'? 'visible':'hidden'
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
    saveLogs();
    // renderList();
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

  // ------------------------------------------------------------

  function debounce(fn, delay = 250) {
    let timer;

    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ------------------------------------------------------------

  function clearHighlight() {
    rbContent.textContent = formattedText;
    currentMatches = [];
    currentMatchIndex = -1;
    statusCount.textContent = '';
  }

  // ------------------------------------------------------------

  function updateHighlight(keyword) {
    keyword = keyword.trim();

    // keyword sama → tidak usah render lagi
    if (keyword === currentKeyword) return;

    currentKeyword = keyword;

    // kosong
    if (!keyword) {
      clearHighlight();
      return;
    }

    // minimal 2 karakter
    if (keyword.length < 2) {
      clearHighlight();
      return;
    }

    // keyword tidak ada → skip regex
    if (!formattedText.toLowerCase().includes(keyword.toLowerCase())) {
      clearHighlight();
      return;
    }

    requestAnimationFrame(() => {

      rbContent.innerHTML = highlightText(formattedText, keyword);

      currentMatches = [
        ...rbContent.querySelectorAll('.highlight')
      ];

      currentMatchIndex = -1;

      if (currentMatches.length === 0) {
        statusCount.textContent = '';
        return;
      }

      statusCount.textContent = `${currentMatches.length} matches`;

      currentMatchIndex = 0;

      currentMatches[0].classList.add('active');

      // sengaja TIDAK scroll di sini
    });
  }

  // ------------------------------------------------------------

  if (searchInputResp) {
    searchInputResp.addEventListener(
      'input',
      debounce((e) => {
        updateHighlight(e.target.value);
      }, 250)
    );

    searchInputResp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        gotoMatch(currentMatchIndex + 1);
      }
    });
    
    searchInputResp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;

      e.preventDefault();
      gotoMatch(currentMatchIndex + (e.shiftKey ? -1 : 1));
    });
  }

  // ------------------------------------------------------------

  function gotoMatch(index) {

    if (!currentMatches.length) return;

    currentMatches[currentMatchIndex]?.classList.remove('active');

    currentMatchIndex =
      (index + currentMatches.length) % currentMatches.length;

    const el = currentMatches[currentMatchIndex];

    el.classList.add('active');

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  // ------------------------------------------------------------

  prevBtnResp?.addEventListener('click', () => {
    gotoMatch(currentMatchIndex - 1);
  });

  nextBtnResp?.addEventListener('click', () => {
    gotoMatch(currentMatchIndex + 1);
  });

  // ------------------------------------------------------------

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