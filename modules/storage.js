import { logs, setLogs, ignoreStorageChange, setIgnoreStorageChange } from './state.js';

export async function saveLogs() {
  setIgnoreStorageChange(true);
  try {
    await chrome.storage.local.set({ logs });
  } finally {
    setIgnoreStorageChange(false);
  }
}

export async function loadLogs() {
  const result = await chrome.storage.local.get('logs');
  setLogs(result.logs || []);
}

export async function saveCaptureFilter(filter) {
  await chrome.storage.local.set({ captureFilter: filter });
}

export async function loadCaptureFilter() {
  const result = await chrome.storage.local.get('captureFilter');
  return result.captureFilter || null;
}