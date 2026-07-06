// modules/state.js
export let logs = [];
export let selectedId = null;
export let editingId = null;
export let sendingId = null;
export let activeTab = 'request';
export let activeSubTab = 'params';
export const MAX_LOGS = 200;
export let ignoreStorageChange = false;

// DOM refs (diekspor agar dipakai modul lain)
export const logListEl = document.getElementById('log-list');
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

// Fungsi setter agar bisa diupdate dari luar
export function setLogs(newLogs) { logs = newLogs; }
export function setSelectedId(id) { selectedId = id; }
export function setEditingId(id) { editingId = id; }
export function setSendingId(id) { sendingId = id; }
export function setActiveTab(tab) { activeTab = tab; }
export function setActiveSubTab(sub) { activeSubTab = sub; }
export function setIgnoreStorageChange(val) { ignoreStorageChange = val; }