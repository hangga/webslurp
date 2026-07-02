// Buat panel di DevTools
chrome.devtools.panels.create(
  "BrutuSuite 1.0",           // Judul panel
  "icons/icon-light-16.png",    // Icon (opsional, bisa gunakan path relatif)
  "panel.html",          // Halaman konten panel
  function(panel) {
    console.log("Panel API Slurp created");
  }
);