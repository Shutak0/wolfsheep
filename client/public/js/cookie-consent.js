(function(){
  'use strict';
  var STORAGE_KEY = 'ws_cookie_consent';
  // Check if consent was already given
  if (localStorage.getItem(STORAGE_KEY)) return;

  var banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.innerHTML = '<div class="cc-inner">'
    + '<div class="cc-text">'
      + '<span class="cc-title">🍪 Cookie Consent</span>'
      + '<p>We use cookies and similar technologies to provide our service, and for advertising and analytics purposes (Google AdSense). You can accept all cookies or reject non-essential ones. <a href="/privacy.html" target="_blank">Learn more →</a></p>'
    + '</div>'
    + '<div class="cc-buttons">'
      + '<button class="cc-btn cc-reject" id="cc-reject">Reject All</button>'
      + '<button class="cc-btn cc-accept" id="cc-accept">Accept All</button>'
    + '</div>'
  + '</div>';
  document.body.appendChild(banner);

  // Force ad scripts to respect consent
  function rejectNonEssential(){
    // Block AdSense by not loading personalized ads
    localStorage.setItem(STORAGE_KEY, 'rejected');
    // Remove AdSense scripts that may have loaded
    var scripts = document.querySelectorAll('script[src*="pagead2.googlesyndication.com"]');
    scripts.forEach(function(s){ s.remove(); });
    // Disable Google Analytics advertising features
    if (typeof gtag === 'function') {
      gtag('set', 'allow_google_signals', false);
      gtag('set', 'allow_ad_personalization_signals', false);
    }
    banner.remove();
  }

  function acceptAll(){
    localStorage.setItem(STORAGE_KEY, 'accepted');
    banner.remove();
  }

  document.getElementById('cc-accept').addEventListener('click', acceptAll);
  document.getElementById('cc-reject').addEventListener('click', rejectNonEssential);
})();