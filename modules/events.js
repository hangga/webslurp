import { logs, activeSubTab, setActiveSubTab, statusText } from './state.js';
import { escapeHtml, headersToObject, buildUrlWithParams } from './helpers.js';
import { saveLogs } from './storage.js';
import { renderDetail } from './render.js';

// ── attachSubtabEvents ──
export function attachSubtabEvents(idx) {
  const log = logs[idx];
  if (!log) return;

  // ── Params ──
  const paramRows = document.querySelectorAll('.params-row:not(.header-row)');
  const paramAdd = document.querySelector('.param-add');
  const updateParams = () => {
    const params = [];
    document.querySelectorAll('.params-row:not(.header-row)').forEach(r => {
      const k = r.querySelector('.param-key').value.trim();
      const v = r.querySelector('.param-value').value;
      if (k) { 
        params.push({ key: k, value: v }); 
        console.log('CEK-PARAM =========> key:', k);
        console.log('CEK-PARAM =========> value', v);
      }
    });
    log.queryParams = params;
    // const preview = document.getElementById('url-preview');
    // if (preview) preview.textContent = buildUrlWithParams(log);
    const urlInput = document.getElementById('edit-url');
    if (urlInput) { const newUrl = buildUrlWithParams(log); log.url = newUrl; urlInput.value = newUrl; }
    saveLogs();
  };
  paramRows.forEach(row => {
    row.querySelector('.param-key').addEventListener('input', updateParams);
    row.querySelector('.param-value').addEventListener('input', updateParams);
    row.querySelector('.param-remove').addEventListener('click', () => {
      if (document.querySelectorAll('.params-row:not(.header-row)').length <= 1) return;
      row.remove();
      updateParams();
    });
  });
  if (paramAdd) {
    paramAdd.addEventListener('click', () => {
      const container = document.querySelector('.params-table');
      const row = document.createElement('div');
      row.className = 'params-row';
      row.innerHTML = `<div class="pkey"><input class="param-key" placeholder="Key" /></div><div class="pvalue"><input class="param-value" placeholder="Value" /></div><div class="paction"><button class="param-remove">×</button></div>`;
      container.insertBefore(row, paramAdd);
      attachSubtabEvents(idx);
      updateParams();
    });
  }

  // Add
  if (paramAdd) {
    paramAdd.addEventListener("click", () => {
      const row = document.createElement("div");

      row.className = "params-row";
      row.innerHTML = `
        <div class="pkey">
          <input class="param-key" placeholder="Key" />
        </div>
        <div class="pvalue">
          <input class="param-value" placeholder="Value" />
        </div>
        <div class="paction">
          <button class="param-remove">×</button>
        </div>
      `;

      // paramTable.insertBefore(row, paramAdd);

      row.querySelector(".param-key").focus();

      updateParams();
    });
  }

  // ── Auth ──
  const authType = document.getElementById('auth-type');
  if (authType) {
    authType.addEventListener('change', () => {
      log.auth.type = authType.value;
      if (authType.value === 'none') log.auth = { type: 'none' };
      else if (authType.value === 'basic') log.auth = { type: 'basic', username: '', password: '' };
      else if (authType.value === 'bearer') log.auth = { type: 'bearer', token: '' };
      else if (authType.value === 'oauth2') log.auth = { type: 'oauth2', grantType: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', accessToken: '' };
      saveLogs();
      renderDetail(idx);
    });
  }
  const basicUsername = document.getElementById('auth-basic-username');
  const basicPassword = document.getElementById('auth-basic-password');
  if (basicUsername) basicUsername.addEventListener('input', () => { log.auth.username = basicUsername.value; saveLogs(); });
  if (basicPassword) basicPassword.addEventListener('input', () => { log.auth.password = basicPassword.value; saveLogs(); });
  const bearerToken = document.getElementById('auth-bearer-token');
  if (bearerToken) bearerToken.addEventListener('input', () => { log.auth.token = bearerToken.value; saveLogs(); });

  // OAuth2
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
    saveLogs();
  };
  if (oauth2Grant) oauth2Grant.addEventListener('change', () => { log.auth.grantType = oauth2Grant.value; saveLogs(); renderDetail(idx); });
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
          if (oauth2AccessToken) oauth2AccessToken.value = data.access_token;
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

  // ── Headers ──
  const headersContainer = document.getElementById('headers-container');
  if (headersContainer) {
    headersContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('header-remove')) {
        const row = e.target.closest('.headers-row');
        if (document.querySelectorAll('#headers-container .headers-row:not(.header-row)').length <= 1) return;
        row.remove();
        updateHeadersFromUI(idx);
      }
    });
    const addBtn = headersContainer.querySelector('.header-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'headers-row';
        row.innerHTML = `<div class="hkey"><input class="header-key" placeholder="Key" /></div><div class="hvalue"><input class="header-value" placeholder="Value" /></div><div class="haction"><button class="header-remove">×</button></div>`;
        headersContainer.insertBefore(row, addBtn);
        attachSubtabEvents(idx);
        updateHeadersFromUI(idx);
      });
    }
    headersContainer.querySelectorAll('.headers-row:not(.header-row)').forEach(row => {
      row.querySelector('.header-key').addEventListener('input', () => updateHeadersFromUI(idx));
      row.querySelector('.header-value').addEventListener('input', () => updateHeadersFromUI(idx));
    });
  }

  // ── Body ──
  const bodyMode = document.getElementById('body-mode');
  if (bodyMode) {
    bodyMode.addEventListener('change', () => {
      log.bodyMode = bodyMode.value;
      if (bodyMode.value === 'none') { log.requestBody = ''; log.formDataFields = []; }
      else if (bodyMode.value === 'form-data') { log.formDataFields = log.formDataFields || []; if (log.formDataFields.length === 0) log.formDataFields = [{ key: '', value: '', type: 'text' }]; }
      else if (bodyMode.value === 'x-www-form-urlencoded') { log.formDataFields = log.formDataFields || []; if (log.formDataFields.length === 0) log.formDataFields = [{ key: '', value: '' }]; }
      else if (bodyMode.value === 'raw') { log.requestBody = log.requestBody || ''; }
      saveLogs();
      renderDetail(idx);
    });
  }
  const bodyRawType = document.getElementById('body-raw-type');
  if (bodyRawType) bodyRawType.addEventListener('change', () => { log.bodyRawType = bodyRawType.value; saveLogs(); });
  const bodyTextarea = document.getElementById('edit-body');
  if (bodyTextarea) bodyTextarea.addEventListener('input', () => { log.requestBody = bodyTextarea.value; saveLogs(); });

  // ── Form Data ──
  const formContainer = document.querySelector('.form-data-fields');
  if (formContainer) {
    const addFormBtn = formContainer.querySelector('.form-add');
    if (addFormBtn) {
      addFormBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'form-row';
        row.innerHTML = `<div class="fkey"><input class="form-key" placeholder="Key" /></div><div class="fvalue"><input class="form-text" placeholder="Value" /></div><div class="ftype"><select class="form-type"><option value="text" selected>Text</option><option value="file">File</option></select></div><div class="faction"><button class="form-remove">×</button></div>`;
        formContainer.insertBefore(row, addFormBtn);
        attachSubtabEvents(idx);
        updateFormFieldsFromUI(idx);
      });
    }
    formContainer.querySelectorAll('.form-row:not(.header-row)').forEach(row => {
      attachFormRowEvents(row, idx);
    });
    formContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('form-remove')) {
        const row = e.target.closest('.form-row');
        if (document.querySelectorAll('.form-row:not(.header-row)').length <= 1) return;
        row.remove();
        updateFormFieldsFromUI(idx);
      }
    });
  }

  // ── URL Encoded ──
  const urlencodedContainer = document.querySelector('.urlencoded-fields');
  if (urlencodedContainer) {
    const addUrlencodedBtn = urlencodedContainer.querySelector('.urlencoded-add');
    if (addUrlencodedBtn) {
      addUrlencodedBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'urlencoded-row';
        row.innerHTML = `<div class="ukey"><input class="urlencoded-key" placeholder="Key" /></div><div class="uvalue"><input class="urlencoded-value" placeholder="Value" /></div><div class="uaction"><button class="urlencoded-remove">×</button></div>`;
        urlencodedContainer.insertBefore(row, addUrlencodedBtn);
        attachSubtabEvents(idx);
        updateUrlencodedFromUI(idx);
      });
    }
    urlencodedContainer.querySelectorAll('.urlencoded-row:not(.header-row)').forEach(row => {
      attachUrlencodedRowEvents(row, idx);
    });
    urlencodedContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('urlencoded-remove')) {
        const row = e.target.closest('.urlencoded-row');
        if (document.querySelectorAll('.urlencoded-row:not(.header-row)').length <= 1) return;
        row.remove();
        updateUrlencodedFromUI(idx);
      }
    });
  }

  // ── Method & URL ──
  const methodSelect = document.getElementById('edit-method');
  const urlInput = document.getElementById('edit-url');
  if (methodSelect) methodSelect.addEventListener('change', () => { log.method = methodSelect.value; saveLogs(); });
  if (urlInput) urlInput.addEventListener('input', () => { log.url = urlInput.value; saveLogs(); const preview = document.getElementById('url-preview'); if (preview) preview.textContent = buildUrlWithParams(log); });
}

