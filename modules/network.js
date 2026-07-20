import { logs, selectedId, sendingId, activeTab, setSendingId, setSelectedId, setActiveTab, statusText, captureFilter,
          abortController, cancelRequested, timeoutId, timeoutMs,
          setAbortController, setCancelRequested, setTimeoutId, originalLogSnapshot, setOriginalLogSnapshot } from './state.js';
import { escapeHtml, headersToObject, ensureValidUrl, cleanHeaders, detectCategory } from './helpers.js';
import { saveLogs, saveSettings } from './storage.js';
import { renderList, renderDetail } from './render.js';
import { detectSensitiveData, detectAuth, analyzeSecurityHeaders } from './security.js';

// ── Helper deteksi tipe ──
function detectType(request) {
  const url = request.request.url;
  const mime = request.response?.mimeType || '';
  const postData = request.request.postData || '';

  // 1. Coba dari request.type jika tersedia
  if (request.type) {
    return request.type;
  }

  // 2. Deteksi dari MIME type
  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('text/css')) return 'Stylesheet';
  if (mime.includes('javascript') || mime === 'application/javascript') return 'Script';
  if (mime.startsWith('font/')) return 'Font';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'Media';

  // 3. Deteksi dari ekstensi file
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (['png','jpg','jpeg','gif','bmp','webp','svg','ico','avif','tiff'].includes(ext)) return 'Image';
  if (ext === 'css') return 'Stylesheet';
  if (['js','mjs','ts','jsx','tsx','jsonp'].includes(ext)) return 'Script';
  if (['woff','woff2','ttf','otf','eot','sfnt'].includes(ext)) return 'Font';
  if (['mp4','webm','ogg','mp3','wav','flac','avi','mov','mkv','m4a','aac'].includes(ext)) return 'Media';

  // 4. Deteksi WebSocket dari header Upgrade
  const headers = request.request.headers || [];
  for (const h of headers) {
    if (h.name.toLowerCase() === 'upgrade' && h.value.toLowerCase() === 'websocket') {
      return 'WebSocket';
    }
  }
  if (url.startsWith('ws://') || url.startsWith('wss://')) return 'WebSocket';

  // 5. Deteksi API dari request body
  if (postData && typeof postData === 'string' && postData.length > 0) {
    // Jika ada body, kemungkinan API
    try {
      JSON.parse(postData);
      return 'API (JSON)';
    } catch {
      // Bukan JSON, mungkin form atau lainnya
      if (postData.includes('=') && !postData.includes('\n')) {
        return 'API (Form)';
      }
    }
  }

  // 6. Deteksi dari header Accept
  for (const h of headers) {
    if (h.name.toLowerCase() === 'accept') {
      const val = h.value.toLowerCase();
      if (val.includes('json')) return 'API (JSON)';
      if (val.includes('xml')) return 'API (XML)';
    }
  }

  // 7. Deteksi dari URL path
  const path = url.split('?')[0];
  const pathSegments = path.split('/').filter(Boolean);
  const lastSegment = pathSegments.pop() || '';
  if (lastSegment.includes('api') || lastSegment.includes('graphql') || 
      path.includes('/api/') || path.includes('/graphql/') ||
      path.includes('/rest/')) {
    return 'API';
  }

  return 'Other';
}

