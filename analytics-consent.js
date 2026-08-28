(() => {
  'use strict';

  const key = 'type2learn-optional-analytics-consent-v1';
  const googleId = 'G-9ER1QJLGCW';
  const cloudflareToken = 'dc0ad786ed4e4a2c93f125b847e013c7';

  const loadOptionalAnalytics = () => {
    if (document.querySelector('[data-type2learn-google-analytics]')) return;
    const google = document.createElement('script');
    google.async = true;
    google.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(googleId);
    google.dataset.type2learnGoogleAnalytics = 'true';
    document.head.append(google);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', googleId, { anonymize_ip: true });

    const cloudflare = document.createElement('script');
    cloudflare.type = 'module';
    cloudflare.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cloudflare.dataset.cfBeacon = JSON.stringify({ token: cloudflareToken });
    cloudflare.dataset.type2learnCloudflareAnalytics = 'true';
    document.head.append(cloudflare);
  };

  const setChoice = (choice) => {
    try { localStorage.setItem(key, choice); } catch (_) { /* Consent remains page-scoped if storage is unavailable. */ }
    if (choice === 'accepted') loadOptionalAnalytics();
  };

  const readChoice = () => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };

  const showChoice = () => {
    const banner = document.createElement('aside');
    banner.className = 'type2learn-analytics-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Optional analytics choice');
    banner.innerHTML = '<p><strong>Optional website measurement</strong><br>Help us understand which public pages are useful. This is optional and never required for learning.</p><div><button type="button" data-analytics-choice="reject">No thanks</button><button type="button" data-analytics-choice="accept">Allow optional analytics</button></div>';
    banner.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-analytics-choice]')?.dataset.analyticsChoice;
      if (!choice) return;
      setChoice(choice === 'accept' ? 'accepted' : 'rejected');
      banner.remove();
    });
    document.body.append(banner);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const choice = readChoice();
    if (choice === 'accepted') loadOptionalAnalytics();
    else if (!choice) showChoice();
  }, { once: true });
})();
