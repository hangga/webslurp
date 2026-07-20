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

// Deprecated
export function buildUrlWithParams(log) {
  let url = log.url || '';
  const params = log.queryParams || [];
  const qs = params.filter(p => p.key).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  if (qs) {
    const separator = url.includes('?') ? '&' : '?';
    url = url + separator + qs;
  }
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

export function getCategoryIcon(category) {
  switch (category) {
    case 'html':
      return '📄';

    case 'css':
      return '🎨';

    case 'js':
      return 'JS';

    case 'api':
      return '{}';

    case 'graphql':
      return '⬢';

    case 'xml':
      return '⟨⟩';

    case 'form':
      return '✎';

    case 'upload':
      return '⇪';

    case 'image':
      return '🏞️';

    case 'video':
      return '🎬';

    case 'audio':
      return '♫';

    case 'font':
      return 'T';

    case 'pdf':
      return 'PDF';

    case 'archive':
      return 'ZIP';

    case 'wasm':
      return '⬡';

    case 'stream':
      return '≈';

    case 'sse':
      return '⇄';

    case 'sourcemap':
      return '⌖';

    default:
      return '•';
  }
}

export function getBaseDomain(hostname) {
  // Hapus 'www.' di awal
  hostname = hostname.replace(/^www\./, '');
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  // Daftar TLD dua tingkat yang umum (bisa ditambah sesuai kebutuhan)
  const twoLevelTlds = new Set([
    'co.uk', 'com.au', 'co.id', 'ac.id', 'or.id',
    'co.jp', 'ne.jp', 'com.sg', 'org.sg', 'com.my'
  ]);
  // Cek apakah dua bagian terakhir membentuk TLD dua tingkat
  const lastTwo = parts.slice(-2).join('.');
  if (twoLevelTlds.has(lastTwo)) {
    // Ambil tiga bagian terakhir
    return parts.slice(-3).join('.');
  }
  // Default: ambil dua bagian terakhir
  return parts.slice(-2).join('.');
}

export function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function detectCategory({
    url = '',
    method = '',
    requestHeaders = {},
    responseHeaders = {},
    requestBody = '',
    responseBody = ''
}) {
    url = url.toLowerCase();

    const reqContentType =
        (requestHeaders['content-type'] || '').split(';')[0].toLowerCase();

    const respContentType =
        (responseHeaders['content-type'] || '').split(';')[0].toLowerCase();

    const contentType = respContentType || reqContentType;

    // ===== Berdasarkan Content-Type =====
    if (contentType.includes('text/html')) return 'html';
    if (contentType.includes('text/css')) return 'css';
    if (contentType.includes('javascript') || contentType.includes('ecmascript')) return 'js';

    if (
        contentType.includes('application/json') ||
        contentType.includes('application/ld+json')
    ) {
        const isGraphQL =
            url.includes('/graphql') ||
            /"query"\s*:/.test(requestBody);

        return isGraphQL ? 'graphql' : 'api';
    }

    if (contentType.includes('application/xml') || contentType.includes('text/xml'))
        return 'xml';

    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';

    if (
        contentType.includes('woff') ||
        contentType.includes('ttf') ||
        contentType.includes('font')
    )
        return 'font';

    if (contentType.includes('application/pdf')) return 'pdf';

    if (contentType.includes('application/wasm')) return 'wasm';

    // ===== Berdasarkan URL =====

    const pathname = new URL(url).pathname.toLowerCase();

    if (pathname.endsWith('.js') || pathname.endsWith('.mjs'))
        return 'js';

    if (pathname.endsWith('.css'))
        return 'css';

    if (/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/i.test(pathname))
        return 'image';

    if (/\.(mp4|webm|mov|avi|mkv)$/i.test(pathname))
        return 'video';

    if (/\.(woff2?|ttf|otf|eot)$/i.test(pathname))
        return 'font';

    if (pathname.endsWith('.pdf'))
        return 'pdf';

    // ===== Heuristik API =====

    if (
        url.includes('/api/') ||
        url.includes('/graphql') ||
        /^api\./.test(new URL(url).hostname)
    ) {
        return url.includes('/graphql') ? 'graphql' : 'api';
    }

    // ===== Berdasarkan Body =====

    if (responseBody) {
        const body = responseBody.trim();

        if (
            (body.startsWith('{') && body.endsWith('}')) ||
            (body.startsWith('[') && body.endsWith(']'))
        ) {
            return 'api';
        }
    }

    // ===== Berdasarkan HTTP Method =====

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()))
        return 'api';

    return 'other';
}

