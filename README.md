# SWGOH Forge

**Find the right squad for every battle.**

SWGOH Forge is an unofficial, fan-made planning concept for *Star Wars: Galaxy of Heroes*. It is a static frontend prototype with an optional local data pipeline for generating a current character and ship catalog from [SWGOH Comlink](https://github.com/swgoh-utils/swgoh-comlink).

The unit catalog, general squad-synergy model, and selected player roster snapshots can be generated from current game data. General squad scores compare leader coverage, kit relationships, assists, recovery/control mechanics, explicit team-up tags, faction cohesion, and role balance. The squad matchup simulator runs seeded Monte Carlo battles over normalized base stats and compact kit mechanics. Both are explainable estimates—not observed win rates or an exact reproduction of the game engine. Fleet results, requirements, missions, and whole-roster assignments remain structured demonstrations.

## Prototype features

- Squad builder with required-character, required-leader, and locally cached exclusion constraints and 1–20 ranked results
- Data-driven general squad formation ranking with leadership and cohesion explanations
- Fleet builder with capital ship, starters, reinforcements, and reinforcement order
- Local two-squad battle simulation with reproducible outcomes and coverage disclosure
- Demo fleet counter flow
- Searchable, filterable character and ship pickers
- Minimum, recommended, and safe requirement tiers
- Locally generated static roster profiles, readiness comparisons, and owned-unit filtering
- Automatic exclusion of characters absent from the loaded roster snapshot
- Demo whole-roster assignments, clearly separated from real roster progression
- Optional locally generated unit, ship, category, and English-name snapshot
- Optional localized kit, explicit ability-synergy, and in-game recommended-squad snapshot
- Responsive layouts and keyboard-accessible dialogs and drawers

## Running the site locally

No frontend build step is required. From the repository root, run:

```bash
python3 -m http.server
```

Then open [http://localhost:8000](http://localhost:8000). The checked-in catalog is used until you run the optional updater below.

The checked-in catalog is a point-in-time snapshot. A successful local update labels it **Local SWGOH Comlink snapshot** and records its generation date and game-data version. If the interface says **Bundled seed catalog (not complete)**, the updater did not finish successfully and that small fallback catalog should not be treated as current.

## Updating game data locally

This repository deliberately does not scrape SWGOH.GG or run data collection in GitHub Actions. The updater talks only to a Comlink service you operate and writes a normalized static snapshot that can be reviewed and committed.

Requirements:

- Docker with Compose support
- Python 3.10 or newer

The simplest option starts the pinned Comlink 4.5.0 server on a currently unused loopback port, waits for its HTTP API, updates the catalog, and stops it again. It creates a stable, installation-specific `APP_NAME` under `.cache/comlink/`; Comlink uses that identity in game API requests and warns that a shared generic name can collide with other installations.

```bash
./scripts/update-data-full.sh
```

The final line must say `The complete Comlink catalog was generated successfully.` If the command exits earlier, the seed files are left unchanged so a partial response cannot replace them.

To manage the service yourself, start the pinned Comlink container on the loopback interface:

```bash
export COMLINK_APP_NAME=swgoh-forge-my-installation
docker compose -f compose.comlink.yaml up -d
```

After the service starts, generate the catalog:

```bash
./scripts/update-data.sh
```

Port 3000 is the manual default. If another application already uses it, select another port for both commands:

```bash
COMLINK_APP_NAME=swgoh-forge-my-installation COMLINK_PORT=3200 \
  docker compose -f compose.comlink.yaml up -d
COMLINK_URL=http://127.0.0.1:3200 ./scripts/update-data.sh
```

The wrapper creates or repairs `.venv-data`, installs the pinned `swgoh_comlink` Python client, and updates:

- `data/characters.js`
- `data/ships.js`
- `data/catalog-meta.js`
- `data/synergies.js`

It reads `/enums` and uses only values advertised by that running server. The first unit request asks for the minimal `UnitDefinitions` collection; `Segment3` is tried once only if that request fails. This avoids making a large aggregate the first request against a fresh container. `CategoryDefinitions` is requested separately and remains optional because faction labels can be inferred from unit category IDs. The updater then requests `SkillDefinitions`, `AbilityDefinitions`, and `RecommendedSquads` separately for team modeling. If one is unavailable, the generated metadata records the limitation and the model falls back to unit tags and localized final-tier kit text rather than silently treating missing relationships as complete data.

If both unit strategies fail, the updater makes one small `EquipmentDefinitions` request. A successful probe isolates the problem to unit data or response size; a failed probe shows that `/data` is unavailable even for a small live-enum collection. It never invents `ALL=-1` when the live enum does not expose that value.

Metadata, localization, and game data are all requested for Android by default and the returned asset platform is validated. Override the platform consistently with `COMLINK_DEVICE_PLATFORM` only if needed. One localization locale (`ENG_US` by default) is requested before unit data so it is preserved even when `/data` fails.

Each network request is printed with its exact non-secret JSON body and elapsed time. `.cache/comlink/` contains the evidence needed to reproduce a failure:

- `diagnostic.json` — request sequence, bodies, timings, response collection counts, exception chains, and failure classification
- `runtime.json` — Docker, container, image digest, app identity, and requested server version
- `openapi.json` — the schema served by that exact Comlink container
- `container.log` — timestamped server output, on success and failure
- `enums.json`, `metadata.json`, and `localization.json` — the successful upstream responses before game data

The directory is ignored by Git and the capture redacts environment names that look sensitive. Sentry/error reporting is not enabled. Rebuild a completed raw snapshot without contacting Comlink using:

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

# Temporarily test another explicitly selected Comlink release
COMLINK_SERVER_VERSION=4.5.0 ./scripts/update-data-full.sh --dry-run
```

The updater preserves existing human-readable IDs where localized names match, adds stable base-ID aliases, selects the highest-rarity definition for each playable unit, links ships to their crew, and writes files atomically. It also links unit skill IDs to final-tier localized kits, records explicit ability target categories and game-provided squad compositions when available, and reduces kit text to compact relationship signals instead of publishing full descriptions. Comlink encounter clones are excluded using their nonzero `obtainableTime` sentinel; this removes raid, journey, and inherited-event copies without relying on naming suffixes. It refuses an implausibly small response or a snapshot that unexpectedly removes existing IDs. `--allow-missing-seed-units` is available for an intentional removal after reviewing the result.

## Updating player rosters locally

GitHub Pages cannot run a server, so the published site cannot fetch an arbitrary Ally Code on demand. Roster profiles are instead generated locally and stored in `data/rosters.js`. Run:

```bash
./scripts/update-roster-full.sh 123-456-789
```

The wrapper starts the pinned Comlink container on an unused loopback port, requests the public `/player` profile, normalizes the useful roster progression, writes the snapshot atomically, and stops Comlink. It uses only Python's standard library and Docker; it does not require the data-updater virtual environment.

The Ally Code is an upsert key. Running the command again replaces that player's existing snapshot, while a new Ally Code is added alongside the existing entries. To validate a profile without writing it:

```bash
./scripts/update-roster-full.sh 123-456-789 --dry-run
```

After an update, reload the site and open **Roster**. Loading a saved Ally Code resets previous calculated results and the cached Build exclusions, then excludes every character in the current catalog that is absent from that roster. The Build optimizer therefore recommends only owned characters unless exclusions are manually changed afterward.

The generated file intentionally omits the internal player ID, raw equipped-mod records, datacrons, and other fields the interface does not use. It does include the Ally Code, player name, guild name, unit ownership, and progression. **Committing `data/rosters.js` publishes that information through the static site. Only commit a snapshot when the player expects it to be public.**

### What the team score means

The Build → Characters flow runs locally in the browser over the generated `data/synergies.js` model. It searches valid leaders and squad combinations while honoring required, excluded, and locked-leader constraints. Leadership coverage carries the largest weight, followed by shared affiliations, directed unique/special relationships, explicit `teamup_*` tags, role balance, and any game-provided recommended-squad overlap. Expanded results name the abilities and relationships that drove the score.

The score deliberately does not claim which squad wins a specific matchup. Gear, relics, mods, datacrons, turn order, AI behavior, an opponent lineup, and empirical battle outcomes are outside this general formation score. Those require roster and battle-history data that Comlink's static game definitions do not provide.

### What the battle simulation means

Counter → Squad compares two explicit 5v5 or 3v3 lineups in the browser. Each run models speed-based turns, Health and Protection damage, defense and penetration, critical hits, parsed recovery, Turn Meter, assists, a small set of control effects, cleanse, revive, cooldown reduction, and applicable abstracted leader benefits. Targeting, damage variance, critical hits, and effect application vary across the selected number of runs; the same matchup and context use the same seed, so results are reproducible.

The result includes a mechanic-coverage percentage and names unsupported or partial mechanics. This is essential: the current checked-in snapshot contains localized kit text rather than executable combat definitions, and many units use bespoke scripts, summons, transformations, locked effects, mode rules, and AI behavior that the compact model cannot reproduce. The simulator also uses normalized Gear XIII base stats, not a player's relics, mods, datacrons, ability upgrades, or roster state. Its percentages are useful for inspecting the model and comparing broad matchup tendencies, not for claiming real-world counter success.

Stop the local service when finished:

```bash
COMLINK_APP_NAME=swgoh-forge-my-installation docker compose -f compose.comlink.yaml down
```

The container is bound to `127.0.0.1`, so it is not exposed to other machines. If you configure HMAC on your own Comlink deployment, the updater also accepts `COMLINK_ACCESS_KEY` and `COMLINK_SECRET_KEY`; keep those values out of the repository.

### Data scope and provenance

The generated catalog files contain a compact subset needed by the UI: base ID, localized name, unit type, visible faction categories, alignment, role, leadership, crew relationships, display metadata, skill/ability relationship signals, and official recommended-squad membership when present. The catalog updater does not request player profiles, guilds, rosters, battle histories, or credentials. The separate roster updater requests only the explicitly supplied public Ally Code through `/player` and saves the normalized fields documented above.

SWGOH Comlink and `comlink-python` are third-party community projects. Their software licenses do not grant rights to Electronic Arts game data. Before redistributing generated snapshots, review the applicable game terms and repository policies yourself. Keeping the collection local reduces operational load and makes every update an explicit, reviewable action; it is not a grant of permission from a rights holder.

## GitHub Pages deployment

The `Deploy static site to GitHub Pages` workflow publishes the repository root after every push to `main`. It can also be run manually from the repository's **Actions** tab. The workflow requests Pages enablement, which handles repositories where the Pages site has not yet been created. Repository administrators can also select **Settings → Pages → Source → GitHub Actions** manually.

The catalog and roster updaters are not part of the deployment workflow. Run them locally, inspect the generated diff, and commit only the snapshots you want the published site to expose.

## Project structure

```text
swgoh-forge/
├── index.html
├── styles.css
├── app.js
├── team-optimizer.js          # Explainable general squad synergy search
├── battle-simulator.js        # Seeded approximate character battle engine
├── compose.comlink.yaml       # Loopback-only local Comlink service
├── requirements-data.txt     # Pinned Python updater dependency
├── scripts/
│   ├── update-data-full.sh    # Start service, update data, and clean up
│   ├── update-data.sh         # Update using a running Comlink service
│   ├── update-roster-full.sh  # Fetch and upsert one static player roster
│   ├── capture_comlink_runtime.py # Save image/runtime/API diagnostics
│   ├── update_game_data.py    # Fetch, normalize, validate, and generate
│   └── update_roster_data.py  # Normalize and atomically upsert roster data
├── data/
│   ├── catalog-meta.js        # Snapshot source, version, date, and counts
│   ├── characters.js          # Generated or bundled character catalog
│   ├── ships.js               # Generated or bundled ship catalogs
│   ├── synergies.js           # Generated unit-kit and team relationships
│   ├── recommendations.js     # Squad, fleet, counter, and roster demos
│   ├── encounters.js          # Context, objectives, and mission demos
│   └── rosters.js             # Locally generated static player snapshots
├── tests/
│   ├── test_update_game_data.py
│   ├── test_update_roster_data.py
│   ├── test_team_optimizer.js
│   └── test_battle_simulator.js
└── assets/
```

## Unit images

No copyrighted character or ship artwork is bundled. The interface intentionally renders initials instead of requesting the image paths present in catalog metadata.

Third-party images placed under `assets/` remain subject to their respective rights and are not automatically covered by this project's MIT license.

## Verification

Run the local checks with:

```bash
python3 -m unittest discover -s tests
node tests/test_team_optimizer.js
node tests/test_battle_simulator.js
bash -n scripts/update-data.sh scripts/update-data-full.sh scripts/update-roster-full.sh
for file in app.js battle-simulator.js team-optimizer.js; do node --check "$file"; done
```

## Disclaimer

SWGOH Forge is an unofficial fan project and is not affiliated with, endorsed by, sponsored by, or associated with Electronic Arts, Lucasfilm Ltd., The Walt Disney Company, or their affiliates.

STAR WARS, *STAR WARS: Galaxy of Heroes*, related characters, ships, names, trademarks, logos, artwork, and other third-party intellectual property remain the property of their respective rights holders.

## License

The project's original source code is available under the [MIT License](LICENSE). This license does not grant rights to third-party intellectual property, artwork, or game data.
