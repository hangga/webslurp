let attachedTabs = {};
let logs = [];
const MAX_LOGS = 200;

const pendingRequests = new Map(); // requestId -> { method, headers, postData }

async function saveLogs() {
    await chrome.storage.local.set({ logs });
}

async function addLog(item) {
    logs.unshift(item);
    if (logs.length > MAX_LOGS) logs.pop();
    await saveLogs();
}

chrome.runtime.onInstalled.addListener(async () => {
    await chrome.storage.local.set({ logs: [] });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "attach") {
        const target = { tabId: msg.tabId };
        chrome.debugger.attach(target, "1.3").catch(() => {});
        attachedTabs[msg.tabId] = true;
        chrome.debugger.sendCommand(target, "Network.enable");
        sendResponse({ success: true });
        return true;
    }
    if (msg.action === "clear") {
        logs = [];
        saveLogs().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
});

// --- Tangkap request akan dikirim ---
// chrome.debugger.onEvent.addListener((source, method, params) => {
//     if (method === "Network.requestWillBeSent") {
//         if (!attachedTabs[source.tabId]) return;
//         const requestId = params.requestId;
//         const request = params.request;

//         // Simpan data awal
//         pendingRequests.set(requestId, {
//             method: request.method,
//             headers: request.headers, // Termasuk Cookie jika ada
//             postData: '' // akan diisi nanti
//         });

//         // Ambil request body secara eksplisit (jika ada)
//         chrome.debugger.sendCommand(
//             source,
//             "Network.getRequestPostData",
//             { requestId },
//             (result) => {
//                 if (chrome.runtime.lastError) {
//                     // Tidak ada body atau error, biarkan kosong
//                     return;
//                 }
//                 const pending = pendingRequests.get(requestId);
//                 if (pending) {
//                     pending.postData = result.postData || '';
//                 }
//             }
//         );
//     }
// });

chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSent") {
        if (!attachedTabs[source.tabId]) return;
        const requestId = params.requestId;
        const request = params.request;

        // --- Log header untuk debugging ---
        console.log('[BrutuSuite] Request headers:', request.headers);
        if (request.headers.Cookie) {
            console.log('[BrutuSuite] Cookie ditemukan:', request.headers.Cookie);
        } else {
            console.log('[BrutuSuite] Tidak ada Cookie di header.');
        }

        // Simpan salinan header (deep copy sederhana)
        const headersCopy = {};
        for (const [key, value] of Object.entries(request.headers)) {
            headersCopy[key] = value;
        }

        pendingRequests.set(requestId, {
            method: request.method,
            headers: headersCopy,
            postData: ''
        });

        // Ambil request body (jika ada)
        chrome.debugger.sendCommand(
            source,
            "Network.getRequestPostData",
            { requestId },
            (result) => {
                if (chrome.runtime.lastError) return;
                const pending = pendingRequests.get(requestId);
                if (pending && result.postData) {
                    pending.postData = result.postData;
                }
            }
        );
    }
});

// --- Tangkap response diterima ---
chrome.debugger.onEvent.addListener(async (source, method, params) => {
    if (method !== "Network.responseReceived") return;
    if (!attachedTabs[source.tabId]) return;

    const requestId = params.requestId;
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

    // Filter berdasarkan host (sesuai logika sebelumnya)
    let page;
    try {
        page = await chrome.tabs.get(source.tabId);
    } catch {
        return;
    }
    const pageHost = new URL(page.url).hostname;
    const url = params.response.url;
    const apiHost = new URL(url).hostname;
    const base = pageHost.split('.').slice(-2).join('.');
    if (!apiHost.endsWith(base)) return;
    if (params.type !== "XHR" && params.type !== "Fetch") return;

    // Ambil response body
    let body = "";
    try {
        const response = await chrome.debugger.sendCommand(
            source,
            "Network.getResponseBody",
            { requestId }
        );
        if (response.base64Encoded) {
            // Coba decode sebagai teks (untuk JSON/XML/HTML)
            try {
                body = atob(response.body);
            } catch {
                // Jika gagal, simpan sebagai base64 (tapi mungkin tidak terbaca)
                body = response.body;
            }
        } else {
            body = response.body;
        }
    } catch {}

    // Ambil response headers
    const rawHeaders = params.response.headers || [];
    const responseHeaders = {};
    if (Array.isArray(rawHeaders)) {
        rawHeaders.forEach(h => {
            responseHeaders[h.name] = h.value;
        });
    } else if (typeof rawHeaders === 'object') {
        Object.assign(responseHeaders, rawHeaders);
    }

    // Simpan log lengkap
    await addLog({
        time: new Date().toLocaleTimeString(),
        url: url,
        status: params.response.status,
        statusText: params.response.statusText || "",
        mime: params.response.mimeType,
        method: pending.method || 'GET',
        requestHeaders: pending.headers || {}, // <-- Cookie otomatis ada di sini
        requestBody: pending.postData || '',
        response: body,
        responseHeaders: responseHeaders
    });

    pendingRequests.delete(requestId);
});