// ── Fungsi filter utama ──
function shouldCapture(request) {
  const url = request.request.url;
  const method = request.request.method || 'GET';
  const type = detectType(request);
  const mode = captureFilter.mode;

  // Mode 'all' → tangkap semua (kecuali internal yang sudah difilter di luar)
  if (mode === 'all') return true;

  // Mode 'api' → hanya tangkap API (REST, GraphQL, dll)
  if (mode === 'api') {
    // Skip statis, media, WebSocket
    const skipTypes = ['Image', 'Stylesheet', 'Script', 'Font', 'Media', 'WebSocket'];
    if (skipTypes.includes(type)) return false;
    
    // Skip OPTIONS
    if (method === 'OPTIONS') return false;
    
    // Deteksi jika ini API:
    // - Ada response JSON/XML
    // - URL mengandung api/graphql
    // - Ada request body JSON
    const mime = request.response?.mimeType || '';
    const postData = request.request.postData || '';
    
    // Jika response MIME adalah JSON/XML, anggap API
    if (mime.includes('json') || mime.includes('xml')) return true;
    
    // Jika URL mengandung api/graphql/rest, anggap API
    if (url.includes('/api/') || url.includes('/graphql/') || 
        url.includes('/rest/') || url.includes('api.') || 
        url.includes('graphql.')) {
      return true;
    }
    
    // Jika ada postData dan bukan file upload, anggap API
    if (postData && typeof postData === 'string' && postData.length > 0) {
      // Coba parse JSON
      try {
        JSON.parse(postData);
        return true;
      } catch {
        // Cek apakah form data (ada key=value)
        if (postData.includes('=') && !postData.includes('\n')) {
          return true;
        }
      }
    }
    
    // Jika response bukan HTML dan ada header Accept JSON
    const headers = request.request.headers || [];
    for (const h of headers) {
      if (h.name.toLowerCase() === 'accept') {
        if (h.value.toLowerCase().includes('json')) {
          return true;
        }
      }
    }
    
    // Default: skip (anggap bukan API)
    return false;
  }

  // Mode 'custom' → terapkan checkbox
  if (mode === 'custom') {
    const c = captureFilter.custom;
    if (c.skipImages && type === 'Image') return false;
    if (c.skipCSS && type === 'Stylesheet') return false;
    if (c.skipJS && type === 'Script') return false;
    if (c.skipFonts && type === 'Font') return false;
    if (c.skipMedia && type === 'Media') return false;
    if (c.skipWebSocket && type === 'WebSocket') return false;
    if (c.skipOptions && method === 'OPTIONS') return false;
    if (c.httpOnly) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return false;
      }
    }
    return true;
  }

  // fallback
  return true;
}

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

// ── Cancel request ──
export function cancelRequest(idx) {
  if (sendingId !== idx) return;
  if (!abortController) return;
  setCancelRequested(true);
  abortController.abort();
  statusText.textContent = 'Canceling…';
}

// ── CAPTURE REQUEST ──
export function startCapture() {
  chrome.devtools.network.onRequestFinished.addListener(async (request) => {

    const url = request.request.url;

    if (
        url.startsWith('chrome-extension://') ||
        url.startsWith('chrome://') ||
        url.startsWith('devtools://') ||
        url.startsWith('blob:') ||
        url.startsWith('data:') ||
        url.startsWith('about:')
    ) {
        return;
    }

    // Terapkan filter
    if (!shouldCapture(request)) {
      return;
    }

    let hasAuth = false;

    const reqHeaders = {};

    request.request.headers.forEach(({ name, value }) => {
      reqHeaders[name.toLowerCase()] = value;
    });

    hasAuth = detectAuth(reqHeaders).hasAuth;

    const queryParams = (request.request.queryString || [])
      .filter(({ name }) => name)
      .map(({ name, value }) => ({ name, value }));

    const postData = request.request.postData || '';

    console.log('POST-DATA ===========> ', postData);

    let responseBody = '';
    try {
      const content = await new Promise((resolve) => {
        request.getContent((body, encoding) => {
          resolve(body);
        });
      });
      responseBody = content;
    } catch (e) {
      console.warn('[WebSlurp] Gagal ambil response body:', e);
      responseBody = '';
    }

    
    const respHeaders = {};
    request.response.headers.forEach(h => { respHeaders[h.name.toLowerCase()] = h.value; });

    const contentType = respHeaders['content-type'] || '';

    const bodyInfo = detectBodyInfo(postData, reqHeaders);

    const category = detectCategory({
      url: request.request.url,
      method: request.request.method || 'GET',
      requestHeaders: reqHeaders,
      responseHeaders: respHeaders,
      requestBody: bodyInfo.requestBody,
      responseBody: responseBody
    });

    const sensitive = detectSensitiveData(responseBody);

    const securityFindings = analyzeSecurityHeaders(respHeaders);

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
      queryParams,
      bodyMode: bodyInfo.bodyMode,
      bodyRawType: bodyInfo.bodyRawType,
      category: category,
      formDataFields: [],
      auth: { type: 'none' },
      hasAuth: hasAuth,
      hasSensitiveData: sensitive.hasSensitiveData,
      sensitiveTypes: {
        pii: sensitive.pii.types,
        secrets: sensitive.secrets.types
      },
      securityFindings:securityFindings
    };

    logs.unshift(log);
    if (logs.length > 200) logs.pop();
    await saveLogs();
    
    renderList();

    // if (selectedId === null) {
    //   setSelectedId(0);
    //   renderDetail(0);
    // } else {
    //   // selectedId akan bergeser karena unshift
    //   // kita update referensi
    //   setSelectedId(0);
    //   renderDetail(0);
    // }
  });
}

