// security.js
// ============================================================
// SHARED HELPERS (internal)
// ============================================================

function normalizeKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/[\s.-]+/g, '_');
}

function findPatternMatches(text, patterns) {
  const found = new Set();
  for (const { type, regex, validator } of patterns) {
    const re = new RegExp(regex.source, regex.flags);
    const matches = text.match(re);
    if (!matches) continue;
    if (!validator || matches.some(match => validator(match))) {
      found.add(type);
    }
  }
  return found;
}

function traverseJSON(value, callback, path = '', seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;
    callback(key, child, currentPath);
    if (child && typeof child === 'object') {
      traverseJSON(child, callback, currentPath, seen);
    }
  }
}

function tryParseJSON(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isValidLuhn(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0, shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// ============================================================
// PII DETECTION
// ============================================================
export function detectPII(text) {
  if (!text || typeof text !== 'string') {
    return {
      hasPii: false,
      types: []
    };
  }

  const found = new Set();

  // ==========================================================
  // VALIDATORS
  // ==========================================================

  const validators = {
    email(value) {
      return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(
        String(value).trim()
      );
    },

    phone(value) {
      const raw = String(value).trim();

      // Tolak karakter yang tidak lazim untuk nomor telepon.
      if (!/^\+?[\d\s().-]+$/.test(raw)) return false;

      const digits = raw.replace(/\D/g, '');

      // E.164 maksimal 15 digit.
      return digits.length >= 7 && digits.length <= 15;
    },

    indonesiaPhone(value) {
      const normalized = String(value)
        .trim()
        .replace(/[\s().-]/g, '');

      return /^(?:\+62|62|0)8[1-9]\d{6,11}$/.test(normalized);
    },

    nik(value) {
      const nik = String(value).trim();

      if (!/^\d{16}$/.test(nik)) return false;

      const dayRaw = Number(nik.slice(6, 8));
      const month = Number(nik.slice(8, 10));
      const year = Number(nik.slice(10, 12));

      // NIK perempuan: tanggal lahir + 40.
      const day = dayRaw > 40
        ? dayRaw - 40
        : dayRaw;

      if (day < 1 || day > 31) return false;
      if (month < 1 || month > 12) return false;

      // Validasi tanggal kalender.
      const currentYear = new Date().getFullYear() % 100;
      const century = year <= currentYear ? 2000 : 1900;
      const fullYear = century + year;

      const date = new Date(fullYear, month - 1, day);

      return (
        date.getFullYear() === fullYear &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    },

    ssn(value) {
      return /^(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}$/.test(
        String(value).trim()
      );
    },

    creditCard(value) {
      const digits = String(value).replace(/\D/g, '');

      if (digits.length < 13 || digits.length > 19) {
        return false;
      }

      if (/^(\d)\1+$/.test(digits)) {
        return false;
      }

      let sum = 0;
      let double = false;

      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = Number(digits[i]);

        if (double) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }

        sum += digit;
        double = !double;
      }

      return sum % 10 === 0;
    },

    dateOfBirth(value) {
      const raw = String(value).trim();

      // YYYY-MM-DD
      let match = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

      if (match) {
        return isValidDate(
          Number(match[1]),
          Number(match[2]),
          Number(match[3])
        );
      }

      // DD/MM/YYYY atau DD-MM-YYYY
      match = raw.match(
        /^(\d{2})[/-](\d{2})[/-](\d{4})$/
      );

      if (match) {
        return isValidDate(
          Number(match[3]),
          Number(match[2]),
          Number(match[1])
        );
      }

      return false;
    }
  };


  // ==========================================================
  // HELPERS
  // ==========================================================

  function isValidDate(year, month, day) {
    const now = new Date();

    // DOB masuk akal: tidak di masa depan dan max 120 tahun.
    if (
      year < now.getFullYear() - 120 ||
      year > now.getFullYear()
    ) {
      return false;
    }

    const date = new Date(year, month - 1, day);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  function normalizeKey(key) {
    return String(key)
      .trim()
      .toLowerCase()
      .replace(/[\s.-]+/g, '_');
  }

  function hasMeaningfulValue(value) {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      return (
        trimmed !== '' &&
        trimmed.toLowerCase() !== 'null' &&
        trimmed.toLowerCase() !== 'undefined'
      );
    }

    return true;
  }


  // ==========================================================
  // KEY + VALUE RULES
  // ==========================================================

  const rules = [
    {
      type: 'email',
      keys: [
        'email',
        'email_address',
        'emailaddress',
        'user_email',
        'contact_email'
      ],
      validate: validators.email
    },

    {
      type: 'phone',
      keys: [
        'phone',
        'phone_number',
        'phonenumber',
        'mobile',
        'mobile_number',
        'mobilenumber',
        'telephone',
        'tel',
        'whatsapp',
        'wa_number'
      ],
      validate: validators.phone
    },

    {
      type: 'nik',
      keys: [
        'nik',
        'nomor_induk_kependudukan',
        'national_id',
        'national_id_number'
      ],
      validate: validators.nik
    },

    {
      type: 'ssn',
      keys: [
        'ssn',
        'social_security_number'
      ],
      validate: validators.ssn
    },

    {
      type: 'credit_card',
      keys: [
        'credit_card',
        'credit_card_number',
        'card_number',
        'cardnumber',
        'pan'
      ],
      validate: validators.creditCard
    },

    {
      type: 'date_of_birth',
      keys: [
        'dob',
        'date_of_birth',
        'dateofbirth',
        'birth_date',
        'birthdate',
        'tanggal_lahir'
      ],
      validate: validators.dateOfBirth
    },

    // Untuk field semantik ini, key memberi konteks utama.
    {
      type: 'name',
      keys: [
        'full_name',
        'fullname',
        'first_name',
        'firstname',
        'last_name',
        'lastname',
        'given_name',
        'family_name'
      ],
      validate(value) {
        const str = String(value).trim();

        return (
          str.length >= 2 &&
          str.length <= 100 &&
          /[\p{L}]/u.test(str) &&
          !/^\d+$/.test(str)
        );
      }
    },

    {
      type: 'address',
      keys: [
        'home_address',
        'residential_address',
        'street_address',
        'postal_address',
        'billing_address',
        'shipping_address',
        'alamat'
      ],
      validate(value) {
        return (
          typeof value === 'string' &&
          value.trim().length >= 5
        );
      }
    }
  ];


  // ==========================================================
  // ANALYZE KEY + VALUE
  // ==========================================================

  function analyzeEntry(key, value) {
    if (!hasMeaningfulValue(value)) {
      return;
    }

    const normalizedKey = normalizeKey(key);

    for (const rule of rules) {
      if (!rule.keys.includes(normalizedKey)) {
        continue;
      }

      // Hindari object dianggap sebagai scalar PII.
      if (
        typeof value === 'object' &&
        value !== null
      ) {
        continue;
      }

      if (rule.validate(value)) {
        found.add(rule.type);
      }
    }
  }


  // ==========================================================
  // RECURSIVE OBJECT ANALYSIS
  // ==========================================================

  function traverse(value, seen = new WeakSet()) {
    if (
      !value ||
      typeof value !== 'object'
    ) {
      return;
    }

    if (seen.has(value)) {
      return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item, seen);
      }

      return;
    }

    for (const [key, child] of Object.entries(value)) {
      analyzeEntry(key, child);

      if (
        child &&
        typeof child === 'object'
      ) {
        traverse(child, seen);
      }
    }
  }


  // ==========================================================
  // 1. JSON
  // ==========================================================

  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed === 'object'
    ) {
      traverse(parsed);
    }
  } catch {
    // Not JSON.
  }


  // ==========================================================
  // 2. FORM URL ENCODED
  // ==========================================================

  try {
    if (
      text.includes('=') &&
      !text.trim().startsWith('{')
    ) {
      const params = new URLSearchParams(text);

      for (const [key, value] of params.entries()) {
        analyzeEntry(key, value);
      }
    }
  } catch {
    // Ignore malformed data.
  }


  // ==========================================================
  // 3. HIGH-CONFIDENCE RAW TEXT PATTERNS
  // ==========================================================

  const rawPatterns = [
    {
      type: 'email',
      regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      validate: validators.email
    },

    {
      type: 'ssn',
      regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
      validate: validators.ssn
    },

    {
      type: 'credit_card',
      regex: /\b(?:\d[ -]?){13,19}\b/g,
      validate: validators.creditCard
    }
  ];

  for (const {
    type,
    regex,
    validate
  } of rawPatterns) {
    const matches = text.match(regex);

    if (
      matches &&
      matches.some(validate)
    ) {
      found.add(type);
    }
  }


  // ==========================================================
  // RESULT
  // ==========================================================

  return {
    hasPii: found.size > 0,
    types: [...found]
  };
}

