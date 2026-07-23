#!/usr/bin/env python3
"""Validate the generated public festival bundle."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "data" / "festival.json"

DUTCH_MARKERS = re.compile(
    r"\b(de|het|een|van|voor|naar|zijn|wordt|niet|jouw|onze|tijdens|welkom|"
    r"vrijdag|zaterdag|zondag|donderdag|ochtend|middag|avond|kinderen|"
    r"openingstijden|terrein|muziek|speeltuin|podium)\b",
    re.IGNORECASE,
)


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    events = data["events"]
    profiles = data["profiles"]

    assert len(events) == 799, f"expected 799 events, got {len(events)}"
    assert len(profiles) == 578, f"expected 578 profiles, got {len(profiles)}"
    assert len({event["id"] for event in events}) == 799, "event IDs are not unique"
    assert all(event["category"] in data["categories"] for event in events)
    assert all(event["startIso"] < event["endIso"] for event in events)

    category_counts = Counter(event["category"] for event in events)
    empty_descriptions = sum(not profile["description"].strip() for profile in profiles)
    missing_images = sum(not profile["image"] for profile in profiles)

    content_strings = []
    content_strings.extend(profile["description"] for profile in profiles)
    content_strings.extend(stage["description"] for stage in data["stages"])
    content_strings.extend(topic["title"] for topic in data["info"])
    content_strings.extend(entry["title"] for topic in data["info"] for entry in topic["entries"])
    content_strings.extend(entry["description"] for topic in data["info"] for entry in topic["entries"])
    content_hits = sorted({value for value in content_strings if DUTCH_MARKERS.search(value)})
    title_hits = sorted({event["title"] for event in events if DUTCH_MARKERS.search(event["title"])})

    print(f"events: {len(events)}")
    print(f"profiles: {len(profiles)}")
    print(f"empty profile descriptions: {empty_descriptions}")
    print(f"missing profile images: {missing_images}")
    print("categories:")
    for category in data["categories"]:
        print(f"  {category}: {category_counts[category]}")
    print(f"possible Dutch content remnants: {len(content_hits)}")
    for sample in content_hits[:20]:
        print(f"  - {sample[:140].replace(chr(10), ' ')}")
    print(f"programme titles containing Dutch marker words: {len(title_hits)}")
    for sample in title_hits[:20]:
        print(f"  - {sample[:140].replace(chr(10), ' ')}")


if __name__ == "__main__":
    main()
