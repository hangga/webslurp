import { logs, selectedId, setSelectedId, detailEmpty, detailContent, statusText } from './state.js';
import { loadLogs } from './storage.js';
import { renderList, renderDetail, selectLog } from './render.js';

export async function refresh() {
  await loadLogs();
  renderList();
  if (selectedId !== null && !logs[selectedId]) {
    setSelectedId(null);
  }
  // if (selectedId !== null) {
  //   renderDetail(selectedId);
  // } else if (logs.length > 0) {
  //   selectLog(0);
  // } else {
  //   detailEmpty.style.display = 'block';
  //   detailContent.style.display = 'none';
  // }

  if (selectedId !== null) {
    renderDetail(selectedId);
  } else {
    detailEmpty.style.display = 'block';
    detailContent.style.display = 'none';
  }
}