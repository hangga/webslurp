// modules/rceScanner.js
// Improved RCE Scanner with confidence scoring, baseline, random tokens, staged scanning
// No external dependencies

// ─── Helpers ───────────────────────────────────────────────

function generateRandomToken(prefix = 'SW_') {
  const rand = Math.random().toString(36).substring(2, 10);
  return prefix + rand;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Fetch with timeout and abort support ──────────────────

function fetchWithTimeout(url, options, timeout = 10000, abortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Jika abortSignal dari luar dibatalkan, batalkan juga request ini
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

// ─── Baseline Measurement ──────────────────────────────────

async function measureBaseline(url, options, samples = 3, abortSignal) {
  const times = [];
  let status = null;
  let length = 0;
  let headers = {};
  let body = '';

  for (let i = 0; i < samples; i++) {
    // Jika sinyal cancel aktif, hentikan
    if (abortSignal?.aborted) {
      throw new Error('Scan cancelled');
    }

    try {
      const start = Date.now();
      const resp = await fetchWithTimeout(url, options, 10000, abortSignal);
      const elapsed = Date.now() - start;
      times.push(elapsed);
      const text = await resp.text();
      if (i === 0) {
        status = resp.status;
        length = text.length;
        headers = Object.fromEntries(resp.headers);
        body = text;
      }
      await sleep(200);
    } catch (err) {
      // Jika dibatalkan, lemparkan error
      if (err.message === 'Scan cancelled' || err.name === 'AbortError') {
        throw new Error('Scan cancelled');
      }
      // Abaikan error lain agar baseline tetap bisa dihitung jika ada request yang gagal
    }
  }

  if (times.length === 0) {
    throw new Error('Baseline failed: no successful requests');
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    average: avg,
    samples: times,
    status,
    length,
    headers,
    body,
  };
}

// ─── Response Comparison ──────────────────────────────────

function compareResponses(baseline, response) {
  const diff = {
    statusChanged: baseline.status !== response.status,
    lengthChanged: Math.abs(baseline.length - response.length) > (baseline.length * 0.1),
    timeDiff: response.elapsed - baseline.average,
    headersChanged: false,
  };

  const baseKeys = Object.keys(baseline.headers);
  const respKeys = Object.keys(response.headers);
  if (baseKeys.length !== respKeys.length) diff.headersChanged = true;
  else {
    for (const k of baseKeys) {
      if (baseline.headers[k] !== response.headers[k]) {
        diff.headersChanged = true;
        break;
      }
    }
  }
  return diff;
}

// ─── Payload Encoding ──────────────────────────────────────

function urlEncode(str) {
  return encodeURIComponent(str);
}

function doubleUrlEncode(str) {
  return encodeURIComponent(encodeURIComponent(str));
}

function generatePayloadVariants(payload) {
  return [
    { encoded: payload, label: 'raw' },
    { encoded: urlEncode(payload), label: 'url' },
    { encoded: doubleUrlEncode(payload), label: 'double_url' },
  ];
}

// ─── Payload Definitions ──────────────────────────────────

function getPayloads() {
  return {
    output: {
      linux: [
        { payload: ';echo __TOKEN__', os: 'linux' },
        { payload: '|echo __TOKEN__', os: 'linux' },
        { payload: '||echo __TOKEN__', os: 'linux' },
        { payload: '&echo __TOKEN__', os: 'linux' },
        { payload: '&&echo __TOKEN__', os: 'linux' },
        { payload: '$(echo __TOKEN__)', os: 'linux' },
        { payload: '`echo __TOKEN__`', os: 'linux' },
        { payload: '\necho __TOKEN__\n', os: 'linux' },
      ],
      windows: [
        { payload: '&echo __TOKEN__', os: 'windows' },
        { payload: '|echo __TOKEN__', os: 'windows' },
        { payload: '||echo __TOKEN__', os: 'windows' },
        { payload: '&&echo __TOKEN__', os: 'windows' },
        { payload: '\necho __TOKEN__\n', os: 'windows' },
      ],
    },
    time: {
      linux: [
        { payload: ';sleep 5', os: 'linux', delay: 5 },
        { payload: '|sleep 5', os: 'linux', delay: 5 },
        { payload: '||sleep 5', os: 'linux', delay: 5 },
        { payload: '&sleep 10', os: 'linux', delay: 10 },
        { payload: '&&sleep 10', os: 'linux', delay: 10 },
        { payload: '$(sleep 5)', os: 'linux', delay: 5 },
        { payload: '`sleep 5`', os: 'linux', delay: 5 },
        { payload: '\nsleep 5\n', os: 'linux', delay: 5 },
      ],
      windows: [
        { payload: '&ping -n 6 127.0.0.1', os: 'windows', delay: 5 },
        { payload: '|ping -n 6 127.0.0.1', os: 'windows', delay: 5 },
        { payload: '||ping -n 6 127.0.0.1', os: 'windows', delay: 5 },
        { payload: '&&ping -n 6 127.0.0.1', os: 'windows', delay: 5 },
        { payload: '&ping -n 11 127.0.0.1', os: 'windows', delay: 10 },
        { payload: '|ping -n 11 127.0.0.1', os: 'windows', delay: 10 },
        { payload: '\nping -n 6 127.0.0.1\n', os: 'windows', delay: 5 },
      ],
    },
  };
}

// ─── Parameter Extraction ──────────────────────────────────

function extractParams(log) {
  const params = [];

  // 1. From URL query string
  try {
    const urlObj = new URL(log.url);
    const searchParams = new URLSearchParams(urlObj.search);
    for (const [key, value] of searchParams) {
      params.push({ key, value, location: 'query' });
    }
  } catch {}

  // 2. From body (if POST)
  if (log.method === 'POST' && log.requestBody) {
    const contentType = (log.requestHeaders?.['content-type'] || '').toLowerCase();
    const body = log.requestBody;

    // 2a. application/x-www-form-urlencoded
    if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formParams = new URLSearchParams(body);
        for (const [key, value] of formParams) {
          params.push({ key, value, location: 'body' });
        }
      } catch {}
    }

    // 2b. application/json
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(body);
        const traverse = (obj, prefix = '') => {
          if (typeof obj !== 'object' || obj === null) return;
          for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              params.push({ key: fullKey, value: String(value), location: 'body-json' });
            } else if (typeof value === 'object') {
              traverse(value, fullKey);
            }
          }
        };
        traverse(json);
      } catch {}
    }

    // 2c. multipart/form-data - simple extraction of field names
    if (contentType.includes('multipart/form-data')) {
      const matches = body.match(/name="([^"]+)"/g);
      if (matches) {
        for (const m of matches) {
          const key = m.replace(/name="/, '').replace(/"$/, '');
          params.push({ key, value: '', location: 'body-multipart' });
        }
      }
    }
  }

  // 3. From headers (common user-input headers)
  const headerKeys = ['x-forwarded-for', 'x-remote-ip', 'x-original-ip', 'x-client-ip', 'referer', 'user-agent'];
  if (log.requestHeaders) {
    for (const h of headerKeys) {
      if (log.requestHeaders[h]) {
        params.push({ key: h, value: log.requestHeaders[h], location: 'header' });
      }
    }
  }

  // 4. From cookies (if any)
  if (log.requestHeaders?.cookie) {
    const cookies = log.requestHeaders.cookie.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      const [key, value] = cookie.split('=');
      if (key && value) {
        params.push({ key: 'cookie_' + key, value, location: 'cookie' });
      }
    }
  }

  // deduplicate by key+location
  const seen = new Set();
  const unique = params.filter(p => {
    const id = p.key + '|' + p.location;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return unique;
}

// ─── Injection Helpers ─────────────────────────────────────

function injectPayload(log, param, payload, encoding = 'raw') {
  let targetUrl = log.url;
  let body = log.requestBody || '';
  const headers = { ...log.requestHeaders };
  delete headers['content-length'];

  const encodedPayload = encoding === 'url' ? urlEncode(payload) :
                         encoding === 'double_url' ? doubleUrlEncode(payload) : payload;

  if (param.location === 'query') {
    const urlObj = new URL(targetUrl);
    const params = new URLSearchParams(urlObj.search);
    if (params.has(param.key)) {
      params.set(param.key, params.get(param.key) + encodedPayload);
    } else {
      params.append(param.key, 'test' + encodedPayload);
    }
    urlObj.search = params.toString();
    targetUrl = urlObj.toString();
  } else if (param.location === 'body') {
    try {
      const formParams = new URLSearchParams(body);
      if (formParams.has(param.key)) {
        formParams.set(param.key, formParams.get(param.key) + encodedPayload);
      } else {
        formParams.append(param.key, 'test' + encodedPayload);
      }
      body = formParams.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } catch {
      body = body.replace(param.value, param.value + encodedPayload);
    }
  } else if (param.location === 'body-json') {
    try {
      const json = JSON.parse(body);
      const keys = param.key.split('.');
      let current = json;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      const lastKey = keys[keys.length - 1];
      if (typeof current[lastKey] === 'string') {
        current[lastKey] = current[lastKey] + encodedPayload;
      } else {
        current[lastKey] = String(current[lastKey]) + encodedPayload;
      }
      body = JSON.stringify(json);
      headers['Content-Type'] = 'application/json';
    } catch {
      body = body.replace(param.value, param.value + encodedPayload);
    }
  } else if (param.location === 'header') {
    const headerName = param.key;
    if (headers[headerName]) {
      headers[headerName] = headers[headerName] + encodedPayload;
    } else {
      headers[headerName] = 'test' + encodedPayload;
    }
  } else if (param.location === 'cookie') {
    const cookieHeader = headers['cookie'] || '';
    const cookieName = param.key.replace('cookie_', '');
    const cookieRegex = new RegExp(`(^|;)\\s*${cookieName}=([^;]*)`);
    const match = cookieHeader.match(cookieRegex);
    if (match) {
      const newCookie = cookieHeader.replace(match[0], `${match[1] || ''}${cookieName}=${match[2] || ''}${encodedPayload}`);
      headers['cookie'] = newCookie;
    } else {
      headers['cookie'] = cookieHeader + `; ${cookieName}=test${encodedPayload}`;
    }
  } else if (param.location === 'body-multipart') {
    const regex = new RegExp(`(name="${param.key}"\\s*\\r?\\n\\s*)([^\\r\\n]*)`, 'g');
    body = body.replace(regex, (match, prefix, value) => prefix + value + encodedPayload);
  }

  return { url: targetUrl, body, headers };
}

// ─── Staged Scanning ──────────────────────────────────────

async function runStage1(param, log, baseline, token, abortSignal, onProgress) {
  const outputPayloads = getPayloads().output;
  const allPayloads = [...outputPayloads.linux, ...outputPayloads.windows];
  const findings = [];

  for (const p of allPayloads) {
    if (abortSignal?.aborted) {
      throw new Error('Scan cancelled');
    }

    const payloadWithToken = p.payload.replace('__TOKEN__', token);
    const variants = generatePayloadVariants(payloadWithToken);

    for (const variant of variants) {
      if (abortSignal?.aborted) {
        throw new Error('Scan cancelled');
      }

      // Report progress
      if (onProgress) {
        onProgress({
          stage: 'output',
          parameter: param.key,
          location: param.location,
          payload: p.payload,
          encoding: variant.label,
          os: p.os,
          current: findings.length,
          total: allPayloads.length * variants.length,
        });
      }

      const injected = injectPayload(log, param, variant.encoded, variant.label);
      const options = {
        method: log.method,
        headers: injected.headers,
        body: log.method === 'POST' ? injected.body : undefined,
      };

      try {
        const start = Date.now();
        const resp = await fetchWithTimeout(injected.url, options, 10000, abortSignal);
        const elapsed = Date.now() - start;
        const text = await resp.text();

        if (text.includes(token)) {
          findings.push({
            parameter: param.key,
            location: param.location,
            payload: p.payload,
            encoded: variant.encoded,
            encoding: variant.label,
            os: p.os,
            technique: 'output',
            confidence: 100,
            evidence: text.slice(0, 500),
            elapsed,
            status: resp.status,
            length: text.length,
          });
        }
      } catch (err) {
        // Jika dibatalkan, lempar error
        if (err.message === 'Scan cancelled' || err.name === 'AbortError') {
          throw new Error('Scan cancelled');
        }
        // Skip error lain
      }
    }
  }
  return findings;
}

async function runStage2(param, log, baseline, token, abortSignal, onProgress) {
  const timePayloads = getPayloads().time;
  const allTimePayloads = [...timePayloads.linux, ...timePayloads.windows];
  const findings = [];

  // Deduplicate: only test one per OS per delay
  const filtered = [];
  const seen = new Set();
  for (const p of allTimePayloads) {
    const key = `${p.os}-${p.delay}`;
    if (!seen.has(key)) {
      seen.add(key);
      filtered.push(p);
    }
  }

  for (const p of filtered) {
    if (abortSignal?.aborted) {
      throw new Error('Scan cancelled');
    }

    const payloadWithToken = p.payload.replace('__TOKEN__', token);
    const variants = generatePayloadVariants(payloadWithToken);

    for (const variant of variants) {
      if (abortSignal?.aborted) {
        throw new Error('Scan cancelled');
      }

      if (onProgress) {
        onProgress({
          stage: 'time',
          parameter: param.key,
          location: param.location,
          payload: p.payload,
          encoding: variant.label,
          os: p.os,
          delay: p.delay,
          current: findings.length,
          total: filtered.length * variants.length,
        });
      }

      const injected = injectPayload(log, param, variant.encoded, variant.label);
      const options = {
        method: log.method,
        headers: injected.headers,
        body: log.method === 'POST' ? injected.body : undefined,
      };

      try {
        const start = Date.now();
        await fetchWithTimeout(injected.url, options, p.delay * 1000 + 5000, abortSignal);
        const elapsed = Date.now() - start;
        const expectedDelay = p.delay * 1000;
        const diff = elapsed - baseline.average;

        if (diff > expectedDelay * 0.7 && diff < expectedDelay * 1.3) {
          findings.push({
            parameter: param.key,
            location: param.location,
            payload: p.payload,
            encoded: variant.encoded,
            encoding: variant.label,
            os: p.os,
            technique: 'time',
            confidence: 70,
            elapsed,
            expectedDelay,
            baselineAvg: baseline.average,
            diff,
          });
        }
      } catch (err) {
        if (err.message === 'Scan cancelled' || err.name === 'AbortError') {
          throw new Error('Scan cancelled');
        }
        // ignore other errors
      }
    }
  }
  return findings;
}

// ─── Main Scanner ───────────────────────────────────────────

export async function scanRCE(log, onProgress, abortSignal) {
  const results = {
    vulnerable: false,
    confidence: 0,
    findings: [],
    error: null,
    baseline: null,
  };

  if (log.method !== 'GET' && log.method !== 'POST') {
    results.error = 'Unsupported method (only GET/POST)';
    return results;
  }

  const params = extractParams(log);
  if (params.length === 0) {
    results.error = 'No injectable parameters found. Try scanning a request with query, body, or headers.';
    return results;
  }

  // Prepare base request options
  const baseOptions = {
    method: log.method,
    headers: { ...log.requestHeaders },
    body: log.method === 'POST' ? log.requestBody || undefined : undefined,
  };
  delete baseOptions.headers['content-length'];

  // Measure baseline
  let baseline;
  try {
    baseline = await measureBaseline(log.url, baseOptions, 3, abortSignal);
    results.baseline = baseline;
  } catch (err) {
    if (err.message === 'Scan cancelled') {
      results.error = 'Analyze cancelled by user';
      return results;
    }
    results.error = 'Baseline measurement failed: ' + err.message;
    return results;
  }

  const token = generateRandomToken('SW_');

  // Stage 1: Output detection for all parameters
  const stage1Findings = [];
  for (const param of params) {
    if (abortSignal?.aborted) {
      results.error = 'Analyze cancelled by user';
      return results;
    }
    try {
      const findings = await runStage1(param, log, baseline, token, abortSignal, onProgress);
      if (findings.length > 0) {
        stage1Findings.push(...findings);
      }
    } catch (err) {
      if (err.message === 'Scan cancelled') {
        results.error = 'Analyze cancelled by user';
        return results;
      }
      // other errors: continue
    }
  }

  // Stage 2: Time-based for parameters without output findings
  const paramsWithoutOutput = params.filter(p =>
    !stage1Findings.some(f => f.parameter === p.key && f.location === p.location)
  );

  const stage2Findings = [];
  for (const param of paramsWithoutOutput) {
    if (abortSignal?.aborted) {
      results.error = 'Analyze cancelled by user';
      return results;
    }
    try {
      const findings = await runStage2(param, log, baseline, token, abortSignal, onProgress);
      if (findings.length > 0) {
        stage2Findings.push(...findings);
      }
    } catch (err) {
      if (err.message === 'Scan cancelled') {
        results.error = 'Analyze cancelled by user';
        return results;
      }
      // other errors: continue
    }
  }

  const allFindings = [...stage1Findings, ...stage2Findings];

  // Calculate overall confidence (max of individual confidences)
  let maxConfidence = 0;
  for (const f of allFindings) {
    if (f.confidence > maxConfidence) maxConfidence = f.confidence;
  }

  // Additional boost if multiple parameters vulnerable
  const uniqueParams = new Set();
  for (const f of allFindings) {
    uniqueParams.add(f.parameter + '|' + f.location);
  }
  if (uniqueParams.size > 1) {
    maxConfidence = Math.min(100, maxConfidence + 20);
  }

  results.vulnerable = allFindings.length > 0;
  results.confidence = maxConfidence;
  results.findings = allFindings;

  return results;
}