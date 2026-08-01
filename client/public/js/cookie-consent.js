(function(){
  'use strict';
  var STORAGE_KEY = 'ws_cookie_consent';
  var consent = localStorage.getItem(STORAGE_KEY);

  // Already accepted: upgrade to personalized ads
  if (consent === 'accepted') {
    upgradeToPersonalizedAds();
    return;
  }

  // Rejected or first visit: show banner (ads already loaded with data-npa="1" = non-personalized, GDPR-compliant)
  var banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.innerHTML = '<div class="cc-inner">'
    + '<div class="cc-text">'
      + '<span class="cc-title">🍪 Cookie Consent</span>'
      + '<p>We use cookies and similar technologies for advertising (Google AdSense) and analytics. By accepting, you enable personalized ads. Rejecting keeps non-personalized ads only (no tracking cookies). <a href="/privacy.html" target="_blank">Learn more →</a></p>'
    + '</div>'
    + '<div class="cc-buttons">'
      + '<button class="cc-btn cc-reject" id="cc-reject">Reject All</button>'
      + '<button class="cc-btn cc-accept" id="cc-accept">Accept All</button>'
    + '</div>'
  + '</div>';
  document.body.appendChild(banner);

  function rejectNonEssential(){
    localStorage.setItem(STORAGE_KEY, 'rejected');
    // Keep non-personalized ads (data-npa="1" already set in HTML) — no action needed
    // Disable Google Analytics advertising features
    if (typeof gtag === 'function') {
      gtag('set', 'allow_google_signals', false);
      gtag('set', 'allow_ad_personalization_signals', false);
    }
    banner.remove();
  }

  function acceptAll(){
    localStorage.setItem(STORAGE_KEY, 'accepted');
    // Upgrade to personalized ads
    upgradeToPersonalizedAds();
    banner.remove();
  }

  function upgradeToPersonalizedAds(){
    // Remove non-personalized AdSense script, load personalized version
    var oldScript = document.querySelector('script[src*="pagead2.googlesyndication.com"]');
    if (oldScript && oldScript.hasAttribute('data-npa')) {
      oldScript.remove();
      var newScript = document.createElement('script');
      newScript.async = true;
      newScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4900795709684139';
      newScript.crossOrigin = 'anonymous';
      document.head.appendChild(newScript);
    }
    // Re-enable Google Analytics advertising features
    if (typeof gtag === 'function') {
      gtag('set', 'allow_google_signals', true);
      gtag('set', 'allow_ad_personalization_signals', true);
    }
  }

  document.getElementById('cc-accept').addEventListener('click', acceptAll);
  document.getElementById('cc-reject').addEventListener('click', rejectNonEssential);
})();
