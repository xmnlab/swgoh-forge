# SWGOH Forge

**Find the right squad for every battle.**

SWGOH Forge is an unofficial, fan-made planning concept for *Star Wars: Galaxy of Heroes*. It is a static frontend prototype with an optional local data pipeline for generating a current character and ship catalog from [SWGOH Comlink](https://github.com/swgoh-utils/swgoh-comlink).

The unit catalog can be current game data. Recommendation scores, success rates, battle counts, requirements, account details, and optimization results remain structured mock/demo data; Comlink does not supply that historical strategy dataset.

## Prototype features

- Squad builder with required-character and required-leader constraints
- Fleet builder with capital ship, starters, reinforcements, and reinforcement order
- Squad and fleet counter flows
- Searchable, filterable character and ship pickers
- Minimum, recommended, and safe requirement tiers
- Demo roster readiness and whole-roster optimization
- Optional locally generated unit, ship, category, and English-name snapshot
- Responsive layouts and keyboard-accessible dialogs and drawers

## Running the site locally

No frontend build step is required. From the repository root, run:

```bash
python3 -m http.server
```

Then open [http://localhost:8000](http://localhost:8000). The checked-in catalog is used until you run the optional updater below.

The bundled catalog contains only 53 representative characters for the static prototype; it is intentionally incomplete. A successful local update changes the interface label to **Local SWGOH Comlink snapshot** and records a generation date and game-data version. If the interface still says **Bundled seed catalog (not complete)**, the updater did not finish successfully.

## Updating game data locally

This repository deliberately does not scrape SWGOH.GG or run data collection in GitHub Actions. The updater talks only to a Comlink service you operate and writes a normalized static snapshot that can be reviewed and committed.

Requirements:

- Docker with Compose support
- Python 3.10 or newer

The simplest option starts Comlink on a currently unused loopback port, waits for it, updates the catalog, and stops it again:

```bash
./scripts/update-data-full.sh
```

The final line must say `The complete Comlink catalog was generated successfully.` If the command exits earlier, the seed files are left unchanged so a partial response cannot replace them.

To manage the service yourself, start the pinned Comlink container on the loopback interface:

```bash
docker compose -f compose.comlink.yaml up -d
```

After the service starts, generate the catalog:

```bash
./scripts/update-data.sh
```

Port 3000 is the manual default. If another application already uses it, select another port for both commands:

```bash
COMLINK_PORT=3200 docker compose -f compose.comlink.yaml up -d
COMLINK_URL=http://127.0.0.1:3200 ./scripts/update-data.sh
```

The wrapper creates or repairs `.venv-data`, installs the pinned `swgoh_comlink` Python client, and updates:

- `data/characters.js`
- `data/ships.js`
- `data/catalog-meta.js`

It requests current metadata, the playable category and unit collections separately, and one localization locale (`ENG_US` by default). The separate collection requests use values accepted by Comlink 4.4.1 and avoid its rejection of combined item masks. Raw responses are cached under `.cache/comlink/`, which is ignored by Git. Rebuild from that cache without contacting Comlink using:

```bash
./scripts/update-data.sh --from-cache
```

Useful checks and overrides:

```bash
# Fetch and validate without changing generated files
./scripts/update-data.sh --dry-run

# Use a service at another address
COMLINK_URL=http://127.0.0.1:3001 ./scripts/update-data.sh

# Select another localization bundle
COMLINK_LOCALE=FRE_FR ./scripts/update-data.sh
```

The updater preserves existing human-readable IDs where localized names match, adds stable base-ID aliases, selects the highest-rarity definition for each playable unit, links ships to their crew, and writes files atomically. It refuses an implausibly small response or a snapshot that unexpectedly removes existing IDs. `--allow-missing-seed-units` is available for an intentional removal after reviewing the result.

Stop the local service when finished:

```bash
docker compose -f compose.comlink.yaml down
```

The container is bound to `127.0.0.1`, so it is not exposed to other machines. If you configure HMAC on your own Comlink deployment, the updater also accepts `COMLINK_ACCESS_KEY` and `COMLINK_SECRET_KEY`; keep those values out of the repository.

### Data scope and provenance

The generated files contain a compact subset needed by the UI: base ID, localized name, unit type, visible faction categories, alignment, role, leadership, crew relationships, and display metadata. The updater does not request player profiles, guilds, rosters, battle histories, or credentials.

SWGOH Comlink and `comlink-python` are third-party community projects. Their software licenses do not grant rights to Electronic Arts game data. Before redistributing generated snapshots, review the applicable game terms and repository policies yourself. Keeping the collection local reduces operational load and makes every update an explicit, reviewable action; it is not a grant of permission from a rights holder.

## GitHub Pages deployment

The `Deploy static site to GitHub Pages` workflow publishes the repository root after every push to `main`. It can also be run manually from the repository's **Actions** tab. The workflow requests Pages enablement, which handles repositories where the Pages site has not yet been created. Repository administrators can also select **Settings → Pages → Source → GitHub Actions** manually.

The data updater is not part of the deployment workflow. Run it locally, inspect the generated diff, and commit the snapshot when you want the published catalog to change.

## Project structure

```text
swgoh-forge/
├── index.html
├── styles.css
├── app.js
├── compose.comlink.yaml       # Loopback-only local Comlink service
├── requirements-data.txt     # Pinned Python updater dependency
├── scripts/
│   ├── update-data-full.sh    # Start service, update data, and clean up
│   ├── update-data.sh         # Update using a running Comlink service
│   └── update_game_data.py    # Fetch, normalize, validate, and generate
├── data/
│   ├── catalog-meta.js        # Snapshot source, version, date, and counts
│   ├── characters.js          # Generated or bundled character catalog
│   ├── ships.js               # Generated or bundled ship catalogs
│   ├── recommendations.js     # Squad, fleet, counter, and roster demos
│   ├── encounters.js          # Context, objectives, and mission demos
│   └── demo-roster.js         # Fictional local roster
├── tests/
│   └── test_update_game_data.py
└── assets/
```

## Unit images

No copyrighted character or ship artwork is bundled. Generated records reference predictable local paths such as `assets/characters/darth-vader.png`. When an image is absent, the interface displays an initials-based fallback.

Third-party images placed under `assets/` remain subject to their respective rights and are not automatically covered by this project's MIT license.

## Verification

Run the local checks with:

```bash
python3 -m unittest discover -s tests
bash -n scripts/update-data.sh
node --check app.js
```

## Disclaimer

SWGOH Forge is an unofficial fan project and is not affiliated with, endorsed by, sponsored by, or associated with Electronic Arts, Lucasfilm Ltd., The Walt Disney Company, or their affiliates.

STAR WARS, *STAR WARS: Galaxy of Heroes*, related characters, ships, names, trademarks, logos, artwork, and other third-party intellectual property remain the property of their respective rights holders.

## License

The project's original source code is available under the [MIT License](LICENSE). This license does not grant rights to third-party intellectual property, artwork, or game data.
