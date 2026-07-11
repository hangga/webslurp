// ── STATE ──
export let logs = [];
export let selectedId = null;
// export let editingId = null;
export let sendingId = null;
export let activeTab = 'request';
export let activeSubTab = 'params';
export const MAX_LOGS = 200;
export let ignoreStorageChange = false;

// ── Setters ──
// export function setLogs(newLogs) { logs = newLogs; }
export function setLogs(newLogs) {
  logs.length = 0;
  logs.push(...newLogs);
}
export function setSelectedId(id) { selectedId = id; }
// export function setEditingId(id) { editingId = id; }
export function setSendingId(id) { sendingId = id; }
export function setActiveTab(tab) { activeTab = tab; }
export function setActiveSubTab(sub) { activeSubTab = sub; }
export function setIgnoreStorageChange(val) { ignoreStorageChange = val; }

// ── DOM refs ──
export const logListEl = document.getElementById('log-list');
export const logListContainer = document.getElementById('log-list-container');
export const detailEmpty = document.getElementById('detail-empty');
export const detailContent = document.getElementById('detail-content');
export const searchInput = document.getElementById('search');
export const filterMethod = document.getElementById('filter-method');
export const filterStatus = document.getElementById('filter-status');
export const filterContent = document.getElementById('filter-content');
export const countBadge = document.getElementById('count-badge');
export const statusText = document.getElementById('status-text');
export const statusCount = document.getElementById('status-count');
export const divider = document.getElementById('divider');

// ── State untuk group expand ──
export let expandedGroups = new Set();

export function toggleGroup(hostname) {
  if (expandedGroups.has(hostname)) {
    expandedGroups.delete(hostname);
  } else {
    expandedGroups.add(hostname);
  }
}

export function isGroupExpanded(hostname) {
  return expandedGroups.has(hostname);
}

// ── State untuk tema ──
export let theme = 'theme-jetbrains';
export function setTheme(t) { theme = t; }

export const captureFilter = {
  mode: 'api', // 'api' | 'all' | 'custom'
  custom: {
    httpOnly: true,
    skipOptions: true,
    skipImages: true,
    skipCSS: true,
    skipJS: true,
    skipFonts: true,
    skipMedia: true,
    skipWebSocket: true,
  }
};

// ── State untuk abort / timeout / cancel ──
export let abortController = null;
export let cancelRequested = false;
export let timeoutId = null;
export let timeoutMs = 30000; // default 30 detik

export function setAbortController(ctrl) { abortController = ctrl; }
export function setCancelRequested(val) { cancelRequested = val; }
export function setTimeoutId(id) { timeoutId = id; }
export function setTimeoutMs(ms) { timeoutMs = ms; }

// ── Fungsi untuk menyimpan dan memuat timeout dari storage ──
import { saveSettings, loadSettings } from './storage.js';

export async function loadTimeoutSetting() {
  const settings = await loadSettings();
  if (settings && typeof settings.timeoutMs === 'number') {
    timeoutMs = settings.timeoutMs;
  }
}

export function saveTimeoutSetting() {
  saveSettings({ timeoutMs });
}