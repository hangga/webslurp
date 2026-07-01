let attachedTabs = {};
let logs = [];
const MAX_LOGS = 200;

const pendingRequests = new Map();

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

// Hapus action.onClicked agar tidak ada popup

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "attach") {
        const target = { tabId: msg.tabId };
        chrome.debugger.attach(target, "1.3").catch(() => {});
        attachedTabs[msg.tabId] = true;
        chrome.debugger.sendCommand(target, "Network.enable");
        sendResponse({ success: true });
        return;
    }
    if (msg.action === "clear") {
        logs = [];
        saveLogs().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSent") {
        if (!attachedTabs[source.tabId]) return;
        const requestId = params.requestId;
        const request = params.request;
        pendingRequests.set(requestId, {
            method: request.method,
            headers: request.headers,
            postData: request.postData || ''
        });
    }
});

chrome.debugger.onEvent.addListener(async (source, method, params) => {
    if (method !== "Network.responseReceived") return;
    if (!attachedTabs[source.tabId]) return;

    const requestId = params.requestId;
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

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

    let body = "";
    try {
        const response = await chrome.debugger.sendCommand(source, "Network.getResponseBody", {
            requestId: requestId
        });
        body = response.body;
    } catch {}

    await addLog({
        time: new Date().toLocaleTimeString(),
        url: url,
        status: params.response.status,
        statusText: params.response.statusText || "",
        mime: params.response.mimeType,
        method: pending.method || 'GET',
        requestHeaders: pending.headers || {},
        requestBody: pending.postData || '',
        response: body
    });

    pendingRequests.delete(requestId);
});