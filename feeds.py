"""Fetching, parsing, and date-filtering podcast RSS feeds."""

import json
import logging
from datetime import datetime, timedelta, timezone

import feedparser

logger = logging.getLogger(__name__)


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_feed(url):
    try:
        feed = feedparser.parse(url)
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
        return None

    if not feed.entries:
        exc = getattr(feed, "bozo_exception", None)
        logger.warning("No entries found for %s (bozo=%s, exception=%s)", url, feed.bozo, exc)
        return None

    if feed.bozo:
        logger.info("Feed %s parsed with warnings (bozo_exception=%s)", url, feed.bozo_exception)

    return feed


def _entry_published(entry):
    struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if struct is None:
        return None
    return datetime(*struct[:6], tzinfo=timezone.utc)


def _feed_image(feed):
    image = feed.feed.get("image")
    if image:
        return image.get("href")
    return None


def _entry_enclosure(entry):
    enclosures = getattr(entry, "enclosures", None)
    if enclosures:
        enclosure = enclosures[0]
        url = enclosure.get("href") or enclosure.get("url")
        if url:
            return {"url": url, "type": enclosure.get("type")}

    for link in entry.get("links", []):
        if link.get("rel") == "enclosure" and link.get("href"):
            return {"url": link["href"], "type": link.get("type")}

    return None


def parse_episodes(feed, show):
    show_image_url = _feed_image(feed)
    episodes = []
    for entry in feed.entries:
        published_dt = _entry_published(entry)
        if published_dt is None:
            logger.debug("Skipping entry with no parseable date in %s", show["name"])
            continue
        enclosure = _entry_enclosure(entry)
        episodes.append({
            "title": entry.get("title", "(untitled)"),
            "description": entry.get("summary", ""),
            "link": entry.get("link", show.get("feed_url", "")),
            "published_dt": published_dt,
            "show_name": show["name"],
            "network": show["network"],
            "category": show["category"],
            "audio_url": enclosure["url"] if enclosure else None,
            "audio_type": enclosure["type"] if enclosure else None,
            "show_image_url": show_image_url,
        })
    return episodes


def is_within_lookback(published_dt, lookback_days, now):
    if published_dt > now:
        return False
    return now - published_dt <= timedelta(days=lookback_days)


def collect_recent_episodes(config, lookback_days=None, now=None):
    now = now or datetime.now(timezone.utc)
    lookback_days = lookback_days if lookback_days is not None else config.get("lookback_days", 7)

    episodes = []
    failures = []

    for show in config["shows"]:
        try:
            feed = fetch_feed(show["feed_url"])
            if feed is None:
                failures.append({
                    "show_name": show["name"],
                    "feed_url": show["feed_url"],
                    "error": "unreachable or no entries",
                })
                continue

            for episode in parse_episodes(feed, show):
                if is_within_lookback(episode["published_dt"], lookback_days, now):
                    episodes.append(episode)

        except Exception as exc:
            logger.warning("Unexpected error processing %s: %s", show["name"], exc)
            failures.append({
                "show_name": show["name"],
                "feed_url": show["feed_url"],
                "error": str(exc),
            })

    return episodes, failures
