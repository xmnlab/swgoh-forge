# SWGOH Forge contributor and agent guide

This file is the durable project contract for contributors and coding agents. It records the important product, data, modeling, visual, and engineering decisions that are easy to lose between sessions.

Read this file before changing the repository. When behavior changes materially, update this file, the in-app Help page, and `README.md` together where applicable.

## Sources of truth and precedence

1. Follow the current user request and repository-level instructions.
2. Treat this `AGENTS.md` as the current project direction.
3. Treat `README.md` as the public operational and provenance documentation.
4. Treat tests and current implementation as executable contracts.
5. `PLAN.md` is the original historical brief. It is intentionally ignored by Git and parts of it are now superseded. Do not reintroduce obsolete restrictions from it without checking the current product.

Preserve the existing MIT `LICENSE`. The MIT license covers original project source code only; it does not grant rights to Star Wars, SWGOH, artwork, or game data.

## Product purpose

SWGOH Forge is an unofficial, fan-made planning tool for *Star Wars: Galaxy of Heroes*.

The product should help answer constrained formation questions rather than merely list powerful units:

- Which squad best fits required units or a required leader?
- Which owned units should be excluded or reserved?
- Which squad or fleet fits a battle context?
- Why does a formation rank where it does?
- What progression or Galactic Power does the loaded roster actually have?
- How might two explicit squads interact in an approximate simulation?

Characters and ships remain first-class concepts, but not every current feature has the same evidence level. Always disclose whether an output is snapshot-backed, modeled, or a structured demonstration.

## Current product status

The repository has evolved beyond the original static mockup:

- The unit catalog, roster progression, GP, and general squad model can be generated from local Comlink snapshots.
- General squad recommendations use an explainable data-driven optimizer.
- Squad-versus-squad simulation uses a compact seeded local model.
- Fleet rankings/counters, missions, requirements, and whole-roster assignment still contain curated prototype data.

Never present modeled or demo output as observed win-rate evidence or as an exact reproduction of the game.

## Technical constraints

- Frontend: HTML5, modern CSS, and vanilla JavaScript.
- Data: browser-loaded JavaScript snapshots under `data/`.
- Local updater: Python 3.10+ and a user-operated Docker/Comlink service.
- No React, Vue, Angular, Svelte, jQuery, Bootstrap, Tailwind, npm runtime dependencies, bundlers, transpilers, or frontend build step.
- The site must run with `python3 -m http.server`.
- The site must deploy as static files on GitHub Pages.
- Keep asset and script paths relative and GitHub Pages compatible.
- Use hash navigation; do not require server-side routing.

Important modules:

- `app.js` — application state, routing, rendering, and interactions.
- `styles.css` — responsive visual system.
- `catalog-index.js` — canonical unit lookup and roster GP mapping.
- `team-optimizer.js` — general squad search, evaluation, and ordering.
- `battle-simulator.js` — seeded approximate squad simulation.
- `scripts/update_game_data.py` — catalog/synergy normalization and validation.
- `scripts/update_roster_data.py` — roster normalization and GP calculation.
- `data/*.js` — checked-in static snapshots and structured demo data.

## Static deployment and CI

`.github/workflows/deploy-pages.yml` publishes the repository root:

- after a push to `main`;
- when manually started with `workflow_dispatch`.

The workflow uses GitHub Pages enablement and must remain compatible with repositories where Pages has not yet been initialized.

Do not add scheduled scraping or Comlink data collection to GitHub Actions by default. Data updates are deliberately local, explicit, inspectable, and committed only after review. A CI schedule would change the operational and provenance decision and requires explicit project-owner approval.

## Data sourcing and provenance boundaries

The current data policy is intentional:

- Do not scrape SWGOH.GG.
- Do not scrape Reddit or treat community posts as a complete authoritative catalog.
- Do not assume that public visibility or noncommercial use automatically grants permission to republish data.
- Do not use OpenAI/ChatGPT to invent, reconstruct, or silently “correct” game data in CI.
- Use only a locally operated SWGOH Comlink service for the optional catalog and Ally Code updater workflows.
- Comlink and `comlink-python` licenses do not grant rights to Electronic Arts game data. Keep provenance and legal caveats visible.
- No updater should request credentials, battle history, private guild data, or unrelated player information.

