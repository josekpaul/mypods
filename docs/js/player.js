// <audio> element control, Media Session API, resume tracking, auto-delete on finish.

import * as storage from "./storage.js";
import { trackEvent } from "./analytics.js";

const RESUME_WRITE_INTERVAL_SECONDS = 7;

let audioEl = null;
let currentEpisode = null;
let lastResumeWriteAt = 0;
let onStateChange = () => {};
let onEpisodeEnded = () => {};

export function initPlayer(audioElement, stateChangeCallback, episodeEndedCallback) {
  audioEl = audioElement;
  onStateChange = stateChangeCallback || (() => {});
  onEpisodeEnded = episodeEndedCallback || (() => {});

  audioEl.addEventListener("loadedmetadata", async () => {
    if (!currentEpisode) return;
    const state = await storage.getEpisodeState(currentEpisode.id);
    if (state && state.resume_position_seconds > 0 && state.resume_position_seconds < audioEl.duration - 2) {
      audioEl.currentTime = state.resume_position_seconds;
    }
    await storage.setDuration(currentEpisode.id, audioEl.duration);
  });

  audioEl.addEventListener("timeupdate", async () => {
    if (!currentEpisode) return;
    const now = audioEl.currentTime;
    if (now - lastResumeWriteAt >= RESUME_WRITE_INTERVAL_SECONDS) {
      lastResumeWriteAt = now;
      await storage.updateResumePosition(currentEpisode.id, now);
    }
    updateMediaSessionPosition();
  });

  audioEl.addEventListener("ended", async () => {
    if (!currentEpisode) return;
    const finishedId = currentEpisode.id;
    trackEvent("episode_completed", { show_name: currentEpisode.show_name, category: currentEpisode.category });
    await storage.markPlayedAndDelete(finishedId);
    currentEpisode = null;
    onStateChange();
    await onEpisodeEnded(finishedId);
  });

  audioEl.addEventListener("play", () => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
  });

  audioEl.addEventListener("pause", () => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audioEl.play());
    navigator.mediaSession.setActionHandler("pause", () => audioEl.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - (details.seekOffset || 15));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + (details.seekOffset || 15));
    });
  }
}

function updateMediaSessionPosition() {
  if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && audioEl.duration) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audioEl.duration,
        playbackRate: audioEl.playbackRate,
        position: audioEl.currentTime,
      });
    } catch (err) {
      // duration/position can be transiently invalid during seeks; ignore.
    }
  }
}

export async function playEpisode(episode) {
  const objectUrl = await storage.getAudioObjectUrl(episode.audio_url);
  if (!objectUrl) {
    throw new Error("Episode audio is not downloaded.");
  }

  if (currentEpisode && currentEpisode.objectUrl) {
    URL.revokeObjectURL(currentEpisode.objectUrl);
  }

  currentEpisode = { ...episode, objectUrl };
  lastResumeWriteAt = 0;

  audioEl.src = objectUrl;

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: episode.show_name,
      album: episode.network,
    });
  }

  await audioEl.play();
  onStateChange();
}

export function getCurrentEpisodeId() {
  return currentEpisode ? currentEpisode.id : null;
}

export function pause() {
  if (audioEl) audioEl.pause();
}