// ── Helper: ambil data dari form ──
function getCurrentRequestData(idx) {
  const log = logs[idx];
  if (!log) return null;

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
  const headers = headersToObject(headersArr);

  return {
    url,
    method,
    body,
    headers,
    auth: log.auth || { type: 'none' },
    bodyMode: log.bodyMode || 'none',
    bodyRawType: log.bodyRawType || 'text',
    formDataFields: log.formDataFields || [],
  };
}

// ── Helper: tambahkan header auth ──
function applyAuthToHeaders(headers, auth) {
  const newHeaders = { ...headers };
  if (auth.type === 'basic') {
    const creds = btoa(unescape(encodeURIComponent(`${auth.username || ''}:${auth.password || ''}`)));
    newHeaders['Authorization'] = `Basic ${creds}`;
  } else if (auth.type === 'bearer') {
    if (auth.token) newHeaders['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'oauth2') {
    if (auth.accessToken) newHeaders['Authorization'] = `Bearer ${auth.accessToken}`;
  }
  return newHeaders;
}

// ── Generate cURL dari data (bukan dari log) ──
export function generateCurlFromData(data) {
  const method = data.method || 'GET';
  const url = data.url;
  const headers = applyAuthToHeaders(data.headers || {}, data.auth || { type: 'none' });
  const bodyMode = data.bodyMode || 'none';
  const formFields = data.formDataFields || [];

  let parts = [`curl -X ${method}`];

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
      const dataStr = params.toString();
      if (dataStr) {
        const escaped = dataStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`--data-raw "${escaped}"`);
      }
    } else if (bodyMode === 'raw') {
      const body = data.body || '';
      if (body) {
        const escaped = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`--data-raw "${escaped}"`);
      }
    }
  }

  parts.push(`"${url}"`);
  return parts.join(' \\\n  ');
}

