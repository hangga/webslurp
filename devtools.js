// Buat panel di DevTools
chrome.devtools.panels.create(
  "API Slurp",           // Judul panel
  "icons/icon16.png",    // Icon (opsional, bisa gunakan path relatif)
  "panel.html",          // Halaman konten panel
  function(panel) {
    console.log("Panel API Slurp created");
  }
);