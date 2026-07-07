import { logs, selectedId, editingId, sendingId, activeTab, setSendingId, setSelectedId, setActiveTab, statusText } from './state.js';
import { escapeHtml, headersToObject, ensureValidUrl, cleanHeaders } from './helpers.js';
import { saveLogs } from './storage.js';
import { renderList, renderDetail } from './render.js';

// ── Deteksi body mode dari header dan postData ──
function detectBodyInfo(postData, headers) {
  const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  let mode = 'none';
  let rawType = 'text';
  let formFields = [];
  let requestBody = postData || '';

  if (!postData) {
    return { bodyMode: 'none', bodyRawType: 'text', formDataFields: [], requestBody: '' };
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    mode = 'x-www-form-urlencoded';
    try {
      const params = new URLSearchParams(postData);
      for (const [key, value] of params) {
        formFields.push({ key, value });
      }
    } catch (e) {
      // parse gagal, biarkan kosong
    }
  } else if (contentType.includes('multipart/form-data')) {
    // Untuk multipart, parsing manual cukup rumit. Kita tampilkan sebagai raw body.
    // Tapi set mode raw agar body terlihat di detail dan copy curl.
    mode = 'raw';
    rawType = 'text';
    requestBody = postData;
  } else {
    // JSON, XML, text, dll
    mode = 'raw';
    try {
      JSON.parse(postData);
      rawType = 'json';
    } catch (e) {
      if (contentType.includes('xml')) {
        rawType = 'xml';
      } else {
        rawType = 'text';
      }
    }
    requestBody = postData;
  }

  return { bodyMode: mode, bodyRawType: rawType, formDataFields: formFields, requestBody };
}

// ── CAPTURE REQUEST ──
export function startCapture() {
  console.log('[BrutuSuite] Memulai capture via chrome.devtools.network');

  chrome.devtools.network.onRequestFinished.addListener(async (request) => {
    // console.log('[BrutuSuite] Request tertangkap:', request.request.url, 'type:', request.type);

    const reqHeaders = {};
    request.request.headers.forEach(h => { reqHeaders[h.name] = h.value; });

    const queryData = request.request.queryData;

    const postData = request.request.postData || '';

    let responseBody = '';
    try {
      const content = await new Promise((resolve) => {
        request.getContent((body, encoding) => {
          resolve(body);
        });
      });
      responseBody = content;
    } catch (e) {
      console.warn('[BrutuSuite] Gagal ambil response body:', e);
      responseBody = '';
    }

    console.log('CEK responseBody ---------> ', responseBody);

    const respHeaders = {};
    request.response.headers.forEach(h => { respHeaders[h.name] = h.value; });

    const bodyInfo = detectBodyInfo(postData, reqHeaders);

    const log = {
      time: new Date().toLocaleTimeString(),
      url: request.request.url,
      status: request.response.status,
      statusText: request.response.statusText || '',
      mime: request.response.mimeType || '',
      method: request.request.method || 'GET',
      requestHeaders: reqHeaders,
      requestBody: bodyInfo.requestBody,
      response: responseBody,
      responseHeaders: respHeaders,
      note: '',
      queryParams: [],
      bodyMode: bodyInfo.bodyMode,
      bodyRawType: bodyInfo.bodyRawType,
      formDataFields: [],
      auth: { type: 'none' }
    };

    logs.unshift(log);
    if (logs.length > 200) logs.pop();
    await saveLogs();
    renderList();

    if (selectedId === null) {
      setSelectedId(0);
      renderDetail(0);
    } else {
      // selectedId akan bergeser karena unshift
      // kita update referensi
      setSelectedId(0);
      renderDetail(0);
    }
  });
}

