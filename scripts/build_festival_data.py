#!/usr/bin/env python3
"""Build a compact, English-first data bundle from the extracted festival APK."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


SITE_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = SITE_ROOT.parent
LINEUP_PATH = WORKSPACE_ROOT / "outputs" / "landjuweel_2026_lineup.json"
SCHEDULE_PATH = WORKSPACE_ROOT / "work" / "landjuweel_2026" / "data" / "schedule.json"
STAGES_PATH = WORKSPACE_ROOT / "work" / "landjuweel_2026" / "data" / "stages.json"
INFO_PATH = WORKSPACE_ROOT / "work" / "landjuweel_2026" / "data" / "info.json"
APK_PATH = WORKSPACE_ROOT / "work" / "landjuweel_2026" / "apks" / "base.apk"
CACHE_PATH = SITE_ROOT / "content" / "translation-cache.json"
OUTPUT_PATH = SITE_ROOT / "public" / "data" / "festival.json"

MODEL = "translategemma:4b"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
SOURCE_VERSION = "landjuweel-2026-app-1.0.3-2026-07-20"

DUTCH_WORDS = {
    "de", "het", "een", "en", "van", "met", "voor", "naar", "bij", "uit", "op",
    "om", "als", "is", "zijn", "wordt", "worden", "niet", "je", "jij", "jouw",
    "jullie", "wij", "ons", "onze", "hun", "deze", "dit", "dat", "die", "maar",
    "ook", "tijdens", "waar", "welkom", "kom", "maak", "maken", "kinderen",
    "openingstijden", "terrein", "kerk", "dorp", "muziek", "dans", "dag", "nacht",
    "vrijdag", "zaterdag", "zondag", "donderdag", "ochtend", "middag", "avond",
    "workshop", "ceremonie", "speeltuin", "podium", "veld", "route", "tuin",
}

ENGLISH_WORDS = {
    "the", "a", "an", "and", "of", "with", "for", "to", "at", "from", "on", "in",
    "as", "is", "are", "be", "not", "you", "your", "we", "our", "they", "this",
    "that", "but", "also", "during", "where", "welcome", "come", "make",
    "workshop", "children", "opening", "festival", "area", "church", "village",
    "music", "dance", "day", "night", "friday", "saturday", "sunday", "thursday",
    "morning", "afternoon", "evening", "stage", "field", "route", "garden",
}

VENUE_NAMES = {
    "Area 46": "Area 46",
    "Beeldenroute": "Art Route",
    "Beeldenroute Kids": "Kids' Art Route",
    "Bon Vivant": "Bon Vivant",
    "Boogie Bos": "Boogie Woods",
    "Camping": "Camping",
    "DAF/ Rafelrand": "DAF / Fringe",
    "DAF / Rafelrand": "DAF / Fringe",
    "De Speeltuin": "The Playground",
    "Dorpsplein - Aardewerk": "Village Square · Earthworks",
    "Dorpsplein - De wereld in wording": "Village Square · A World in the Making",
    "Dorpsplein - Podium InstrumenTaal": "Village Square · InstrumenTaal Stage",
    "Dorpsplein - Terraspodium Woven Voices": "Village Square · Woven Voices Terrace",
    "Dorpsplein - Terras - Woven Voices": "Village Square · Woven Voices Terrace",
    "Dorpsplein - Trommelvuur": "Village Square · Drum Fire",
    "Dorpsplein - Veld": "Village Square · Field",
    "Dorpsplein - Why not theater": "Village Square · Why Not Theatre",
    "Dorpsplein - Why Not Circus": "Village Square · Why Not Circus",
    "Kabouterhuys": "Gnome House",
    "Kabouterpodium": "Gnome Stage",
    "KALEIDO Faerie Forest": "KALEIDO Faerie Forest",
    "KALEIDO Queer Stage": "KALEIDO Queer Stage",
    "KALEIDO Workshop Rietreat": "KALEIDO Workshop Rietreat",
    "Kerk - A’ Ma ‘Na": "Church · A’ Ma ‘Na",
    "Kerk - A’MA’NA": "Church · A’ Ma ‘Na",
    "Kerk - All is One": "Church · All Is One",
    "Kerk - HET BEELDJUWEEL": "Church · The Art Jewel",
    "Kerk - KALEIDO Takeover": "Church · KALEIDO Takeover",
    "Kerk - Punken voor eigen Parochie": "Church · Punks of the Parish",
    "Kikvors: Metamorphosis": "Frog: Metamorphosis",
    "Kikvors: Metamophosis": "Frog: Metamorphosis",
    "Krater": "The Crater",
    "Natural High": "Natural High",
    "Natural High - Buiten Podium/ Veld": "Natural High · Outdoor Stage / Field",
    "Natural High - Grote paleis Yurt": "Natural High · Grand Palace Yurt",
    "Natural High - Kleine Yurt": "Natural High · Small Yurt",
    "Natural High - Mama Ger": "Natural High · Mama Ger",
    "Natural High - Tipi": "Natural High · Tipi",
    "Randprogramma": "Fringe Programme",
    "Rebel Stage": "Rebel Stage",
    "Salon": "Salon",
    "SloÔoase": "Sloooase",
    "Temple of Self": "Temple of Self",
    "Theaterveld": "Theatre Field",
    "Theo's Theetuin": "Theo's Tea Garden",
    "Vlindertuin": "Butterfly Garden",
    "Wilgenportaal": "Willow Portal",
}

TITLE_OVERRIDES = {
    "Bouke en co: Gratis kleding- halen & brengen": "Bouke & Co · Free Clothes — Take Some, Bring Some",
    "Beeldenroute": "Art Route",
    "Beeldenroute Temple of Self": "Temple of Self Art Route",
    "Collectief in de Lucht": "Collective in the Air",
    "De Zevende Kleur presents: The Floating Fantasy": "The Seventh Colour presents: The Floating Fantasy",
    "Festival make-up/makeover met Shotgun Cilla": "Festival Make-up & Makeover with Shotgun Cilla",
    "FOUTE VROUWEN...": "GUILTY-PLEASURE WOMEN…",
    "Het Spiegelveld": "The Mirror Field",
    "In het Hart": "In the Heart",
    "Improvisatie theater": "Improvisation Theatre",
    "InstrumMensen freestyle rap sessie": "InstrumMensen Freestyle Rap Session",
    "Jamsessie met the Improvinators": "Jam Session with the Improvinators",
    "Kinder Catwalk": "Kids' Catwalk",
    "Kinder Kamping": "Kids' Camping",
    "La Prudon x Ibu Ibiza - Hoeden & Modeshow": "La Prudon × Ibu Ibiza · Hats & Fashion Show",
    "Live Music Parlour met Lowfire & Liza Weald": "Live Music Parlour with Lowfire & Liza Weald",
    "Mauricio Lobão met Jungle Tribal Dance live set": "Mauricio Lobão with Jungle Tribal Dance Live Set",
    "Morning Yoga - De 5 Elementen Vorm": "Morning Yoga · The Five Elements Form",
    "Taste of Tantra (Authentic Relating) van Tamara Groen": "Taste of Tantra (Authentic Relating) by Tamara Groen",
    "The Troubadour Car Jamsessie": "The Troubadour Car Jam Session",
    "Verhaal met The Troubadour Car": "Story with The Troubadour Car",
    "Wim Hof Methode Ijsbad": "Wim Hof Method Ice Bath",
    "Woven Voices Opening met Lex Empress": "Woven Voices Opening with Lex Empress",
    "Wij Doen Mee! van stichting Verwonderij": "We're In It Together! · Verwonderij Foundation",
    "Gesamtkunstwerk met Hessel Pijnaker open workshop": "Total Artwork · Open Workshop with Hessel Pijnaker",
    "! RED HET GROENE VELD - TEKEN NU !": "SAVE THE GREEN FIELD — SIGN NOW!",
    "Bouw mee aan het groeiende insectendorp - De luchtwezens": "Help Build the Growing Insect Village · Air Creatures",
    "Muziek verhaal met The Troubadour Car": "Music Story with The Troubadour Car",
    "De Grote Voortplantingsshow": "The Great Reproduction Show",
    "Het Beeldjuweel op Vrijdag": "The Art Jewel on Friday",
    "Het Beeldjuweel op Zaterdag": "The Art Jewel on Saturday",
    "Het Beeldjuweel op Zondag": "The Art Jewel on Sunday",
    "Beeldenroute Kinderen": "Kids' Art Route",
    "Various DJ's en drums CLOSING": "Various DJs & Drums · Closing",
    "Open Jam sessie": "Open Jam Session",
    "Vrouwencirkel - De Stem van je Voormoeders": "Women's Circle · The Voice of Your Female Ancestors",
    "MIJNHEER van Ouwenaar": "MIJNHEER van Ouwenaar",
    "Riet(j)uweel voor Stembehoud met Yente & Ocean": "Reed Jewel for Voice Preservation with Yente & Ocean",
    "Billenschudden met DJ Dragonslayer": "Shake Your Booty with DJ Dragonslayer",
    "Ontdek Jezelf met Kunst met Fleur Cecile Haak": "Discover Yourself Through Art with Fleur Cecile Haak",
}

COPY_REPLACEMENTS = {
    "Dansmuziek voor Paradijsvogels": "Dance Music for Birds of Paradise",
    "Genderblending & Genrebending": "Gender-blending & genre-bending",
    "rietreat in het riet": "reed retreat",
    "Het Spiegelveld": "The Mirror Field",
    "Het Groene Veld": "The Green Field",
    "Podium InstrumenTaal": "InstrumenTaal Stage",
    "De Queereld Draait Door": "The Queer World Keeps Turning",
    "Ik Cacao van Jou!": "I Love You, Cacao!",
    "Donker & Licht": "Dark & Light",
    "Het Wilgenportaal": "The Willow Portal",
    "Het Woord": "The Word",
    "Poort van Ruigoord": "Ruigoord Gate",
}

CATEGORY_ORDER = [
    "Live Music",
    "DJ & Electronic",
    "Workshops & Hands-on",
    "Wellness & Ritual",
    "Theatre & Performance",
    "Art & Installations",
    "Talks & Community",
    "Kids & Family",
    "Activities & Pop-ups",
]

CATEGORY_KEYWORDS = {
    "DJ & Electronic": [
        r"\bdj\b", r"\bb2b\b", r"techno", r"psytrance", r"trance", r"acid",
        r"electronic", r"house set", r"club", r"rave", r"sound system",
    ],
    "Live Music": [
        r"\blive\b", r"\bband\b", r"concert", r"orchestra", r"quartet", r"choir",
        r"singer", r"music", r"jazz", r"percussion", r"drum", r"sitar", r"flamenco",
        r"kirtan", r"mantra", r"jam session",
    ],
    "Workshops & Hands-on": [
        r"workshop", r"training", r"make your", r"learn to", r"hands-on", r"class",
        r"craft", r"clay", r"paint", r"juggling", r"embroid", r"build", r"making",
    ],
    "Wellness & Ritual": [
        r"yoga", r"meditat", r"breath", r"massage", r"healing", r"chakra",
        r"cacao", r"ceremon", r"ritual", r"tantra", r"embod", r"conscious",
        r"sacred", r"reiki", r"qi gong", r"chi kung", r"sound journey",
    ],
    "Theatre & Performance": [
        r"theatre", r"theater", r"circus", r"performance", r"cabaret", r"clown",
        r"acrobat", r"storytelling", r"drag", r"dance performance", r"show\b",
    ],
    "Art & Installations": [
        r"installation", r"sculpt", r"visual art", r"exhibition", r"art route",
        r"projection", r"gallery", r"mandala", r"painting", r"artwork",
    ],
    "Talks & Community": [
        r"\btalk\b", r"talkshow", r"poetry", r"poem", r"spoken word", r"debate",
        r"community", r"communication", r"sharing circle", r"activism", r"lecture",
    ],
    "Kids & Family": [
        r"\bkids?\b", r"children", r"family", r"all ages", r"playground",
        r"parade", r"puppet", r"young dreamers",
    ],
    "Activities & Pop-ups": [
        r"bingo", r"karaoke", r"games", r"photo booth", r"food", r"soup",
        r"tasting", r"clothing", r"haircut", r"tattoo", r"makeover", r"market",
    ],
}

VENUE_PRIORS = {
    "Art Route": "Art & Installations",
    "Kids' Art Route": "Kids & Family",
    "Theatre Field": "Theatre & Performance",
    "Frog: Metamorphosis": "Theatre & Performance",
    "KALEIDO Workshop Rietreat": "Workshops & Hands-on",
    "Natural High · Grand Palace Yurt": "Wellness & Ritual",
    "Natural High · Small Yurt": "Wellness & Ritual",
    "Natural High · Tipi": "Wellness & Ritual",
    "Temple of Self": "Wellness & Ritual",
    "The Playground": "Activities & Pop-ups",
    "Village Square · A World in the Making": "Kids & Family",
}

TAG_KEYWORDS = {
    "Dance": [r"dance", r"dancing", r"ecstatic"],
    "Ceremony": [r"ceremon", r"ritual", r"opening circle"],
    "Interactive": [r"interactive", r"participat", r"join ", r"workshop", r"circle"],
    "Outdoors": [r"outdoor", r"field", r"garden", r"woods", r"route"],
    "Late night": [r"late night", r"midnight", r"night"],
    "Poetry": [r"poetry", r"poem", r"spoken word", r"poet"],
    "Circus": [r"circus", r"acrobat", r"juggling", r"clown", r"hoop"],
    "Family friendly": [r"kids?", r"children", r"family", r"all ages"],
    "Food & drink": [r"food", r"soup", r"tasting", r"cacao", r"tea party"],
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def strip_html(value: str) -> str:
    value = re.sub(r"<\s*br\s*/?\s*>", "\n", value, flags=re.I)
    value = re.sub(r"</\s*(p|li|h[1-6]|div)\s*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = value.replace("\r", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n\s*\n\s*\n+", "\n\n", value)
    return value.strip()


def excerpt(value: str, limit: int = 1200) -> tuple[str, bool]:
    value = strip_html(value)
    if len(value) <= limit:
        return value, False
    clipped = value[:limit]
    boundary = max(clipped.rfind(". "), clipped.rfind("! "), clipped.rfind("? "), clipped.rfind("\n"))
    if boundary > limit * 0.6:
        clipped = clipped[: boundary + 1]
    return clipped.strip() + "…", True


def clean_visible_copy(value: str) -> str:
    value = re.sub(
        r"(?im)^[ \t]*(?:NL|EN)[ \t]*:?[ \t]*",
        "",
        value,
    )
    for source, replacement in COPY_REPLACEMENTS.items():
        value = value.replace(source, replacement)
    return value.strip()


def language_scores(value: str) -> tuple[int, int]:
    words = re.findall(r"[A-Za-zÀ-ÿ']+", strip_html(value).lower())
    return sum(word in DUTCH_WORDS for word in words), sum(word in ENGLISH_WORDS for word in words)


def needs_dutch_translation(value: str, minimum_dutch: int) -> bool:
    dutch, english = language_scores(value)
    return dutch >= minimum_dutch and dutch > english * 1.35


def needs_mixed_dutch_translation(value: str) -> bool:
    """Catch Dutch paragraphs embedded in otherwise English profile copy."""
    dutch, _ = language_scores(value)
    has_language_label = bool(re.search(r"\bNL\s*:?", value, flags=re.IGNORECASE))
    return needs_dutch_translation(value, 2) or has_language_label or dutch >= 3


class Translator:
    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.cache: dict[str, str] = load_json(CACHE_PATH) if CACHE_PATH.exists() else {}
        self.completed = 0

    def _save(self) -> None:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = CACHE_PATH.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(self.cache, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(CACHE_PATH)

    def translate(self, value: str, label: str, force: bool = False) -> str:
        value = value.strip()
        if not value:
            return ""
        if not force and not needs_dutch_translation(value, 2):
            return value
        digest = hashlib.sha256(("nl-en-v1\0" + value).encode("utf-8")).hexdigest()
        if digest in self.cache:
            return self.cache[digest]
        if not self.enabled:
            return value

        prompt = (
            "You are a professional Dutch (nl) to English (en) translator. "
            "Your goal is to accurately convey the meaning and nuances of the original "
            "Dutch text while adhering to natural English grammar, vocabulary, and "
            "cultural sensitivities. Preserve artist names, project names, emojis, URLs, "
            "and line breaks. Produce only the English translation, without any additional "
            "explanations or commentary. Please translate the following Dutch text into English:"
            f"\n\n{value}"
        )
        payload = {
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": 0.1},
        }
        request = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=300) as response:
                    translated = json.loads(response.read())["message"]["content"].strip()
                if not translated:
                    raise ValueError("translation was empty")
                self.cache[digest] = translated
                self.completed += 1
                self._save()
                print(f"translated {self.completed:03}: {label}", flush=True)
                return translated
            except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as error:
                last_error = error
                time.sleep(2**attempt)
        raise RuntimeError(f"Could not translate {label}: {last_error}")


def slug(value: str) -> str:
    value = value.lower().replace("ô", "o")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "item"


def classify(title: str, description: str, venue: str, start_minutes: int) -> tuple[str, list[str]]:
    text = f"{title} {description} {venue}".lower()
    scores = {category: 0 for category in CATEGORY_ORDER}
    for category, patterns in CATEGORY_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, text, flags=re.I):
                scores[category] += 3 if re.search(pattern, title, flags=re.I) else 1
    prior = VENUE_PRIORS.get(venue)
    if prior:
        scores[prior] += 2
    if venue in {"Area 46", "Boogie Woods", "DAF / Fringe", "Sloooase"} and (
        start_minutes >= 18 * 60 or start_minutes < 6 * 60
    ):
        scores["DJ & Electronic"] += 2
    if all(score == 0 for score in scores.values()):
        scores["Activities & Pop-ups"] = 1
    primary = max(CATEGORY_ORDER, key=lambda category: scores[category])

    tags: list[str] = []
    for tag, patterns in TAG_KEYWORDS.items():
        if any(re.search(pattern, text, flags=re.I) for pattern in patterns):
            tags.append(tag)
    if start_minutes < 6 * 60 or start_minutes >= 23 * 60:
        tags.append("Late night")
    return primary, list(dict.fromkeys(tags))


def parse_time(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def actual_datetimes(day_value: str, start_value: str, end_value: str) -> tuple[str, str, int]:
    source_day = datetime.strptime(f"{day_value} 2026", "%d %b %Y").date()
    start_minutes = parse_time(start_value)
    end_minutes = parse_time(end_value)
    day_offset = 1 if start_minutes < 6 * 60 else 0
    start_date = source_day + timedelta(days=day_offset)
    end_date = start_date
    if end_minutes <= start_minutes:
        end_date += timedelta(days=1)
    start_dt = datetime.combine(start_date, datetime.min.time()) + timedelta(minutes=start_minutes)
    end_dt = datetime.combine(end_date, datetime.min.time()) + timedelta(minutes=end_minutes)
    sort_minutes = start_minutes + (1440 if start_minutes < 6 * 60 else 0)
    return start_dt.isoformat(timespec="minutes"), end_dt.isoformat(timespec="minutes"), sort_minutes


def extract_assets(artists: list[dict[str, Any]], stages: list[dict[str, Any]]) -> tuple[dict[int, str], dict[str, str]]:
    artist_output = SITE_ROOT / "public" / "assets" / "artists"
    stage_output = SITE_ROOT / "public" / "assets" / "stages"
    map_output = SITE_ROOT / "public" / "assets" / "maps"
    artist_output.mkdir(parents=True, exist_ok=True)
    stage_output.mkdir(parents=True, exist_ok=True)
    map_output.mkdir(parents=True, exist_ok=True)
    artist_images: dict[int, str] = {}
    stage_images: dict[str, str] = {}

    with zipfile.ZipFile(APK_PATH) as archive:
        for artist in artists:
            cover = artist.get("cover") or ""
            if not cover:
                continue
            member = f"assets/flutter_assets/{cover}"
            try:
                content = archive.read(member)
            except KeyError:
                continue
            suffix = Path(cover).suffix.lower() or ".jpg"
            filename = f"{artist['id']}{suffix}"
            (artist_output / filename).write_bytes(content)
            artist_images[int(artist["id"])] = f"assets/artists/{filename}"

        for stage in stages:
            cover = stage.get("cover") or ""
            if not cover:
                continue
            member = f"assets/flutter_assets/{cover}"
            try:
                content = archive.read(member)
            except KeyError:
                continue
            suffix = Path(cover).suffix.lower() or ".jpg"
            filename = f"{slug(stage['title'])}{suffix}"
            (stage_output / filename).write_bytes(content)
            stage_images[stage["title"]] = f"assets/stages/{filename}"

        static_assets = {
            "assets/flutter_assets/assets/map/map_new.png": map_output / "festival.png",
            "assets/flutter_assets/assets/map/map_camping.png": map_output / "camping.png",
            "assets/flutter_assets/assets/images/landjuweel-logo.png": SITE_ROOT / "public" / "brand-logo.png",
        }
        for member, destination in static_assets.items():
            destination.write_bytes(archive.read(member))

    return artist_images, stage_images


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--no-translate",
        action="store_true",
        help="Build with source text where no cached English translation exists.",
    )
    args = parser.parse_args()

    lineup = load_json(LINEUP_PATH)["artists"]
    schedule_days = load_json(SCHEDULE_PATH)["days"]
    stages_source = load_json(STAGES_PATH)["stages"]
    info_source = load_json(INFO_PATH)
    translator = Translator(enabled=not args.no_translate)
    artist_images, stage_images = extract_assets(lineup, stages_source)

    profiles_by_id = {int(profile["id"]): profile for profile in lineup}
    profile_key_lookup: dict[tuple[str, str, str, str, str], int] = {}
    performance_groups: dict[int, list[int]] = defaultdict(list)
    for profile in lineup:
        profile_id = int(profile["id"])
        for performance in profile["performances"]:
            key = (
                profile["name"].strip().casefold(),
                performance["date"],
                performance["start"],
                performance["end"],
                performance["area"].strip().casefold(),
            )
            profile_key_lookup[key] = profile_id
            performance_groups[int(performance["id"])].append(profile_id)

    title_translations: dict[int, str] = {}
    description_translations: dict[int, tuple[str, bool]] = {}
    for profile in lineup:
        profile_id = int(profile["id"])
        title_translations[profile_id] = TITLE_OVERRIDES.get(profile["name"]) or translator.translate(
            profile["name"],
            f"profile title {profile_id}",
            force=needs_dutch_translation(profile["name"], 1),
        )
        profile_excerpt, is_excerpt = excerpt(profile.get("bio", ""))
        description_translations[profile_id] = (
            clean_visible_copy(
                translator.translate(
                    profile_excerpt,
                    f"profile description {profile_id}",
                    force=needs_mixed_dutch_translation(profile_excerpt),
                )
            ),
            is_excerpt,
        )

    normalized_profiles = []
    for profile in lineup:
        profile_id = int(profile["id"])
        normalized_profiles.append(
            {
                "id": profile_id,
                "name": title_translations[profile_id],
                "description": description_translations[profile_id][0],
                "descriptionIsExcerpt": description_translations[profile_id][1],
                "image": artist_images.get(profile_id),
            }
        )

    events = []
    date_labels = {
        "23 Jul": ("2026-07-23", "Thursday", "Thu 23"),
        "24 Jul": ("2026-07-24", "Friday", "Fri 24"),
        "25 Jul": ("2026-07-25", "Saturday", "Sat 25"),
        "26 Jul": ("2026-07-26", "Sunday", "Sun 26"),
    }
    for day in schedule_days:
        day_date, day_name, short_label = date_labels[day["date"]]
        for source_event in day["events"]:
            key = (
                source_event["artist"].strip().casefold(),
                day["date"],
                source_event["startTime"],
                source_event["endTime"],
                source_event["stage"].strip().casefold(),
            )
            profile_id = profile_key_lookup[key]
            matching_performance = next(
                performance
                for performance in profiles_by_id[profile_id]["performances"]
                if (
                    performance["date"] == day["date"]
                    and performance["start"] == source_event["startTime"]
                    and performance["end"] == source_event["endTime"]
                    and performance["area"].strip().casefold() == source_event["stage"].strip().casefold()
                )
            )
            contributor_ids = list(dict.fromkeys(performance_groups[int(matching_performance["id"])]))
            start_iso, end_iso, sort_minutes = actual_datetimes(
                day["date"], source_event["startTime"], source_event["endTime"]
            )
            venue = VENUE_NAMES.get(source_event["stage"], source_event["stage"])
            title = title_translations[profile_id]
            description = description_translations[profile_id][0]
            category, tags = classify(title, description, venue, parse_time(source_event["startTime"]))
            events.append(
                {
                    "id": source_event["id"],
                    "profileIds": contributor_ids,
                    "title": title,
                    "description": description,
                    "descriptionIsExcerpt": description_translations[profile_id][1],
                    "festivalDate": day_date,
                    "dayName": day_name,
                    "dayLabel": short_label,
                    "start": source_event["startTime"],
                    "end": source_event["endTime"],
                    "startIso": start_iso,
                    "endIso": end_iso,
                    "sortMinutes": sort_minutes,
                    "venue": venue,
                    "category": category,
                    "tags": tags,
                    "image": artist_images.get(profile_id),
                }
            )

    normalized_stages = []
    for stage in stages_source:
        title = VENUE_NAMES.get(stage["title"], stage["title"])
        stage_description, stage_is_excerpt = excerpt(stage.get("desc", ""), limit=1600)
        normalized_stages.append(
            {
                "id": slug(title),
                "name": title,
                "description": clean_visible_copy(
                    translator.translate(stage_description, f"stage {title}", force=True)
                ),
                "descriptionIsExcerpt": stage_is_excerpt,
                "image": stage_images.get(stage["title"]),
            }
        )

    normalized_info = []
    for topic_index, topic in enumerate(info_source):
        topic_title = translator.translate(topic["topic"], f"info topic {topic_index}", force=True)
        entries = []
        for entry in topic["subTopics"]:
            info_description, info_is_excerpt = excerpt(entry.get("desc", ""), limit=1800)
            entries.append(
                {
                    "id": f"{topic_index}-{entry['id']}",
                    "title": translator.translate(
                        entry["title"], f"info title {topic_index}-{entry['id']}", force=True
                    ),
                    "description": clean_visible_copy(
                        translator.translate(
                            info_description,
                            f"info description {topic_index}-{entry['id']}",
                            force=True,
                        )
                    ),
                    "descriptionIsExcerpt": info_is_excerpt,
                }
            )
        normalized_info.append(
            {
                "id": f"topic-{topic_index}",
                "title": topic_title,
                "entries": entries,
            }
        )

    events.sort(key=lambda event: (event["festivalDate"], event["sortMinutes"], event["venue"], event["title"]))
    output = {
        "meta": {
            "name": "Landjuweel 2026 Companion",
            "sourceVersion": SOURCE_VERSION,
            "sourceUpdatedAt": "2026-07-20T14:26:24+02:00",
            "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "eventCount": len(events),
            "profileCount": len(normalized_profiles),
            "unofficial": True,
        },
        "days": [
            {"date": value[0], "name": value[1], "label": value[2]}
            for value in date_labels.values()
        ],
        "categories": CATEGORY_ORDER,
        "events": events,
        "profiles": normalized_profiles,
        "stages": normalized_stages,
        "info": normalized_info,
        "maps": {
            "festival": "assets/maps/festival.png",
            "camping": "assets/maps/camping.png",
        },
    }
    if len(events) != 799:
        raise RuntimeError(f"Expected 799 events, generated {len(events)}")
    if len(normalized_profiles) != 578:
        raise RuntimeError(f"Expected 578 profiles, generated {len(normalized_profiles)}")
    if any(not event["category"] for event in events):
        raise RuntimeError("At least one event has no category")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"built {OUTPUT_PATH.relative_to(SITE_ROOT)} with "
        f"{len(events)} events, {len(normalized_profiles)} profiles, "
        f"{translator.completed} new translations"
    )


if __name__ == "__main__":
    main()