// ── Send Request (menggunakan data aktual dari form) ──
export async function sendRequest(idx) {
  if (sendingId !== null) return;

  const data = getCurrentRequestData(idx);
  if (!data) return;

  let { url, method, body, headers, auth, bodyMode, formDataFields } = data;
  headers = applyAuthToHeaders(headers, auth);
  headers = cleanHeaders(headers);

  const mode = bodyMode;
  let fetchOptions = { method, headers };

  if (mode === 'raw') {
    const rawType = data.bodyRawType || 'text';
    if (rawType === 'json' && !headers['content-type'] && !headers['Content-Type'])
      headers['Content-Type'] = 'application/json';
    else if (rawType === 'xml' && !headers['content-type'] && !headers['Content-Type'])
      headers['Content-Type'] = 'application/xml';
    if (body && method !== 'GET' && method !== 'HEAD')
      fetchOptions.body = body;
  } else if (mode === 'form-data') {
    const formData = new FormData();
    (formDataFields || []).forEach(f => {
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
    (formDataFields || []).forEach(f => { if (f.key) params.append(f.key, f.value || ''); });
    fetchOptions.body = params.toString();
    if (!headers['content-type'] && !headers['Content-Type'])
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  if (method === 'GET' || method === 'HEAD') delete fetchOptions.body;
  fetchOptions.headers = headers;
  url = ensureValidUrl(url);

  // Buat AbortController dan simpan di state
  const controller = new AbortController();
  setAbortController(controller);
  setCancelRequested(false);
  let isTimeout = false;

  // Gunakan timeoutMs dari state
  const tid = setTimeout(() => {
    isTimeout = true;
    controller.abort();
  }, timeoutMs);
  setTimeoutId(tid);


  setSendingId(idx);
  delete logs[idx]?.sendStatus;
  // renderDetail(idx);

  try {
    statusText.textContent = 'Sending…';
    const start = Date.now();
    const response = await fetch(url, fetchOptions);
    const elapsed = Date.now() - start;
    const responseBody = await response.text();

    const respHeaders = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });

    const newLog = {
      ...logs[idx],
      url,
      method,
      requestHeaders: data.headers, // simpan headers tanpa auth (auth tetap terpisah)
      requestBody: (mode === 'form-data' || mode === 'x-www-form-urlencoded') ? '' : body,
      response: responseBody,
      responseHeaders: respHeaders,
      status: response.status,
      statusText: response.statusText,
      time: new Date().toLocaleTimeString(),
      sendStatus: response.ok ? 'success' : 'error',
      sendDuration: elapsed,
      mime: response.headers.get('content-type') || '',
      isEdited: true,
    };
    // logs[idx] = newLog;

    // --- Kembalikan log asli ke snapshot (agar tidak berubah) ---
    logs[idx] = structuredClone(originalLogSnapshot);

    const newIdx = idx + 1;
    logs.splice(newIdx, 0, newLog);
    
    await saveLogs();

    setOriginalLogSnapshot(null); // clear snapshot

    await saveLogs();
    setSendingId(null);
    setSelectedId(newIdx);
    setActiveTab('response');
    renderList();
    renderDetail(newIdx);
    statusText.textContent = `Sent (${response.status}) in ${elapsed}ms`;
  } catch (err) {

    // Bersihkan timeout jika belum terjadi
    clearTimeout(timeoutId);
    setTimeoutId(null);

    let sendStatus = 'error';
    let sendError = err.message;

    if (err.name === 'AbortError') {
      if (cancelRequested) {
        sendStatus = 'canceled';
        sendError = 'Request canceled by user';
      } else if (isTimeout) {
        sendStatus = 'timeout';
        sendError = 'Request timed out';
      } else {
        sendStatus = 'error';
        sendError = 'Request aborted';
      }
    } else {
      sendStatus = 'error';
      sendError = err.message;
    }

    logs[idx] = { ...logs[idx], sendStatus: 'error', sendError: err.message };
    await saveLogs();
    setSendingId(null);
    setAbortController(null);
    setCancelRequested(false);
    renderDetail(idx);
    statusText.textContent = `❌ ${sendError}`;
    console.error('[WebSlurp] Send error:', err);
  } finally {
    // Pastikan cleanup
    clearTimeout(timeoutId);
    setTimeoutId(null);
    setAbortController(null);
    setCancelRequested(false);
    if (sendingId === idx) {
      setSendingId(null);
    }
    renderList();
  }
}

// ── Fungsi untuk mengubah timeout dan menyimpannya ──
export function updateTimeout(newTimeoutMs) {
  const ms = parseInt(newTimeoutMs, 10);
  if (isNaN(ms) || ms < 1000) {
    statusText.textContent = 'Timeout must be at least 1000ms';
    return;
  }
  // Update state
  import('./state.js').then(module => {
    module.setTimeoutMs(ms);
    module.saveTimeoutSetting();
    statusText.textContent = `Timeout set to ${ms}ms`;
  });
}

// ── Copy cURL (menggunakan data aktual dari form) ──
export function copyAsCurl(idx) {
  if (idx === undefined || idx === null) return;

  const data = getCurrentRequestData(idx);
  if (!data) return;

  // Update log dengan data terbaru dari form (tanpa response)
  logs[idx] = {
    ...logs[idx],
    url: data.url,
    method: data.method,
    requestHeaders: data.headers, // tanpa auth
    requestBody: data.body,
    // bodyMode, formDataFields, auth tetap dari log (tidak berubah)
  };
  saveLogs();

  const curl = generateCurlFromData(data);
  navigator.clipboard.writeText(curl)
    .then(() => statusText.textContent = 'cURL copied!')
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = curl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      statusText.textContent = 'cURL copied!';
    });
}