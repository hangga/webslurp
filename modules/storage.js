// storage.js
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

// ── Ekspor logs ke file JSON ──
export function exportLogsToFile() {
  if (!logs || logs.length === 0) {
    alert('Tidak ada data untuk diekspor.');
    return;
  }
  const data = JSON.stringify(logs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // a.download = `brutu-logs-${new Date().toISOString().slice(0,10)}.json`;
  
  const timestamp = new Date().toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .slice(0, 19);

  a.download = `brutu-logs-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Impor logs dari file JSON ──
export function importLogsFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) {
          reject(new Error('Format file tidak valid: harus berupa array.'));
          return;
        }
        // Validasi sederhana: pastikan setiap item memiliki properti url
        if (data.length > 0 && !data[0].url) {
          reject(new Error('Data tidak dikenali sebagai log BrutuSuite.'));
          return;
        }
        setLogs(data);
        await saveLogs();
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}