// ============================================================
// SECRET / CREDENTIAL DETECTION
// ============================================================

export function detectSecrets(text) {
  if (!text || typeof text !== 'string') {
    return { hasSecrets: false, types: [] };
  }

  // const patterns = [
  //   { type: 'jwt', regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  //   { type: 'bearer_token', regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi },
  //   { type: 'api_key', regex: /\b(?:api[-_.]?key|apikey)\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi },
  //   { type: 'access_token', regex: /\baccess[-_.]?token\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi },
  //   { type: 'refresh_token', regex: /\brefresh[-_.]?token\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi },
  //   { type: 'auth_token', regex: /\bauth[-_.]?token\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi },
  //   { type: 'password', regex: /\b(?:password|passwd|pwd)\b\s*["']?\s*[:=]\s*["']?[^\s"',}&]{3,}/gi },
  //   { type: 'client_secret', regex: /\bclient[-_.]?secret\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi },
  //   { type: 'secret_key', regex: /\b(?:secret[-_.]?key|api[-_.]?secret)\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi },
  //   { type: 'private_key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g }
  // ];

  // const found = findPatternMatches(text, patterns);

  // const vendorPatterns = [
  //   { type: 'aws_access_key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  //   { type: 'github_token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  //   { type: 'github_pat', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  //   { type: 'google_api_key', regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  //   { type: 'stripe_secret_key', regex: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  //   { type: 'slack_token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g }
  // ];

  const VALUE = `[A-Za-z0-9._~+/=-]{8,}`;

  const patterns = [
    // Generic
    { type: 'jwt', regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
    { type: 'bearer_token', regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi },
    { type: 'private_key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },

    // Common secret fields
    ...[
      'api[-_.]?key',
      'access[-_.]?token',
      'refresh[-_.]?token',
      'id[-_.]?token',
      'auth(?:entication)?[-_.]?token',
      'oauth[-_.]?token',
      'session[-_.]?(?:token|id)',
      '(?:csrf|xsrf)[-_.]?token',
      'client[-_.]?secret',
      'client[-_.]?id',
      'secret[-_.]?key',
      'api[-_.]?secret'
    ].map(name => ({
      type: name.replace(/[^\w]+/g, '_'),
      regex: new RegExp(`\\b(?:${name})\\b\\s*["']?\\s*[:=]\\s*["']?${VALUE}`, 'gi')
    })),

    // Passwords
    {
      type: 'password',
      regex: /\b(?:password|passwd|pwd)\b\s*["']?\s*[:=]\s*["']?[^\s"',}&]{3,}/gi
    },

    // Cookies
    {
      type: 'cookie',
      regex: /\b(?:set-cookie|cookie)\b\s*[:=]\s*[^\r\n]{10,}/gi
    }
  ];

  const vendorPatterns = [
    { type: 'aws_access_key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
    { type: 'github_token', regex: /\b(?:gh[pours]|github_pat)_[A-Za-z0-9_]{20,}\b/g },
    { type: 'gitlab_token', regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
    { type: 'google_api_key', regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
    { type: 'stripe_key', regex: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
    { type: 'slack_token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { type: 'sendgrid_api_key', regex: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
    { type: 'mailgun_api_key', regex: /\bkey-[A-Za-z0-9]{32}\b/g },
    { type: 'twilio_sid', regex: /\b(?:AC|SK)[a-f0-9]{32}\b/gi },
    { type: 'shopify_access_token', regex: /\bshpat_[A-Za-z0-9]{32,}\b/g },
    { type: 'openai_api_key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g }
  ];

  const found = [
    ...findPatternMatches(text, patterns),
    ...findPatternMatches(text, vendorPatterns)
  ];

  const vendorFound = findPatternMatches(text, vendorPatterns);
  for (const type of vendorFound) found.add(type);

  const json = tryParseJSON(text);
  if (json) {
    const sensitiveKeys = [
      { type: 'password', regex: /^(?:password|passwd|pwd|passphrase)$/ },
      { type: 'access_token', regex: /^(?:access_token|accesstoken)$/ },
      { type: 'refresh_token', regex: /^(?:refresh_token|refreshtoken)$/ },
      { type: 'auth_token', regex: /^(?:auth_token|authtoken)$/ },
      { type: 'token', regex: /^(?:token|id_token|idtoken)$/ },
      { type: 'api_key', regex: /^(?:api_key|apikey)$/ },
      { type: 'client_secret', regex: /^(?:client_secret|clientsecret)$/ },
      { type: 'secret_key', regex: /^(?:secret|secret_key|secretkey|api_secret|apisecret)$/ },
      { type: 'private_key', regex: /^(?:private_key|privatekey)$/ }
    ];

    traverseJSON(json, (key, value) => {
      if (value === null || value === undefined || value === '') return;
      const normalizedKey = normalizeKey(key);
      for (const pattern of sensitiveKeys) {
        if (pattern.regex.test(normalizedKey)) {
          found?.add?.(pattern.type);
          break;
        }
      }
    });
  }

  return { hasSecrets: found.size > 0, types: [...found] };
}

// ============================================================
// AGGREGATOR
// ============================================================

export function detectSensitiveData(text) {
  const pii = detectPII(text);
  const secrets = detectSecrets(text);
  return {
    hasSensitiveData: pii.hasPii || secrets.hasSecrets,
    pii,
    secrets
  };
}


// ============================================================
// DETEKSI AUTH di HEADER
// ============================================================
export function detectAuth(headers = {}) {
  const types = new Set();

  // Authorization
  const authorization = headers.authorization?.trim();

  if (authorization) {
    const match = authorization.match(/^(\S+)\s+(.+)$/);

    if (match) {
      const scheme = match[1].toLowerCase();
      const credential = match[2].trim();

      if (isLikelyCredential(credential)) {
        types.add(`${scheme}_auth`);
      }
    }
  }

  // Custom auth headers
  for (const name of ['x-auth-token', 'x-access-token']) {
    if (isLikelyCredential(headers[name])) {
      types.add('auth_token');
    }
  }

  // Cookies
  if (headers.cookie) {
    for (const cookie of parseCookies(headers.cookie)) {
      if (isLikelyAuthCookie(cookie.name, cookie.value)) {
        types.add('auth_cookie');
        break;
      }
    }
  }

  return {
    hasAuth: types.size > 0,
    types: [...types]
  };
}


function parseCookies(cookieHeader) {
  return cookieHeader
    .split(';')
    .map(part => {
      const index = part.indexOf('=');

      if (index === -1) return null;

      return {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim()
      };
    })
    .filter(Boolean);
}


function isLikelyAuthCookie(name, value) {
  if (!name || !isLikelyCredential(value)) {
    return false;
  }

  const normalized = name.toLowerCase();

  // Strong auth/session indicators.
  const strongPatterns = [
    /^sid$/,
    /^session$/,
    /^sessionid$/,
    /^session_id$/,
    /^jsessionid$/,
    /^phpsessid$/,
    /^connect\.sid$/,

    /(?:^|[_-])session(?:[_-]|$)/,
    /(?:^|[_-])auth(?:[_-]|$)/,
    /(?:^|[_-])access[_-]?token(?:[_-]|$)/,
    /(?:^|[_-])id[_-]?token(?:[_-]|$)/,

    // Common Google authentication cookies.
    /^(?:__secure-)?(?:1p|3p)?sid$/,
    /^(?:__secure-)?(?:1p|3p)?sidcc$/,
    /^(?:__secure-)?(?:1p|3p)?sidts$/,
    /^(?:__secure-)?(?:1p|3p)?apisid$/,
    /^hsid$/,
    /^ssid$/,
    /^osid$/
  ];

  return strongPatterns.some(pattern => pattern.test(normalized));
}


function isLikelyCredential(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  if (trimmed.length < 8) {
    return false;
  }

  const invalid = new Set([
    'null',
    'undefined',
    'none',
    'false',
    'true',
    'bearer',
    'token'
  ]);

  return !invalid.has(trimmed.toLowerCase());
}

// ============================================================
// VALIDATORS
// ============================================================

function isValidBearerCredential(value) {
  if (!isValidTokenValue(value)) {
    return false;
  }

  // JWT
  if (
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  ) {
    return true;
  }

  // Opaque bearer token
  return /^[A-Za-z0-9._~+/=-]{8,}$/.test(value);
}

function isValidBasicCredential(value) {
  if (!value || value.length < 4) {
    return false;
  }

  // Basic auth harus berupa Base64.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }

  try {
    const decoded = atob(value);

    // Basic credentials berbentuk username:password
    return decoded.includes(':');
  } catch {
    return false;
  }
}

function isValidDigestCredential(value) {
  if (!value) {
    return false;
  }

  // Minimal field yang lazim pada Digest auth.
  return (
    /\busername\s*=/i.test(value) &&
    /\bresponse\s*=/i.test(value)
  );
}

function isValidTokenValue(value) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  // Placeholder / empty-like values.
  const invalidValues = new Set([
    '',
    'null',
    'undefined',
    'none',
    'false',
    'true',
    'bearer',
    'token',
    'empty',
    'nil'
  ]);

  if (invalidValues.has(normalized)) {
    return false;
  }

  return value.length >= 8;
}

const severityIcons = {
  info: 'ℹ️',
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴'
};

// sesuai namanya.. dah jelaskan..
export function analyzeSecurityHeaders(headers) {
  const findings = [];

  const getHeader = (name) => {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value : value ? [value] : [];
  };

  const hasHeader = (name) => getHeader(name).length > 0;

  // const addFinding = (type, severity, message) => {
  //   findings.push({
  //     type,
  //     severity,
  //     icon: severityIcons[severity] ?? '',
  //     message: `${severityIcons[severity] ?? ''} [${severity.toUpperCase()}] ${message}`
  //   });
  // };

  const addFinding = (type, severity, message) => {
    findings.push({
      type,
      severity,
      icon: severityIcons[severity] ?? '',
      message: `[${severity.toUpperCase()}] ${message}`
    });
  };

  // Missing security headers
  // if (!hasHeader('content-security-policy')) {
  //   addFinding(
  //     'missing-csp',
  //     'medium',
  //     'Content-Security-Policy header is missing'
  //   );
  // }

  const contentType = getHeader('content-type').join(',').toLowerCase();

  const isHtml =
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml');

  // hanya cek CSP untuk dokumen HTML
  if (isHtml && !hasHeader('content-security-policy')) {
    addFinding(
      'missing-csp',
      'low', // atau 'info'
      'No CSP on HTML document (defense-in-depth)'
    );
  }

  // if (!hasHeader('strict-transport-security')) {
  //   addFinding(
  //     'missing-hsts',
  //     'low',
  //     'Strict-Transport-Security header is missing'
  //   );
  // }

  // if (!hasHeader('x-content-type-options')) {
  //   addFinding(
  //     'missing-nosniff',
  //     'low',
  //     'X-Content-Type-Options header is missing'
  //   );
  // }

  // CORS
  if (getHeader('access-control-allow-origin').includes('*')) {
    addFinding(
      'cors-wildcard',
      'medium',
      'Wildcard CORS policy detected'
    );
  }

  // Technology disclosure
  for (const value of getHeader('server')) {
    addFinding(
      'server-disclosure',
      'info',
      `Server disclosed: ${value}`
    );
  }

  for (const value of getHeader('x-powered-by')) {
    addFinding(
      'technology-disclosure',
      'info',
      `Technology disclosed: ${value}`
    );
  }

  // Cookie security
  for (const cookie of getHeader('set-cookie')) {
    if (!/;\s*secure\b/i.test(cookie)) {
      addFinding(
        'cookie-missing-secure',
        'medium',
        'Cookie is missing the Secure attribute'
      );
    }

    if (!/;\s*httponly\b/i.test(cookie)) {
      addFinding(
        'cookie-missing-httponly',
        'medium',
        'Cookie is missing the HttpOnly attribute'
      );
    }

    if (!/;\s*samesite=/i.test(cookie)) {
      addFinding(
        'cookie-missing-samesite',
        'low',
        'Cookie is missing the SameSite attribute'
      );
    }
  }

  return findings;
}