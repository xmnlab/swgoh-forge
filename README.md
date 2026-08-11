# SWGOH Forge

**Find the right squad for every battle.**

SWGOH Forge is an unofficial, fan-made planning concept for *Star Wars: Galaxy of Heroes*. It is designed to help players build context-aware squads and fleets, evaluate counters, understand minimum viable requirements, and make better use of an entire roster.

This repository currently contains a high-fidelity static frontend prototype. It is intended for product and interaction feedback; it does not contain a live recommendation engine or connect to any game API.

## Prototype features

- Squad builder with required-character and required-leader constraints
- Fleet builder with explicit capital ship, starters, reinforcements, and reinforcement order
- Squad and fleet counter flows
- Context and objective selection for different game modes
- Searchable, filterable character and ship pickers
- Minimum, recommended, and safe requirement tiers
- Demo roster readiness and stat-deficiency comparisons
- Territory Battle, Conquest, raid, Journey Guide, event, and fleet mission examples
- Mock whole-roster optimization with non-overlapping teams
- Responsive layouts and keyboard-accessible dialogs and drawers

All recommendation scores, success rates, battle counts, requirements, account details, and optimization results are structured mock/demo data. They do not represent live game statistics.

## Running locally

No build step or package installation is required. From the repository root, run:

```bash
python -m http.server
```

Then open [http://localhost:8000](http://localhost:8000).

The app uses relative asset paths and can also be served directly from the GitHub Pages project path at `https://xmnlab.github.io/swgoh-forge/`.

## GitHub Pages deployment

The `Deploy static site to GitHub Pages` workflow publishes the repository root after every push to `main`. It can also be run manually from the repository's **Actions** tab using **Run workflow**.

Before the first deployment, open **Settings → Pages** in GitHub and set **Source** to **GitHub Actions**. No build command, deployment branch, or repository secret is required.

## Project structure

```text
swgoh-forge/
├── index.html                 # Semantic application shell
├── styles.css                # Responsive visual system
├── app.js                    # Central state and UI interactions
├── data/
│   ├── characters.js         # Character records and image paths
│   ├── ships.js              # Ship and capital-ship records
│   ├── recommendations.js    # Squad, fleet, counter, and roster demos
│   ├── encounters.js         # Context, objectives, and mission demos
│   └── demo-roster.js        # Fictional local roster
├── assets/
│   ├── characters/           # Character portraits belong here
│   ├── ships/                # Standard ship images belong here
│   ├── capital-ships/        # Capital-ship images belong here
│   └── ui/                   # Original project UI assets
└── LICENSE
```

## Unit images

No copyrighted character or ship artwork is bundled with this prototype. Unit records reference predictable local paths such as:

```text
assets/characters/darth-vader.png
assets/ships/hounds-tooth.png
assets/capital-ships/executor.png
```

When a referenced image is absent, the interface displays an initials-based, unit-colored fallback and never exposes a broken-image placeholder. Image paths are kept in the structured data files so assets can be added or replaced without changing rendering logic.

Third-party images placed under `assets/` remain subject to their respective rights and are not automatically covered by this project's MIT license.

## Current status

This is the first static prototype. Recommendation generation, battle statistics, requirements, roster loading, and optimization are simulated locally. There is no scraping, authentication, backend, data upload, or connection to SWGOH.GG or an Electronic Arts service.

Future implementation can replace the mock recommendation functions with a real engine while preserving the current UI and data boundaries.

## Disclaimer

SWGOH Forge is an unofficial fan project and is not affiliated with, endorsed by, sponsored by, or associated with Electronic Arts, Lucasfilm Ltd., The Walt Disney Company, or their affiliates.

STAR WARS, *STAR WARS: Galaxy of Heroes*, related characters, ships, names, trademarks, logos, artwork, and other third-party intellectual property remain the property of their respective rights holders.

## License

The project's original source code is available under the [MIT License](LICENSE). This license does not grant rights to third-party intellectual property or artwork.