Local collection reduces automated load and makes updates reviewable; it is not permission from a rights holder.

## Catalog update contract

The preferred full update is:

```bash
./scripts/update-data-full.sh
```

The wrapper must:

- choose an unused loopback port instead of assuming port 3000 is free;
- create or repair `.venv-data` and bootstrap pip when necessary;
- start the pinned Comlink version with a stable installation-specific app name;
- bind Comlink to `127.0.0.1` only;
- wait for readiness, generate data, and always clean up its container/network;
- leave checked-in data unchanged when validation fails.

The updater must use live `/enums` values. Do not guess item masks, use deprecated `requestSegment`, or invent `ALL=-1` if the running service does not advertise it.

Request the smallest relevant collections first. `UnitDefinitions` is preferred for units; try the live Segment3 value only as a controlled fallback. Category, skill, ability, and recommended-squad collections are separate optional requests. Missing optional collections must lower the recorded data quality rather than being treated as complete.

Generated catalog files are:

- `data/characters.js`
- `data/ships.js`
- `data/catalog-meta.js`
- `data/synergies.js`

Do not hand-edit generated records. Fix the normalizer, add a regression test, and regenerate. Generated writes must remain atomic and must reject implausibly small or unexpectedly destructive snapshots.

Diagnostics under `.cache/comlink/` are intentionally untracked. Preserve exact non-secret request bodies, timings, response collection counts, runtime/image metadata, API schema, and container logs when diagnosing failures. Redact secret-looking environment values and do not enable error reporting implicitly.

## Roster update and privacy contract

The static site has no backend and cannot fetch arbitrary Ally Codes from a visitor's browser. Update a roster locally with:

```bash
./scripts/update-roster-full.sh 123-456-789
```

Rules:

- Ally Code is the upsert key: refresh an existing entry or append a new one.
- Calculate per-unit character and ship GP locally using the pinned `swgoh_comlink` stat calculator.
- Normalize skill levels and count zeta/omicron tiers from live definitions; do not infer them from ability names.
- Omit internal player IDs, raw mod records, datacrons, and fields the UI does not need.
- `data/rosters.js` is public if committed and deployed. Commit a player snapshot only when the player expects the normalized name, guild, Ally Code, ownership, progression, and GP data to be public.
- Browser storage remembers only UI preferences such as active Ally Code and excluded unit IDs. Roster progression always comes from the current static snapshot after refresh.

Loading a roster resets stale calculated results and cached Build exclusions, then excludes every catalog character absent from that roster.

## Unit identity is immutable

Canonical human-readable unit IDs are application state. They must always resolve to themselves before base IDs or legacy aliases are considered.

Use `ForgeCatalogIndex.createUnitMap`; do not recreate a naïve lookup map in another module. The required precedence is:

1. canonical `unit.id`;
2. base ID if it does not collide;
3. alias if it does not collide.

Known regression examples:

- `rey` must resolve to Galactic Legend Rey, not Rey (Scavenger), whose base ID is `REY` and whose legacy alias also normalizes to `rey`;
- `maul` must resolve to Maul, not Darth Maul.

Any catalog identity change requires regression coverage for all canonical IDs.

## Exclusions and explicitly selected units

Exclusions are hard constraints for generated recommendations, but explicit user selection takes precedence:

- Keep excluded units visible in required-unit and leader pickers.
- Clearly label them as excluded.
- Selecting an excluded unit as required or leader restores that exact canonical unit to the recommendation pool.
- Never silently select a similarly named owned character.
- Do not hide excluded units; users may be planning a future unlock.
- Persist Build exclusions locally across reset/refresh.

An absent roster unit is a hypothetical locked/unactivated unit, not an unknown identity.

## Galactic Power semantics

Keep roster GP separate from general synergy.

- An activated unit with calculated GP contributes its real GP.
- A catalog unit absent from a loaded roster is unactivated and contributes `0` GP.
- Label a formation containing such units with its locked-unit count.
- An activated unit from an older snapshot whose GP field is missing remains unknown; do not coerce it to zero.
- A team GP total is complete only when every activated member has calculated GP.
- Team GP can be chosen as an explicit primary sort, but it is not silently included in the default synergy composite.