// ── Send Request ──
export async function sendRequest(idx) {
  if (sendingId !== null) return;
  const log = logs[idx];
  if (!log) return;

  const urlInput = document.getElementById('edit-url');
  const methodSelect = document.getElementById('edit-method');
  const bodyTextarea = document.getElementById('edit-body');

  let url = urlInput ? urlInput.value : log.url;
  let method = methodSelect ? methodSelect.value : (log.method || 'GET');
  let body = bodyTextarea ? bodyTextarea.value : (log.requestBody || '');
  if (typeof body === 'function') {
    try { body = body(); } catch (_) { body = ''; }
  }
  if (typeof body !== 'string') body = String(body);

  url = url.trim();

  const headersArr = [];
  document.querySelectorAll('#headers-container .headers-row:not(.header-row)').forEach(row => {
    const key = row.querySelector('.header-key').value.trim();
    const val = row.querySelector('.header-value').value;
    if (key) headersArr.push({ key, value: val });
  });
  let headers = headersToObject(headersArr);

  const auth = log.auth || { type: 'none' };
  if (auth.type === 'basic') {
    const creds = btoa(unescape(encodeURIComponent(`${auth.username || ''}:${auth.password || ''}`)));
    headers['Authorization'] = `Basic ${creds}`;
  } else if (auth.type === 'bearer') {
    if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'oauth2') {
    if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }

  headers = cleanHeaders(headers);

  const mode = log.bodyMode || 'none';
  let fetchOptions = { method, headers };

  if (mode === 'raw') {
    const rawType = log.bodyRawType || 'text';
    if (rawType === 'json' && !headers['content-type'] && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    else if (rawType === 'xml' && !headers['content-type'] && !headers['Content-Type']) headers['Content-Type'] = 'application/xml';
    if (body && method !== 'GET' && method !== 'HEAD') fetchOptions.body = body;
  } else if (mode === 'form-data') {
    const formData = new FormData();
    (log.formDataFields || []).forEach(f => {
      if (f.type === 'file') {
        if (f.fileObj && f.fileObj instanceof File) formData.append(f.key, f.fileObj, f.fileObj.name);
        else if (f.value) formData.append(f.key, f.value);
      } else formData.append(f.key, f.value || '');
    });
    fetchOptions.body = formData;
    delete headers['Content-Type'];
    delete headers['content-type'];
  } else if (mode === 'x-www-form-urlencoded') {
    const params = new URLSearchParams();
    (log.formDataFields || []).forEach(f => { if (f.key) params.append(f.key, f.value || ''); });
    fetchOptions.body = params.toString();
    if (!headers['content-type'] && !headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  if (method === 'GET' || method === 'HEAD') delete fetchOptions.body;
  fetchOptions.headers = headers;
  url = ensureValidUrl(url);

  console.log('[BrutuSuite] Sending:', { url, method, headers, body: fetchOptions.body });

  setSendingId(idx);
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
    setSendingId(null);
    setSelectedId(idx);
    setActiveTab('response');
    renderList();
    renderDetail(idx);
    statusText.textContent = `Sent (${response.status}) in ${elapsed}ms`;
  } catch (err) {
    logs[idx] = { ...log, sendStatus: 'error', sendError: err.message };
    await saveLogs();
    setSendingId(null);
    renderDetail(idx);
    statusText.textContent = `❌ Error: ${err.message}`;
    console.error('[BrutuSuite] Send error:', err);
  }
}

// ── Copy cURL ──
export function copyAsCurl(idx) {
  const log = logs[idx];
  if (!log) return;
  const curl = generateCurl(log);
  navigator.clipboard.writeText(curl).then(() => statusText.textContent = 'cURL copied!')
    .catch(() => { const ta = document.createElement('textarea'); ta.value = curl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); statusText.textContent = 'cURL copied!'; });
}

export function generateCurl(log) {
  const method = log.method || 'GET';
  const url = log.url;
  const headers = log.requestHeaders || {};
  const bodyMode = log.bodyMode || 'none';
  const formFields = log.formDataFields || [];

  let parts = [`curl -X ${method}`];

  // Headers
  let cookieHeader = '';
  for (const [k, v] of Object.entries(headers)) {
    const keyLower = k.toLowerCase();
    if (keyLower === 'cookie') { cookieHeader = v; continue; }
    if (keyLower === 'host') continue;
    const escapedValue = v.replace(/"/g, '\\"');
    parts.push(`-H "${k}: ${escapedValue}"`);
  }
  if (cookieHeader) {
    parts.push(`-b "${cookieHeader.replace(/"/g, '\\"')}"`);
  }

  // Body handling
  if (method !== 'GET' && method !== 'HEAD') {
    if (bodyMode === 'form-data') {
      formFields.forEach(f => {
        if (f.key && f.key.trim()) {
          const key = f.key.trim();
          const value = (f.value || '').replace(/"/g, '\\"');
          if (f.type === 'file' && f.value) {
            parts.push(`-F "${key}=@${value}"`);
          } else {
            parts.push(`-F "${key}=${value}"`);
          }
        }
      });
    } else if (bodyMode === 'x-www-form-urlencoded') {
      const params = new URLSearchParams();
      formFields.forEach(f => {
        if (f.key && f.key.trim()) {
          params.append(f.key.trim(), f.value || '');
        }
      });
      const data = params.toString();
      if (data) {
        // Escape backslash dan double quote
        const escaped = data.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`--data-raw "${escaped}"`);
      }
    } else if (bodyMode === 'raw') {
      const body = log.requestBody || '';
      if (body) {
        // Escape backslash dan double quote
        // console.log('IKIH===>', body.text);
        const escaped = body.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`--data-raw "${escaped}"`);
      }
    }
  }

  parts.push(`"${url}"`);
  return parts.join(' \\\n  ');
}