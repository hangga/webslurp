// Entry point: panel.js
import { initUI, refresh } from './modules/render-list.js';
import { startCapture } from './modules/capture.js';
import { statusText } from './modules/state.js';

(async function init() {
  await refresh();
  startCapture();
  statusText.textContent = 'Listening…';
  console.log('[BrutuSuite] Panel siap, menunggu request...');
})();

// Export agar event listener dari storage bisa diakses jika perlu
export { refresh };