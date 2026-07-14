// events.js
import { logs, selectedId, activeSubTab, setActiveSubTab, statusText } from './state.js';
import { escapeHtml, headersToObject, buildUrlWithParams } from './helpers.js';
import { saveLogs } from './storage.js';
import { renderDetail } from './render.js';

let detailDelegationActive = false;

// ── Setup delegation pada detailContent ──
export function setupDetailDelegation() {
  const detailContent = document.getElementById('detail-content');
  if (!detailContent) return;
  if (detailDelegationActive) return;

  // --- Delegasi untuk input di params, headers, form, urlencoded ---
  detailContent.addEventListener('input', function(e) {
    const target = e.target;
    const log = getCurrentLog();
    if (!log) return;

    // Params
    if (target.closest('.params-row')) {
      updateParamsFromUI(log);
      return;
    }
    // Headers
    if (target.closest('.headers-row')) {
      updateHeadersFromUI(log);
      return;
    }
    // Form-data
    if (target.closest('.form-row')) {
      updateFormFieldsFromUI(log);
      return;
    }
    // Urlencoded
    if (target.closest('.urlencoded-row')) {
      updateUrlencodedFromUI(log);
      return;
    }
  });

  // --- Delegasi untuk klik tombol add/remove ---
  detailContent.addEventListener('click', function(e) {
    const target = e.target;
    const log = getCurrentLog();
    if (!log) return;

    // Params: tombol add
    if (target.classList.contains('param-add')) {
      addParamRow(target);
      updateParamsFromUI(log);
      return;
    }
    // Params: tombol remove
    if (target.classList.contains('param-remove')) {
      const row = target.closest('.params-row');
      if (row && document.querySelectorAll('.params-row:not(.header-row)').length > 1) {
        row.remove();
        updateParamsFromUI(log);
      }
      return;
    }

    // Headers: tombol add
    if (target.classList.contains('header-add')) {
      addHeaderRow(target);
      updateHeadersFromUI(log);
      return;
    }
    // Headers: tombol remove
    if (target.classList.contains('header-remove')) {
      const row = target.closest('.headers-row');
      if (row && document.querySelectorAll('#headers-container .headers-row:not(.header-row)').length > 1) {
        row.remove();
        updateHeadersFromUI(log);
      }
      return;
    }

    // Form-data: tombol add
    if (target.classList.contains('form-add')) {
      addFormRow(target);
      updateFormFieldsFromUI(log);
      return;
    }
    // Form-data: tombol remove
    if (target.classList.contains('form-remove')) {
      const row = target.closest('.form-row');
      if (row && document.querySelectorAll('.form-row:not(.header-row)').length > 1) {
        row.remove();
        updateFormFieldsFromUI(log);
      }
      return;
    }

    // Urlencoded: tombol add
    if (target.classList.contains('urlencoded-add')) {
      addUrlencodedRow(target);
      updateUrlencodedFromUI(log);
      return;
    }
    // Urlencoded: tombol remove
    if (target.classList.contains('urlencoded-remove')) {
      const row = target.closest('.urlencoded-row');
      if (row && document.querySelectorAll('.urlencoded-row:not(.header-row)').length > 1) {
        row.remove();
        updateUrlencodedFromUI(log);
      }
      return;
    }
  });

  detailDelegationActive = true;
}

// ── Helper: ambil log yang sedang dipilih ──
function getCurrentLog() {
  if (selectedId === null || selectedId === undefined) return null;
  return logs[selectedId] || null;
}

// ── Fungsi update (tanpa idx, ambil dari state) ──
function updateParamsFromUI(log) {
  const params = [];
  document.querySelectorAll('.params-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.param-key')?.value.trim() || '';
    const value = row.querySelector('.param-value')?.value || '';
    if (key) params.push({ key, value });
  });
  log.queryParams = params;
  // Update URL
  const urlInput = document.getElementById('edit-url');
  if (urlInput) {
    const baseUrl = urlInput.value.split('?')[0];
    const query = new URLSearchParams(params.map(p => [p.key, p.value])).toString();
    const newUrl = query ? `${baseUrl}?${query}` : baseUrl;
    log.url = newUrl;
    urlInput.value = newUrl;
  }
  saveLogs();
}

function updateHeadersFromUI(log) {
  const headers = [];
  document.querySelectorAll('#headers-container .headers-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.header-key')?.value.trim() || '';
    const val = row.querySelector('.header-value')?.value || '';
    if (key) headers.push({ key, value: val });
  });
  log.requestHeaders = headersToObject(headers);
  saveLogs();
}

function updateFormFieldsFromUI(log) {
  const fields = [];
  document.querySelectorAll('.form-data-fields .form-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.form-key')?.value.trim() || '';
    const typeSelect = row.querySelector('.form-type');
    const type = typeSelect ? typeSelect.value : 'text';
    if (key) {
      if (type === 'text') {
        const val = row.querySelector('.form-text')?.value || '';
        fields.push({ key, value: val, type: 'text' });
      } else {
        const fileInput = row.querySelector('.form-file');
        const fileObj = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        const filename = fileObj ? fileObj.name : '';
        fields.push({ key, value: filename, type: 'file', fileObj });
      }
    }
  });
  log.formDataFields = fields;
  saveLogs();
}

