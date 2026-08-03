// User-configurable settings, persisted in localStorage (simple key/value, no need for IndexedDB).

const STORAGE_KEY = "podcast-player-settings";
const DEFAULT_FEED_URL = "./data/episodes.json";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Failed to read settings, using defaults:", err);
    return {};
  }
}

function writeAll(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getFeedUrl() {
  const settings = readAll();
  return settings.feedUrl || DEFAULT_FEED_URL;
}

export function setFeedUrl(url) {
  const settings = readAll();
  const trimmed = (url || "").trim();
  settings.feedUrl = trimmed || DEFAULT_FEED_URL;
  writeAll(settings);
  return settings.feedUrl;
}

export function resetFeedUrl() {
  const settings = readAll();
  delete settings.feedUrl;
  writeAll(settings);
  return DEFAULT_FEED_URL;
}

export function isDefaultFeedUrl(url) {
  return url === DEFAULT_FEED_URL;
}

export function isAnalyticsEnabled() {
  const settings = readAll();
  return settings.analyticsEnabled !== false;
}

export function setAnalyticsEnabled(enabled) {
  const settings = readAll();
  settings.analyticsEnabled = !!enabled;
  writeAll(settings);
}

export { DEFAULT_FEED_URL };
