// Thin wrapper around gtag.js (GA4). Respects the user's opt-out in Settings.

import { isAnalyticsEnabled } from "./settings.js";

const MEASUREMENT_ID = "G-4HE281TMHC";

let initialized = false;

function loadGtag() {
  if (initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function initAnalytics() {
  if (isAnalyticsEnabled()) {
    loadGtag();
  }
}

export function trackEvent(name, params = {}) {
  if (!isAnalyticsEnabled() || !window.gtag) return;
  window.gtag("event", name, params);
}

export function setAnalyticsRuntimeEnabled(enabled) {
  if (enabled) {
    loadGtag();
  } else if (window.gtag) {
    window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
  }
}