function updateUrlencodedFromUI(log) {
  const fields = [];
  document.querySelectorAll('.urlencoded-fields .urlencoded-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.urlencoded-key')?.value.trim() || '';
    const val = row.querySelector('.urlencoded-value')?.value || '';
    if (key) fields.push({ key, value: val });
  });
  log.formDataFields = fields;
  saveLogs();
}

// ── Fungsi tambah baris ──
function addParamRow(addBtn) {
  const container = addBtn.closest('.params-table');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'params-row';
  row.innerHTML = `
    <div class="pkey"><input class="param-key" placeholder="Key" /></div>
    <div class="pvalue"><input class="param-value" placeholder="Value" /></div>
    <div class="paction"><button class="param-remove">×</button></div>
  `;
  container.insertBefore(row, addBtn);
  row.querySelector('.param-key')?.focus();
}

function addHeaderRow(addBtn) {
  const container = addBtn.closest('#headers-container');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'headers-row';
  row.innerHTML = `
    <div class="hkey"><input class="header-key" placeholder="Key" /></div>
    <div class="hvalue"><input class="header-value" placeholder="Value" /></div>
    <div class="haction"><button class="header-remove">×</button></div>
  `;
  container.insertBefore(row, addBtn);
  row.querySelector('.header-key')?.focus();
}

function addFormRow(addBtn) {
  const container = addBtn.closest('.form-data-fields');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'form-row';
  row.innerHTML = `
    <div class="fkey"><input class="form-key" placeholder="Key" /></div>
    <div class="fvalue"><input class="form-text" placeholder="Value" /></div>
    <div class="ftype"><select class="form-type"><option value="text" selected>Text</option><option value="file">File</option></select></div>
    <div class="faction"><button class="form-remove">×</button></div>
  `;
  container.insertBefore(row, addBtn);
  row.querySelector('.form-key')?.focus();
}

function addUrlencodedRow(addBtn) {
  const container = addBtn.closest('.urlencoded-fields');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'urlencoded-row';
  row.innerHTML = `
    <div class="ukey"><input class="urlencoded-key" placeholder="Key" /></div>
    <div class="uvalue"><input class="urlencoded-value" placeholder="Value" /></div>
    <div class="uaction"><button class="urlencoded-remove">×</button></div>
  `;
  container.insertBefore(row, addBtn);
  row.querySelector('.urlencoded-key')?.focus();
}

