# PHASE0.md — Clonecraft parity project: research, architecture map, derived phase plan

Phase-0 bundle for MC 1193 (project svarkor-clonecraft-compare), committed 2026-09-13 (UTC).
Repo: /srv/workspace/svarkor-clonecraft-improve-phase2/repo (main @ bde2782, clean; live at
https://sibbamala.com/clonecraft/). Owner ask: compare Clonecraft against real Minecraft, extend
features toward parity, and PLAY the game end-to-end to prove it behaves like real Minecraft.

Full source artifacts (this file is the distilled bundle):
- Research: /srv/workspace/svarkor-clonecraft-compare/artemis/1193.1-PARITY-RESEARCH-20260913.md
- Architecture map: /srv/workspace/svarkor-clonecraft-compare/artemis/1193.2-arch-map-and-seams-20260913.md
  (brief said `clonecraft-compare/bernie/ARCHITECTURE.md`; that path does not exist — the T2
  deliverable filed under the chain is the 1193.2 file above, used here instead.)

Claim vocabulary used throughout: **PASS** = a named check ran this turn and its output is pasted;
**FAIL** = the check ran and did not hold; **UNVERIFIED** = not checked (UNVERIFIED is never PASS).

---

## Part 1 — Research summary (from 1193.1, all wiki claims VERIFIED via minecraft.wiki API 2026-09-13)

What Clonecraft already has (verified by reading index.html, 57,309 bytes / 1,274 lines):
deterministic world gen (value noise, 96×48×96), 9 block types, trees, AABB collision + gravity +
jump/walk/sprint, DDA raycast break/place, hotbar 1–9, 20-min day/night cycle with sky gradient +
sun/moon, health + hunger HUD with well-fed regen, fall-out-of-world damage + respawn, localStorage
save/load with same-seed guard, sound engine (muted by default), pause, pointer lock + touch
fallback, headless selftest (`?selftest`), procedural textures.

Real Minecraft core mechanics (each cited in the full research file): M1 day/night 20 min; M2
hardness × tool multipliers (base time = hardness × 1.5 if harvestable else 5; tool speeds 1/2/4/6/8);
M3 crafting 2×2 inventory grid + 3×3 table; M4 inventory screen; M5 hunger gates sprint + regen
(regen at hunger ≥ 18, every 4 s); M6 health/regen; M7 fall damage = Max(0, Floor[(fallDist − 3) × 1])
half-hearts; M8 water spreads 7 blocks, 1 block / 5 game ticks; M9 lava 3 blocks, 1 / 30 ticks;
M10 mobs with darkness spawn rule (hostile: sky light < 7); M11 tools speed + harvest gating;
M12 trees; M13 caves with ores + hostile spawns; M14 exactly two fluids; M15 sprint; M16 sneak;
M17 survival loop (collect → craft → build → fight → eat → explore).

Ranked shortlist of MISSING features (impact × feasibility):
1. Timed block breaking with hardness + tools (M2/M11) — breaking is currently instant.
2. Fall damage (M7) — one formula in Player.step.
3. Caves (M13) — 3D noise carve pass; existing makeNoise primitive reused.
4. Crafting + item inventory (M3/M4) — unlocks the survival loop; needs an item-count model.
5. Mobs (M10) — passive + one hostile, darkness spawn rule; do after crafting so drops have a consumer.
6. Fluid flow (M8/M9) — cellular spread, throttled to hold 60 fps.
7. Sneaking (M16) — slow move + edge guard.
8. Food + eating (M5) — closes the hunger loop opened by #4/#5.

Deliberately out of scope: multiplayer, redstone, Nether/End, enchanting (low value-per-effort for
a single-file game). Prior art consulted: Overv/WebCraft, voxel-engine, voxel-game-js,
prismarine-viewer (all cited in the full research file).

## Part 2 — Architecture map (from 1193.2; line anchors re-verified against bde2782 this turn)

One file, three sections:

| Section | Lines | Exports | Depends on |
|---|---|---|---|
| CSS + HTML shell | 7–151 | DOM ids | — |
| ClonecraftCore (pure, headless) | 154–406 | `module.exports` L404 + `window.ClonecraftCore` L406 | nothing (no DOM/window) |
| ClonecraftApp (render math, pure) | 409–554 | L552/L553 | Core (`C.BLK` only) |
| Runtime (DOM wiring, IIFE) | 557–1271 | nothing — closure-private | Core + App via `C`/`A` |

Key closure edges (grep-verified): `World._generate` L224 (seeded via `createRng` L171);
`collides` L285 ← Player.move L308/312/316 + placeBlock L910; `Player.step` L330 ← update L1031;
`raycast` L340 ← aimTarget L877; `breakBlockAt` L880 (instant AIR set — the S1 seam);
`placeBlock` L907; `update()` L1017 gated by `started && !paused` L1000; `render()` L1055 always
runs; `selfCheck` L1128 asserts determinism, physics, edit roundtrip, render pixels, sky, pause,
sound, single-entry start, hotbar select.

Invariants (violating any is a bug):
1. **World determinism per seed** — any new generation pass (caves, ores) draws from a seeded rng
   (`createRng(seed ^ const)`), never `Math.random` (asserted by selftest L1143).
2. **Core purity** — ClonecraftCore stays DOM/window-free; new game rules (hardness, fall damage,
   fluid ticks, mob AI) belong in Core; only DOM feedback in Runtime.
3. **Save contract** — `v:1` + same-seed guard (L646); new persisted state = optional fields
   defaulted on load (L658–659 pattern) or an explicit v-bump with v1 fallback; never a silent
   format change.
4. **Pause gates simulation, not rendering** — every new per-tick system lives inside `update()`.
5. **Single entry point** — startBtn is the only path into the sim (asserted L1240–1243).
6. **Sound muted by default** (autoplay policy, asserted L1231).

Seams (S1–S8) for the eight shortlist features are mapped in the full 1193.2 file §4; the phase
plan below follows their dependency order. Cross-cutting rule: extend `selfCheck` with an
assertion per feature — the selftest is the fleet's proof instrument for this game.

## Part 3 — Derived phase plan

Build order follows the dependency arrows of Part 2: pure-Core changes first (no new state, no
save risk) → Runtime-state features → new persisted state (save extension) → features that consume
the item model → the fps-riskiest system last → integration → live played acceptance. Phase count
is derived, not templated. Every phase names seat, gate, onfail target and cycles budget; every
DoD uses the claim vocabulary above.

| Phase | Work | Seat | Gate (who verifies, against what) | onfail | cycles |
|---|---|---|---|---|---|
| 1 | DA gate over THIS bundle (citations, closure holes, plan-follows-map, seams) | neo | neo: verdict file over docs/PHASE0.md + both source artifacts | back→plan repair | 3 |
| 2 | S2 fall damage (M7 formula in Player.step) + S7 sneak (M16) — pure Core | teddy | dobbie: node test of the M7 formula + `?selftest` PASS | back→2 | 2 |
| 3 | S1 timed breaking + hardness table (M2), tool=hand only (M11 deferred to items) | teddy | dobbie: selftest edit-roundtrip PASS + hold-to-break interrupt check | back→3 | 2 |
| 4 | S3 caves — seeded 3D noise carve in `World._generate` | teddy | dobbie: determinism assertion L1143 PASS for same seed; carve keeps bedrock + lava band | back→4 | 2 |
| 5 | S4 crafting + item inventory (M3/M4) — item model, 2×2 grid, save extension | teddy | dobbie: v1-save backward-compat test + selftest hotbar assertions PASS | back→5 | 3 |
| 6 | S8 food + eating (M5) — needs phase 5's item model | teddy | dobbie: eat action drains→restores hunger in a node test; selftest PASS | back→6 | 2 |
| 7 | S5 mobs (M10) — passive + one hostile, darkness spawn rule, chase AI | teddy | dobbie: mob tick inside update() (pause invariant 4) + spawn-rule unit test | back→7 | 3 |
| 8 | S6 fluid flow (M8/M9) — throttled cellular spread, fps-budgeted | teddy | dobbie: spread-rate unit test + fps sanity under fluid ticks | back→8 | 2 |
| 9 | Integration + final honest audit: claims vs artifacts on a clean checkout | neo | neo: every PASS re-run, UNVERIFIED items listed, no production claim beyond evidence | back→offending phase | 2 |
| 10 | Played-through live acceptance on https://sibbamala.com/clonecraft/ | henrik | svarkor: postpublish-accept.sh exit 0 + gameplay flow (spawn, move, break, place, save/load) exercised in a headless browser with vision check | back→9 | 3 |

Phase-1 note: the bundle below the 32 KB split trigger → ONE DA card (1193.4, filed) reviews all
three deliverables, per the phase-0 skill's scale-adaptive rule.

Phase-10 note (owner rulings MC#2316 / MC 2162): the app is already hosted; the repo carries a
valid `hosting.yaml` (present at repo root, verified this turn). The publishing phase therefore
carries the POST-publish DoD: `postpublish-accept.sh --url https://sibbamala.com/clonecraft/`
exits 0 AND the gameplay flow is exercised with pixels + vision. The gate is routed to henrik
(vm105), one of the four seats with both browser and vision.

Per-phase DoD lines (machine-checkable):
- P2: `DoD: node test asserts fall damage = Max(0, Floor[(fallDist−3)×1]) for 4/5/10/30-block falls; ?selftest exits PASS; VERIFY_EXIT=0.`
- P3: `DoD: hardness table covers all 9 block ids; hold-to-break progress visible and resets on aim change; selftest PASS; VERIFY_EXIT=0.`
- P4: `DoD: same seed twice → byte-identical grid WITH caves enabled; y=0 bedrock intact; lava band intact; selftest PASS; VERIFY_EXIT=0.`
- P5: `DoD: v1 save payload loads into new code with items defaulted empty; 2×2 craft of planks→crafting table works in a node test; selftest hotbar assertions PASS; VERIFY_EXIT=0.`
- P6: `DoD: eating a food item raises hunger in a node test; hunger still gates regen; selftest PASS; VERIFY_EXIT=0.`
- P7: `DoD: hostile mob spawns only where sky-exposure scan says dark; mob state frozen while paused; selftest PASS; VERIFY_EXIT=0.`
- P8: `DoD: water spreads ≤7 blocks at the throttled rate in a node test; frame budget respected (tick cap); selftest PASS; VERIFY_EXIT=0.`
- P9: `DoD: audit file lists every claim with PASS/FAIL/UNVERIFIED and a re-run command; zero unexplained FAILs.`
- P10: `DoD: postpublish-accept.sh exit 0 on the live URL; headless-browser gameplay flow (spawn→move→break→place→save→load) recorded with screenshots; vision check confirms HUD + world render; zero console errors.`

## Part 4 — Test-plan skeleton (two-sided calibration)

Harnesses, each proven able to FAIL before its greens count:

| Harness | Runs | Self-test (must go red first) |
|---|---|---|
| H1 node core tests (new, per phase) | `node tests/core-<phase>.test.js` | a deliberately wrong expected value (e.g. fall damage formula with −3 replaced by −4) must FAIL the suite before the correct version is committed |
| H2 in-game selftest | `?selftest` headless dump | one assertion temporarily inverted (the round2b history shows this exact false-green class) must print FAIL before greens are trusted |
| H3 save backward-compat (phase 5) | node script loading a real v1 payload | a payload with a truncated grid must be REJECTED (red) before the accept path is tested |
| H4 postpublish acceptance (phase 10) | `/usr/local/bin/postpublish-accept.sh --url …` | run once against a deliberately wrong URL (404) to prove the harness reports FAIL |

Rule: a harness that has never been seen red is not calibrated; its green runs do not count as
evidence. Every phase's gate runs its harness and pastes the exit code (`VERIFY_EXIT=`).

## Part 5 — Verification of this bundle (executed 2026-09-13)

- `wc -c index.html` → 57309; `git log --oneline -1` → `bde2782`; `git status --short` → empty (clean tree).
- Line anchors re-verified by grep this turn: breakBlockAt L880, collides L285, TIME_CYCLE L611,
  HOTBAR L710, placeBlock L907, selfCheck L1128 — all match Part 2's table.
- `hosting.yaml` present at repo root (ls this turn).
- UNVERIFIED (labeled): browser-side fps under fluid ticks, pointer-lock behavior, and the live
  URL's current state — no browser run in this planning turn; phase 10's harness is the instrument.
