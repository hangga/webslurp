// ── Helper functions ──
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function bodyToJson(bodyRequest) {
  if (!bodyRequest) return "";

  try {
    // Jika bodyRequest punya properti text yang berisi JSON
    if (
      typeof bodyRequest === "object" &&
      typeof bodyRequest.text === "string"
    ) {
      return JSON.stringify(JSON.parse(bodyRequest.text), null, 2);
    }

    // Jika bodyRequest langsung berupa object
    if (typeof bodyRequest === "object") {
      return JSON.stringify(bodyRequest, null, 2);
    }

    // Jika berupa string JSON
    if (typeof bodyRequest === "string") {
      return JSON.stringify(JSON.parse(bodyRequest), null, 2);
    }

    return String(bodyRequest);
  } catch {
    return typeof bodyRequest === "object"
      ? JSON.stringify(bodyRequest, null, 2)
      : String(bodyRequest);
  }
}

export function formatOutput(str) {
  str = String(str ?? '').trim();
  if (!str) return '';
  try {
    const pretty = JSON.stringify(JSON.parse(str), null, 2);
    return escapeHtml(pretty);
  } catch {
    return escapeHtml(str);
  }
}

export function statusClass(code) {
  if (code < 300) return 'status-2xx';
  if (code < 400) return 'status-3xx';
  if (code < 500) return 'status-4xx';
  return 'status-5xx';
}

export function headersToArray(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) {
    return headers.map(h => ({
      key: h.name || h.key || '',
      value: String(h.value || '')
    }));
  }
  return Object.entries(headers).map(([k, v]) => ({
    key: k,
    value: String(v)
  }));
}

export function headersToObject(arr) {
  const obj = {};
  arr.forEach(({ key, value }) => {
    if (key.trim()) obj[key.trim()] = value;
  });
  return obj;
}

export function ensureValidUrl(url) {
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

export function cleanHeaders(headers) {
  const forbidden = [
    'host', 'content-length', 'connection', 'keep-alive',
    'transfer-encoding', 'upgrade', 'via', 'proxy-connection'
  ];
  const cleaned = {};
  for (const [key, value] of Object.entries(headers)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    if (trimmedKey.startsWith(':')) continue;
    if (/[\s:]/.test(trimmedKey)) continue;
    if (/[\x00-\x1f\x7f]/.test(trimmedKey)) continue;
    const lowerKey = trimmedKey.toLowerCase();
    if (forbidden.includes(lowerKey)) continue;
    const val = (value !== undefined && value !== null) ? String(value) : '';
    cleaned[trimmedKey] = val;
  }
  return cleaned;
}

export function buildUrlWithParams(log) {
  let url = log.url || '';
  const params = log.queryParams || [];
  const qs = params.filter(p => p.key.trim()).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  if (qs) {
    const separator = url.includes('?') ? '&' : '?';
    url = url + separator + qs;
  }
  return url;
}