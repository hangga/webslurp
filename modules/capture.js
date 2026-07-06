// modules/capture.js
import { logs, MAX_LOGS, selectedId, setSelectedId } from './state.js';
import { saveLogs } from './storage.js';
import { renderList, selectLog } from './render-list.js';
import { renderDetail } from './render-detail.js';

export function startCapture() {
  console.log('[BrutuSuite] Memulai capture via chrome.devtools.network');

  chrome.devtools.network.onRequestFinished.addListener(async (request) => {
    console.log('[BrutuSuite] Request tertangkap:', request.request.url, 'type:', request.type);

    // Request headers
    const reqHeaders = {};
    request.request.headers.forEach(h => { reqHeaders[h.name] = h.value; });

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
    }

    const respHeaders = {};
    request.response.headers.forEach(h => { respHeaders[h.name] = h.value; });

    const log = {
      time: new Date().toLocaleTimeString(),
      url: request.request.url,
      status: request.response.status,
      statusText: request.response.statusText || '',
      mime: request.response.mimeType || '',
      method: request.request.method || 'GET',
      requestHeaders: reqHeaders,
      requestBody: postData,
      response: responseBody,
      responseHeaders: respHeaders,
      note: '',
      queryParams: [],
      bodyMode: 'none',
      bodyRawType: 'text',
      formDataFields: [],
      auth: { type: 'none' }
    };

    logs.unshift(log);
    if (logs.length > MAX_LOGS) logs.pop();
    await saveLogs();
    renderList();

    if (selectedId === null) {
      selectLog(0);
    } else {
      setSelectedId(selectedId + 1);
      renderDetail(selectedId);
    }
  });
}