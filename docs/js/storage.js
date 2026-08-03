// IndexedDB (episode/playlist state + playback history) and Cache API (audio bytes).

const DB_NAME = "podcast-player-db";
const DB_VERSION = 1;
const AUDIO_CACHE_NAME = "podcast-audio-v1";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      const episodes = db.createObjectStore("episodes", { keyPath: "id" });
      episodes.createIndex("by_category", "category");
      episodes.createIndex("by_download_state", "download_state");
      episodes.createIndex("by_played", "played");

      const history = db.createObjectStore("history", {
        keyPath: "historyId",
        autoIncrement: true,
      });
      history.createIndex("by_episode_id", "episode_id");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then(
    (db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      resolve(store);
      transaction.onerror = () => reject(transaction.error);
    })
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getEpisodeState(id) {
  const store = await tx("episodes", "readonly");
  return requestToPromise(store.get(id));
}

export async function getAllEpisodeStates() {
  const store = await tx("episodes", "readonly");
  return requestToPromise(store.getAll());
}

async function putEpisodeState(record) {
  const store = await tx("episodes", "readwrite");
  return requestToPromise(store.put(record));
}

export async function addHistoryEntry(entry) {
  const store = await tx("history", "readwrite");
  return requestToPromise(store.add(entry));
}

export async function getHistory() {
  const store = await tx("history", "readonly");
  const all = await requestToPromise(store.getAll());
  return all.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}

export async function addToPlaylist(episode) {
  const existing = await getEpisodeState(episode.id);
  const record = existing || {
    id: episode.id,
    title: episode.title,
    show_name: episode.show_name,
    network: episode.network,
    category: episode.category,
    published_at: episode.published_at,
    score: episode.score,
    link: episode.link,
    audio_url: episode.audio_url,
    audio_type: episode.audio_type,
    description: episode.description,
    download_state: "not_downloaded",
    resume_position_seconds: 0,
    duration_seconds: null,
    played: false,
    added_to_playlist_at: new Date().toISOString(),
    downloaded_at: null,
  };
  await putEpisodeState(record);
  return downloadEpisode(episode.id);
}

export async function downloadEpisode(id) {
  const record = await getEpisodeState(id);
  if (!record || !record.audio_url) return;

  record.download_state = "downloading";
  await putEpisodeState(record);

  try {
    const response = await fetch(record.audio_url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.put(record.audio_url, response.clone());

    record.download_state = "downloaded";
    record.downloaded_at = new Date().toISOString();
    await putEpisodeState(record);
  } catch (err) {
    record.download_state = "failed";
    await putEpisodeState(record);
    console.error("Download failed for", id, err);
  }
}

export async function getAudioObjectUrl(audioUrl) {
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const response = await cache.match(audioUrl);
  if (!response) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function updateResumePosition(id, seconds) {
  const record = await getEpisodeState(id);
  if (!record) return;
  record.resume_position_seconds = seconds;
  await putEpisodeState(record);
}

export async function setDuration(id, seconds) {
  const record = await getEpisodeState(id);
  if (!record) return;
  record.duration_seconds = seconds;
  await putEpisodeState(record);
}

export async function markPlayedAndDelete(id) {
  const record = await getEpisodeState(id);
  if (!record) return;

  record.played = true;
  record.resume_position_seconds = 0;
  record.download_state = "not_downloaded";
  await putEpisodeState(record);

  await addHistoryEntry({
    episode_id: id,
    title: record.title,
    show_name: record.show_name,
    event: "played_to_completion",
    occurred_at: new Date().toISOString(),
  });

  if (record.audio_url) {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.delete(record.audio_url);
  }
}

export async function removeDownload(id) {
  const record = await getEpisodeState(id);
  if (!record) return;
  if (record.audio_url) {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.delete(record.audio_url);
  }
  record.download_state = "not_downloaded";
  await putEpisodeState(record);
}

export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    console.log("Persistent storage granted:", granted);
    return granted;
  }
  return false;
}
