(function() {
  var scripts = document.querySelectorAll('script[src$="config.js"]');
  if (scripts.length) {
    var src = scripts[0].src;
    window.SHMS_BASE = src.substring(0, src.lastIndexOf('/js/') + 1);
  } else {
    var path = location.pathname;
    window.SHMS_BASE = path.substring(0, path.lastIndexOf('/') + 1);
  }

  window.SHMS_API_BASE = window.SHMS_API_BASE || 'http://localhost:5000/api/v1';
})();