// ── updateHeadersFromUI ──
export function updateHeadersFromUI(idx) {
  const log = logs[idx];
  if (!log) return;
  const headers = [];
  document.querySelectorAll('#headers-container .headers-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.header-key').value.trim();
    const val = row.querySelector('.header-value').value;
    if (key) headers.push({ key, value: val });
  });
  log.requestHeaders = headersToObject(headers);
  saveLogs();
}

// ── updateFormFieldsFromUI ──
export function updateFormFieldsFromUI(idx) {
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
        const fileObj = fileInput && fileInput.files[0] ? fileInput.files[0] : null;
        fields.push({ key, value: filename, type: 'file', fileObj });
      }
    }
  });
  log.formDataFields = fields;
  saveLogs();
}

// ── attachFormRowEvents ──
export function attachFormRowEvents(row, idx) {
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

// ── updateUrlencodedFromUI ──
export function updateUrlencodedFromUI(idx) {
  const log = logs[idx];
  if (!log) return;
  const fields = [];
  document.querySelectorAll('.urlencoded-fields .urlencoded-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.urlencoded-key').value.trim();
    const val = row.querySelector('.urlencoded-value').value;
    if (key) fields.push({ key, value: val });
  });
  log.formDataFields = fields;
  saveLogs();
}

// ── attachUrlencodedRowEvents ──
export function attachUrlencodedRowEvents(row, idx) {
  const keyInput = row.querySelector('.urlencoded-key');
  const valInput = row.querySelector('.urlencoded-value');
  const rmBtn = row.querySelector('.urlencoded-remove');
  const update = () => updateUrlencodedFromUI(idx);
  if (keyInput) keyInput.addEventListener('input', update);
  if (valInput) valInput.addEventListener('input', update);
  if (rmBtn) rmBtn.addEventListener('click', update);
}