## General squad optimizer contract

The Build → Characters optimizer is for general formation quality, not opponent-specific counter claims.

It must honor:

- formation size for 5v5 and 3v3;
- required units;
- exclusions;
- optional required leader;
- distinct formations;
- requested Top K from 1 through 20.

The optimizer first creates a larger candidate pool (currently up to 80), applies the chosen ordering and tie-breakers, and only then slices Top K.

Default exact composite:

- 44% leadership;
- 31% faction/category cohesion;
- 25% modeled kit mechanics;
- plus bounded game-recommended-squad overlap and role balance.

The visible whole-number Synergy value is rounded. Expose exact synergy and mechanics so equal-looking results remain explainable.

Supported primary ordering:

- overall exact synergy;
- leadership;
- cohesion;
- complete team GP.

Default ties use modeled mechanics and pair strength. GP sorting places complete totals before unavailable totals, then falls back to exact synergy/mechanics/pair strength.

### Ability-target matching

Localized kit text is an imperfect source and must be interpreted conservatively.

- Respect explicit grouped categories as AND conditions.
- Respect explicit separate categories as independent alternatives.
- Do not let a role word independently bypass a faction, alignment, profession, or species affinity named by the same inferred ability.
- Example: Rey being an Attacker must not make Moff Gideon's Dark Side/Imperial Trooper leadership apply to her merely because his composition text mentions Attacker slots.
- Keep the avatar leader-synergy segments and numeric leadership matcher semantically consistent.

When a strange cross-faction squad ranks highly, reproduce its exact metrics and inspect the parsed ability/category evidence before adding a one-off unit exception.

## Battle simulation contract

Counter → Squad runs a seeded local approximation over explicit teams. It may model normalized base stats, speed turns, damage, defense/penetration, critical hits, recovery, Turn Meter, assists, selected control effects, cleanse, revive, and cooldown changes.

It does not model the proprietary game engine, player mods/relics/datacrons, complete AI, every bespoke script, or observed battle outcomes.

Requirements:

- identical matchup/context inputs remain reproducible;
- show mechanic coverage and unsupported/partial mechanics;
- describe results as approximate model output, never empirical win rate;
- do not promote the simulator into the general synergy score.

## Avatar and visual-language contract

Do not bundle or automatically download copyrighted unit artwork. Catalog image paths are metadata for possible user-supplied assets, but the application currently renders intentional initial-based portraits. Never show broken-image placeholders.

Alignment palette:

- Light Side — cyan/blue lightsaber tone;
- Dark Side — crimson/red lightsaber tone;
- Neutral — silver/light gray tone.

Roster progression:

- exact `G` or `R` badge;
- training level and star rarity;
- ability, zeta, and omicron counts;
- one progression ring for Gear 1–3, two for 4–6, three for 7–9, and four for Gear 10+;
- white → green → blue → purple → Gear XII gold;
- Gear XIII/relic returns to the alignment palette, with a more vibrant multi-ring glow for actual relics;
- eligible Galactic Legends receive the gold Legend treatment, brighter when the Ultimate is unlocked.

Unactivated units must remain visibly aligned while clearly not ready:

- keep a pale cyan, crimson, or silver tint according to alignment;
- use lower saturation, lighter brightness/opacity, and a dashed edge;
- do not display fake gear, relic, star, ability, or GP progression.

Leader synergy ring:

- use one fixed segment per modeled leader group;
- matched groups glow vibrant green;
- unmatched groups remain dim;
- all allies use the same segment positions for direct comparison;
- the leader uses a crown and does not need an ally-coverage ring.

## Visual design and intellectual property

Maintain an original premium tactical interface: deep-space background, restrained holographic accents, thin borders, warm leader accents, strong typography, and minimal unnecessary glow.

Do not copy official SWGOH, SWGOH.GG, or another fan site's layout, CSS, decorative frames, icons, buttons, logo, fonts, or imagery. Keep the original Forge mark and wordmark. Do not use official Star Wars, Galaxy of Heroes, EA, Lucasfilm, or Disney logos.

## Navigation, responsiveness, and accessibility

Primary hash routes are:

