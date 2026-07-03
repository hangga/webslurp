let attachedTabs = {};
let logs = [];
const MAX_LOGS = 200;
const pendingRequests = new Map(); // requestId -> { method, headers, postData, url }

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

// --- Helper: cari header case-insensitive ---
function getHeader(headers, name) {
    if (!headers) return undefined;
    const lowerName = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lowerName) return headers[key];
    }
    return undefined;
}

// --- Event 1: Request akan dikirim (ambil headers dasar & url) ---
chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSent") {
        if (!attachedTabs[source.tabId]) return;
        const requestId = params.requestId;
        const request = params.request;

        // Simpan headers awal (mungkin tidak lengkap)
        const headersCopy = { ...request.headers };

        // Simpan pending dengan url untuk nanti ambil cookie
        pendingRequests.set(requestId, {
            method: request.method,
            headers: headersCopy,
            postData: request.postData,
            url: request.url
        });
    }
});

// --- Event 2: Informasi tambahan (header lengkap & postData) ---
chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSentExtraInfo") {
        const requestId = params.requestId;
        const pending = pendingRequests.get(requestId);
        if (!pending) return;

        // Jika ExtraInfo memberikan headers (biasanya lengkap)
        if (params.headers) {
            // Gabungkan headers dari ExtraInfo (lebih lengkap)
            // Tapi hati-hati, ExtraInfo mungkin juga tidak punya Cookie
            const extraHeaders = { ...params.headers };
            // Timpa headers yang sudah ada dengan yang lebih lengkap
            pending.headers = extraHeaders;
        }

        // Ambil postData jika ada
        if (params.postData) {
            let data = params.postData.data || '';
            if (params.postData.base64Encoded) {
                try {
                    data = atob(data);
                } catch {
                    // biarkan sebagai base64
                }
            }
            pending.postData = data;
        }
    }
});

// --- Event 3: Response diterima (simpan log, ambil cookie dari cookies API jika perlu) ---
chrome.debugger.onEvent.addListener(async (source, method, params) => {
    if (method !== "Network.responseReceived") return;
    if (!attachedTabs[source.tabId]) return;

    const requestId = params.requestId;
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

    // Filter host
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

    // --- Ambil response body ---
    let body = "";
    try {
        const response = await chrome.debugger.sendCommand(
            source,
            "Network.getResponseBody",
            { requestId }
        );
        if (response.base64Encoded) {
            try {
                body = atob(response.body);
            } catch {
                body = response.body;
            }
        } else {
            body = response.body;
        }
    } catch {}

    // --- Response headers ---
    const rawHeaders = params.response.headers || [];
    const responseHeaders = {};
    if (Array.isArray(rawHeaders)) {
        rawHeaders.forEach(h => {
            responseHeaders[h.name] = h.value;
        });
    } else if (typeof rawHeaders === 'object') {
        Object.assign(responseHeaders, rawHeaders);
    }

    // --- Ambil headers request ---
    let requestHeaders = pending.headers || {};

    // Jika tidak ada Cookie di headers, ambil dari chrome.cookies API
    const cookieHeader = getHeader(requestHeaders, 'cookie');
    if (!cookieHeader) {
        console.log('[BrutuSuite] Cookie tidak ada di headers, mengambil dari chrome.cookies API...');
        try {
            // Ambil semua cookie untuk URL ini
            const cookies = await chrome.cookies.getAll({ url: pending.url });
            if (cookies.length > 0) {
                // Bentuk string cookie: name=value; name2=value2
                const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                // Tambahkan ke headers
                requestHeaders['Cookie'] = cookieString;
                console.log('[BrutuSuite] Cookie berhasil diambil dari cookies API:', cookieString);
            } else {
                console.log('[BrutuSuite] Tidak ada cookie untuk URL ini.');
            }
        } catch (err) {
            console.error('[BrutuSuite] Gagal mengambil cookie:', err);
        }
    } else {
        console.log('[BrutuSuite] Cookie sudah ada di headers:', cookieHeader);
    }

    // --- Simpan log ---
    await addLog({
        time: new Date().toLocaleTimeString(),
        url: url,
        status: params.response.status,
        statusText: params.response.statusText || "",
        mime: params.response.mimeType,
        method: pending.method || 'GET',
        requestHeaders: requestHeaders,
        requestBody: pending.postData || '',
        response: body,
        responseHeaders: responseHeaders
    });

    pendingRequests.delete(requestId);
});