import { logs, searchInput
  , filterMethod
  , filterStatus
  , filterContent 
} from './state.js';

export function filterLogs() {
  const keyword = searchInput.value.toLowerCase().trim();
  const method = filterMethod.value;
  const status = filterStatus.value;
  // const content = filterContent.value.toLowerCase().trim();
  const content = keyword;

  return logs.filter(log => {
    if (keyword && !log.url.toLowerCase().includes(keyword)) return false;
    if (method && log.method !== method) return false;
    if (status) {
      const code = log.status;
      if (status === '2xx' && (code < 200 || code >= 300)) return false;
      if (status === '3xx' && (code < 300 || code >= 400)) return false;
      if (status === '4xx' && (code < 400 || code >= 500)) return false;
      if (status === '5xx' && (code < 500 || code >= 600)) return false;
    }
    if (content) {
      const haystack = (log.url + ' ' + (log.requestBody || '') + ' ' + (log.response || '')).toLowerCase();
      if (!haystack.includes(content)) return false;
    }
    return true;
  });
}