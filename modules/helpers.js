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
  if (bodyRequest == null) return "";

  try {
    let data = bodyRequest;

    // chrome.devtools HAR
    if (
      typeof bodyRequest === "object" &&
      typeof bodyRequest.text === "string"
    ) {
      data = bodyRequest.text;
    }

    if (typeof data === "string") {
      data = JSON.parse(data);
    }

    data = deepParse(data);

    return JSON.stringify(data, null, 2);
  } catch {
    if (typeof bodyRequest === "object") {
      try {
        return JSON.stringify(bodyRequest, null, 2);
      } catch {
        return String(bodyRequest);
      }
    }

    return String(bodyRequest);
  }
}

function deepParse(value) {
  if (Array.isArray(value)) {
    return value.map(deepParse);
  }

  if (value && typeof value === "object") {
    const obj = {};

    for (const [key, val] of Object.entries(value)) {
      obj[key] = deepParse(val);
    }

    return obj;
  }

  if (typeof value === "string") {
    const text = value.trim();

    // hanya coba parse jika memang terlihat seperti JSON
    if (
      text.startsWith("{") ||
      text.startsWith("[") ||
      text === "true" ||
      text === "false" ||
      text === "null" ||
      /^-?\d+(\.\d+)?$/.test(text)
    ) {
      try {
        return deepParse(JSON.parse(text));
      } catch {
        return value;
      }
    }
  }

  return value;
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
  // console.log('URL------------>', log.url);
  // const params = log.queryParams || [];
  // const qs = params.filter(p => p.key).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  // if (qs) {
  //   const separator = url.includes('?') ? '&' : '?';
  //   url = url + separator + qs;
  // }
  return url;
}

// helpers.js (tambahkan di bagian bawah)

export function formatOutputPlain(str) {
  str = String(str ?? '').trim();
  if (!str) return '';
  try {
    const pretty = JSON.stringify(JSON.parse(str), null, 2);
    return pretty;
  } catch {
    return str;
  }
}

export function highlightText(text, keyword) {
  if (!keyword || !text) return escapeHtml(text);
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedKeyword, 'gi');
  const parts = text.split(regex);
  const matches = text.match(regex) || [];
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    result += escapeHtml(parts[i]);
    if (i < matches.length) {
      result += `<span class="highlight">${escapeHtml(matches[i])}</span>`;
    }
  }
  return result;
}