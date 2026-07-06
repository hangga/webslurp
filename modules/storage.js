// modules/storage.js
import { logs, setLogs, setIgnoreStorageChange } from './state.js';

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