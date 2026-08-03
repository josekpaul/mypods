"""Serializing ranked episodes into episodes.json for the player PWA."""

import hashlib
import json
import os

from report import _clean_snippet, _clean_text

ID_LENGTH = 16


def build_episode_id(episode):
    if episode.get("audio_url"):
        basis = episode["audio_url"]
    else:
        basis = episode["link"] + episode["title"]
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:ID_LENGTH]


def to_json_dict(episode):
    return {
        "id": build_episode_id(episode),
        "title": episode["title"],
        "show_name": episode["show_name"],
        "network": episode["network"],
        "category": episode["category"],
        "published_at": episode["published_dt"].isoformat().replace("+00:00", "Z"),
        "score": episode["score"],
        "link": episode["link"],
        "audio_url": episode.get("audio_url"),
        "audio_type": episode.get("audio_type"),
        "show_image_url": episode.get("show_image_url"),
        "description": _clean_snippet(episode["description"]),
        "description_full": _clean_text(episode["description"]),
    }


def render_episodes_json(episodes, generated_at, lookback_days):
    return {
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "lookback_days": lookback_days,
        "episode_count": len(episodes),
        "episodes": [to_json_dict(episode) for episode in episodes],
    }


def write_episodes_json(data, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path
