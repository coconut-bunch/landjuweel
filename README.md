# Landjuweel 2026 Festival Planner

An unofficial English festival planner for Landjuweel 2026. It caches the complete programme, maps, fonts, and artwork so the app keeps working when the mobile network gives up.

## What it does

- Presents all 799 canonical programme events in English
- Separates favorite profiles from specific planned performances
- Persists favorites and My Plan locally in the browser
- Detects overlapping planned events
- Filters by day, category, venue, search, and favorites
- Includes festival and camping maps
- Includes translated practical information
- Works as an installable Progressive Web App

## Local development

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Data build

The public data bundle is generated from locally extracted source files by:

```bash
npm run data:build
```

Translations are cached locally and are not required at runtime. Raw APK files and the original Dutch datasets are intentionally kept outside this repository.

## Publishing

The production build is published from the repository's `gh-pages` branch. Build with the
repository-aware base path before updating that branch:

```bash
GITHUB_ACTIONS=true \
GITHUB_REPOSITORY=coconut-bunch/landjuweel \
npm run build
```

## Privacy

There are no accounts, analytics, advertising scripts, or remote databases. Favorites and plans are stored in the visitor’s browser using `localStorage`.

## Unofficial project and content notice

This is an independent festival-goer project and is not affiliated with or endorsed by Landjuweel, Ruigoord, its organizers, artists, or venues.

Programme descriptions, maps, and supplied photography originate from the installed festival application and remain the property of their respective owners. The application code and generated interface are separate from that source content.
