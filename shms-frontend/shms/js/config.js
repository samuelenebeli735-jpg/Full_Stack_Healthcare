(function() {
  var scripts = document.querySelectorAll('script[src$="config.js"]');
  if (scripts.length) {
    var src = scripts[0].src;
    window.SHMS_BASE = src.substring(0, src.lastIndexOf('/js/') + 1);
  } else {
    var path = location.pathname;
    window.SHMS_BASE = path.substring(0, path.lastIndexOf('/') + 1);
  }

  var configuredBase = window.SHMS_API_BASE;
  var fallbackBase = window.location && window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5000/api/v1'
    : window.location && window.location.hostname === 'localhost'
      ? 'http://localhost:5000/api/v1'
      : window.location && window.location.origin
        ? window.location.origin + '/api/v1'
        : '/api/v1';
  var sameOriginBase = window.location && window.location.origin
    ? window.location.origin + '/api/v1'
    : '';
  var isLocalHost = window.location
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  var useConfiguredBase = !isLocalHost && configuredBase && String(configuredBase).trim();

  window.SHMS_API_BASE = useConfiguredBase
    ? String(configuredBase).trim()
    : fallbackBase;
})();