export async function getLatestVersion() {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/hangga/webslurp/refs/heads/main/manifest.json"
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    console.log(data.version); // 1.5.0
    console.log(data.message);

    return data;
  } catch (err) {
    console.error(err);
    return null;
  }
}

// helpers.js – tambahkan di bagian bawah

// /**
//  * Parse multipart/form-data body string menjadi array field.
//  * @param {string} body - Raw multipart body
//  * @param {string} boundary - Boundary string (dari Content-Type)
//  * @returns {Array<{key: string, value: string, type: 'text'|'file', filename?: string}>}
//  */
// export function parseMultipartFormData(body, boundary) {
//   const fields = [];
//   if (!body || !boundary) return fields;

//   // Boundary biasanya sudah termasuk '--' di awal, tapi kita pastikan
//   const cleanBoundary = boundary.replace(/^--/, '');
//   const delimiter = `--${cleanBoundary}`;
//   const closeDelimiter = `--${cleanBoundary}--`;

//   // Split berdasarkan delimiter
//   const parts = body.split(delimiter).filter(part => part.trim() && part !== '--');

//   for (const part of parts) {
//     // Jika part adalah penutup, skip
//     if (part.trim() === '--') continue;

//     // Pisahkan headers dan content
//     const [headerBlock, ...contentParts] = part.split('\r\n\r\n');
//     const content = contentParts.join('\r\n\r\n').replace(/\r\n$/, ''); // hapus trailing CRLF

//     // Parse headers
//     const headers = {};
//     const headerLines = headerBlock.split('\r\n');
//     for (const line of headerLines) {
//       const [key, ...vals] = line.split(':');
//       if (key && vals.length) {
//         headers[key.trim().toLowerCase()] = vals.join(':').trim();
//       }
//     }

//     // Ambil content-disposition
//     const disposition = headers['content-disposition'] || '';
//     const nameMatch = disposition.match(/name="([^"]+)"/);
//     const filenameMatch = disposition.match(/filename="([^"]+)"/);

//     if (!nameMatch) continue;

//     const key = nameMatch[1];
//     const filename = filenameMatch ? filenameMatch[1] : null;

//     if (filename) {
//       // File
//       fields.push({
//         key,
//         value: filename,
//         type: 'file',
//         fileContent: content, // optional, bisa disimpan jika perlu
//         filename
//       });
//     } else {
//       // Text
//       fields.push({
//         key,
//         value: content,
//         type: 'text'
//       });
//     }
//   }

//   return fields;
// }

/**
 * Parse multipart/form-data from Chrome DevTools postData.
 *
 * @param {Object} postData
 * @param {string} postData.mimeType
 * @param {string} postData.text
 * @param {Array<{name:string,value:string}>} postData.params
 *
 * @returns {Array<{
 *   key: string,
 *   value: string,
 *   type: 'text'|'file',
 *   filename?: string,
 *   contentType?: string
 * }>}
 */
export function parseMultipartFormData(postData) {
    if (!postData || !Array.isArray(postData.params)) {
        return [];
    }

    const text = postData.text || "";
    const metadata = new Map();

    // ----------------------------------------------------
    // Parse metadata (filename + content-type) dari raw body
    // ----------------------------------------------------
    if (text) {

        const boundaryMatch = postData.mimeType?.match(/boundary=([^;]+)/i);

        if (boundaryMatch) {

            const boundary = boundaryMatch[1];
            const delimiter = `--${boundary}`;

            const parts = text
                .split(delimiter)
                .slice(1, -1);

            for (let part of parts) {

                part = part.trim();

                if (!part) continue;

                const idx = part.indexOf("\r\n\r\n");

                if (idx === -1) continue;

                const headerBlock = part.substring(0, idx);

                const disposition =
                    headerBlock.match(/Content-Disposition:\s*([^\r\n]+)/i)?.[1];

                if (!disposition) continue;

                const name =
                    disposition.match(/name="([^"]+)"/i)?.[1];

                if (!name) continue;

                const filename =
                    disposition.match(/filename="([^"]*)"/i)?.[1];

                const contentType =
                    headerBlock.match(/Content-Type:\s*([^\r\n]+)/i)?.[1];

                if (filename || contentType) {
                    metadata.set(name, {
                        filename,
                        contentType
                    });
                }
            }
        }
    }

    // ----------------------------------------------------
    // Merge params + metadata
    // ----------------------------------------------------
    return postData.params.map(param => {

        const meta = metadata.get(param.name);

        return {
            key: param.name,
            value: param.value,
            type: meta ? "file" : "text",
            filename: meta?.filename,
            contentType: meta?.contentType
        };

    });
}