// ── attachSubtabEvents (hanya untuk elemen tunggal dan inisialisasi delegation) ──
export function attachSubtabEvents(idx) {
  const log = logs[idx];
  if (!log) return;

  // Pastikan delegation sudah aktif
  setupDetailDelegation();

  // ── Elemen tunggal: method, url, body mode, auth, dll. ──
  const methodSelect = document.getElementById('edit-method');
  if (methodSelect) {
    // Hapus listener lama jika ada (gunakan replace)
    methodSelect.replaceWith(methodSelect.cloneNode(true));
    const newMethod = document.getElementById('edit-method');
    if (newMethod) {
      newMethod.addEventListener('change', () => {
        log.method = newMethod.value;
        saveLogs();
      });
    }
  }

  const urlInput = document.getElementById('edit-url');
  if (urlInput) {
    urlInput.replaceWith(urlInput.cloneNode(true));
    const newUrl = document.getElementById('edit-url');
    if (newUrl) {
      newUrl.addEventListener('input', () => {
        log.url = newUrl.value;
        saveLogs();
      });
    }
  }

  // Body mode
  const bodyMode = document.getElementById('body-mode');
  if (bodyMode) {
    bodyMode.replaceWith(bodyMode.cloneNode(true));
    const newBodyMode = document.getElementById('body-mode');
    if (newBodyMode) {
      newBodyMode.addEventListener('change', () => {
        log.bodyMode = newBodyMode.value;
        if (newBodyMode.value === 'none') { log.requestBody = ''; log.formDataFields = []; }
        else if (newBodyMode.value === 'form-data') { log.formDataFields = log.formDataFields || []; if (log.formDataFields.length === 0) log.formDataFields = [{ key: '', value: '', type: 'text' }]; }
        else if (newBodyMode.value === 'x-www-form-urlencoded') { log.formDataFields = log.formDataFields || []; if (log.formDataFields.length === 0) log.formDataFields = [{ key: '', value: '' }]; }
        else if (newBodyMode.value === 'raw') { log.requestBody = log.requestBody || ''; }
        saveLogs();
        renderDetail(idx);
      });
    }
  }

  // Body raw type
  const bodyRawType = document.getElementById('body-raw-type');
  if (bodyRawType) {
    bodyRawType.replaceWith(bodyRawType.cloneNode(true));
    const newRawType = document.getElementById('body-raw-type');
    if (newRawType) {
      newRawType.addEventListener('change', () => {
        log.bodyRawType = newRawType.value;
        saveLogs();
      });
    }
  }

  // Body textarea
  const bodyTextarea = document.getElementById('edit-body');
  if (bodyTextarea) {
    bodyTextarea.replaceWith(bodyTextarea.cloneNode(true));
    const newTextarea = document.getElementById('edit-body');
    if (newTextarea) {
      newTextarea.addEventListener('input', () => {
        log.requestBody = newTextarea.value;
        saveLogs();
      });
    }
  }

  // ── Auth ──
  const authType = document.getElementById('auth-type');
  if (authType) {
    authType.replaceWith(authType.cloneNode(true));
    const newAuthType = document.getElementById('auth-type');
    if (newAuthType) {
      newAuthType.addEventListener('change', () => {
        log.auth.type = newAuthType.value;
        if (newAuthType.value === 'none') log.auth = { type: 'none' };
        else if (newAuthType.value === 'basic') log.auth = { type: 'basic', username: '', password: '' };
        else if (newAuthType.value === 'bearer') log.auth = { type: 'bearer', token: '' };
        else if (newAuthType.value === 'oauth2') log.auth = { type: 'oauth2', grantType: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', accessToken: '' };
        saveLogs();
        renderDetail(idx);
      });
    }
  }

  // Basic auth fields
  const basicUsername = document.getElementById('auth-basic-username');
  if (basicUsername) {
    basicUsername.replaceWith(basicUsername.cloneNode(true));
    const newUser = document.getElementById('auth-basic-username');
    if (newUser) newUser.addEventListener('input', () => { log.auth.username = newUser.value; saveLogs(); });
  }
  const basicPassword = document.getElementById('auth-basic-password');
  if (basicPassword) {
    basicPassword.replaceWith(basicPassword.cloneNode(true));
    const newPass = document.getElementById('auth-basic-password');
    if (newPass) newPass.addEventListener('input', () => { log.auth.password = newPass.value; saveLogs(); });
  }

  const bearerToken = document.getElementById('auth-bearer-token');
  if (bearerToken) {
    bearerToken.replaceWith(bearerToken.cloneNode(true));
    const newToken = document.getElementById('auth-bearer-token');
    if (newToken) newToken.addEventListener('input', () => { log.auth.token = newToken.value; saveLogs(); });
  }

  // OAuth2 fields (sama seperti di atas, kita pasang listener langsung)
  const oauth2Grant = document.getElementById('auth-oauth2-grant');
  if (oauth2Grant) {
    oauth2Grant.replaceWith(oauth2Grant.cloneNode(true));
    const newGrant = document.getElementById('auth-oauth2-grant');
    if (newGrant) newGrant.addEventListener('change', () => { log.auth.grantType = newGrant.value; saveLogs(); renderDetail(idx); });
  }
  // ... dan seterusnya untuk field OAuth2 lainnya
  // (Saya singkat agar tidak terlalu panjang, tapi prinsipnya sama: replace + addEventListener)

  // Untuk OAuth2, kita bisa buat helper agar tidak berulang
  attachOAuth2Events(idx, log);

  // Tombol Fetch Token
  const fetchTokenBtn = document.getElementById('auth-oauth2-fetch-token');
  if (fetchTokenBtn) {
    fetchTokenBtn.replaceWith(fetchTokenBtn.cloneNode(true));
    const newBtn = document.getElementById('auth-oauth2-fetch-token');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const auth = log.auth;
        if (!auth.tokenUrl) { statusText.textContent = 'Token URL is required'; return; }
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
            const accessTokenInput = document.getElementById('auth-oauth2-accesstoken');
            if (accessTokenInput) accessTokenInput.value = data.access_token;
            statusText.textContent = 'Token obtained!';
            saveLogs();
          } else {
            statusText.textContent = 'Error: ' + (data.error || 'No access_token');
          }
        } catch (err) {
          statusText.textContent = 'Error: ' + err.message;
        }
      });
    }
  }
}

// ── Helper untuk OAuth2 field ──
function attachOAuth2Events(idx, log) {
  const fields = [
    { id: 'auth-oauth2-tokenurl', prop: 'tokenUrl' },
    { id: 'auth-oauth2-clientid', prop: 'clientId' },
    { id: 'auth-oauth2-clientsecret', prop: 'clientSecret' },
    { id: 'auth-oauth2-scope', prop: 'scope' },
    { id: 'auth-oauth2-username', prop: 'username' },
    { id: 'auth-oauth2-password', prop: 'password' },
    { id: 'auth-oauth2-accesstoken', prop: 'accessToken' }
  ];
  fields.forEach(({ id, prop }) => {
    const el = document.getElementById(id);
    if (el) {
      el.replaceWith(el.cloneNode(true));
      const newEl = document.getElementById(id);
      if (newEl) {
        newEl.addEventListener('input', () => {
          if (!log.auth) log.auth = { type: 'oauth2' };
          log.auth[prop] = newEl.value;
          saveLogs();
        });
      }
    }
  });
}