- `#build`
- `#counter`
- `#missions`
- `#roster`
- `#help`

Do not perform full-page reloads between sections. Keep the five-item menu usable at desktop and mobile widths.

Responsive behavior is a product requirement, including Build mode and Build sequence—not just the surrounding page. Avoid fixed widths that create horizontal overflow. Grids should collapse intentionally, formations should wrap, dialogs should fit small screens, and controls should remain tappable down to narrow phone widths.

Maintain:

- semantic buttons, labels, tables, details, and navigation;
- visible keyboard focus;
- keyboard-operable picker/dialog/drawer interactions;
- Escape handling for overlays;
- accessible names for avatars, leader state, exclusions, and synergy;
- reduced-motion behavior;
- adequate contrast and touch targets.

The in-app Help page is part of the feature, not optional documentation. Update it whenever avatar semantics, sorting, GP, roster behavior, model limitations, or data provenance changes.

## Demo-data boundaries

Keep labels honest. At present:

- catalog/roster/progression/GP are snapshot-backed when generated;
- general squad synergy and squad simulation are explainable models;
- fleet rankings and counters, missions, requirements, and whole-roster assignments remain demonstrations.

Do not remove “Demo data,” prototype, or model-limit notices until the underlying feature genuinely uses reliable data.

## Working practices

- Inspect the worktree before editing and preserve unrelated user changes.
- Prefer small, explainable changes over unit-specific hard-coded exceptions.
- When diagnosing data issues, capture evidence and determine the schema/semantic cause before trying successive guessed constants.
- Change generator logic rather than hand-editing generated records.
- Add a regression test for every identity, GP, ranking, parser, or updater bug.
- Keep README, Help, and this file synchronized with user-visible semantic changes.
- Do not commit cache files, local environments, secrets, raw diagnostic captures, or `PLAN.md`.

## Verification

Run checks proportionate to the change. The complete local suite is:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/test_catalog_index.js
node tests/test_team_optimizer.js
node tests/test_battle_simulator.js
bash -n scripts/*.sh
for file in app.js catalog-index.js battle-simulator.js team-optimizer.js; do node --check "$file"; done
git diff --check
```

For CSS changes, also verify balanced delimiters and inspect relevant desktop, tablet, and narrow-phone layouts when a browser is available.

Data updater changes should additionally exercise dry-run fixtures and confirm that failed validation leaves generated files untouched.

## Decision ledger

These decisions are active unless explicitly superseded:

| Decision | Direction | Reason |
|---|---|---|
| Static-first architecture | GitHub Pages frontend; no production server yet | Keeps hosting simple and makes current capabilities honest |
| Local data generation | No scheduled CI scraping/data collection | Reviewability, reliability, operational load, and provenance concerns |
| Comlink source | Use a user-operated pinned Comlink service | Provides current structured game/player data without scraping third-party fan pages |
| Initials over images | Do not bundle or fetch copyrighted portraits | Avoid broken assets and unapproved redistribution |
| Canonical ID priority | IDs beat base IDs and aliases | Prevents collisions such as Rey/Rey (Scavenger) and Maul/Darth Maul |
| Soft override of exclusions | Explicit required/leader selection restores the exact excluded unit | Supports future-unlock planning without silent substitution |
| Locked GP is zero | Absent roster units contribute 0; missing GP on activated units remains unknown | Matches activation semantics without fabricating progression |
| GP separate from synergy | GP is an explicit sort only | Investment is not the same as kit compatibility |
| Explainable ranking | Exact score and tie-break evidence precede Top K slicing | Prevents confusing equal rounded scores |
| Conservative kit matching | Role text cannot bypass a named affinity | Avoids nonsensical cross-faction squads from flattened localized text |
| Segmented leader ring | Fixed group segments, bright matches, dim misses | Makes per-ally leader coverage directly comparable |
| Locked avatar treatment | Pale alignment tint plus dashed/desaturated state | Preserves Light/Dark/Neutral identity while communicating unavailable progression |
| Seeded approximate simulation | Show coverage and limitations | Useful experimentation without claiming the proprietary combat engine |
| Explicit demo labels | Keep prototype features visibly separated | Avoids presenting curated values as real recommendations |

