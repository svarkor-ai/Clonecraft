// MC 1193.29 — TDD tests for PHASE-8: fluid flow (M8/M9) — throttled cellular spread.
// Run: node tests/core-fluid.test.js   (exit 0 = all pass)
// Extracts the Core section from index.html so the tests run against the
// SHIPPED source, not a copy (same harness pattern as core-fall/core-mobs).
"use strict";
var fs = require("fs");
var path = require("path");

var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var lines = html.split("\n");
// Core section: from the "Clonecraft Core" banner to just before the App banner.
var startIdx = lines.findIndex(function (l) { return l.indexOf("Clonecraft Core (pure") >= 0; });
var endIdx = lines.findIndex(function (l) { return l.indexOf("Clonecraft App (render math") >= 0; });
if (startIdx < 0 || endIdx < 0) { console.error("FAIL: Core section not found in index.html"); process.exit(1); }
var coreSrc = lines.slice(startIdx, endIdx).join("\n");
var m = { exports: {} };
new Function("module", "window", coreSrc)(m, undefined);
var C = m.exports;

var failures = 0;
function check(name, cond) {
  if (cond) { console.log("PASS " + name); }
  else { console.log("FAIL " + name); failures++; }
}

var BLK = C.BLK;

// ---- helpers ----
// 16x16x16 world, flat stone floor at y=8, air above — no generated water/lava.
function flatWorld() {
  var w = new C.World(16, 16, 16, 42);
  for (var x = 0; x < 16; x++)
    for (var z = 0; z < 16; z++)
      for (var y = 0; y < 16; y++)
        w.set(x, y, z, y <= 8 ? BLK.STONE : BLK.AIR);
  return w;
}
// Count fluid cells in a horizontal band (y fixed) within a radius of (cx, cz).
function countFluid(w, y, cx, cz, r, id) {
  var n = 0;
  for (var x = Math.max(0, cx - r); x <= Math.min(w.w - 1, cx + r); x++)
    for (var z = Math.max(0, cz - r); z <= Math.min(w.d - 1, cz + r); z++)
      if (w.get(x, y, z) === id) n++;
  return n;
}

// ---- Core exports + constants (M8: water 7 blocks, 1 block / 5 game ticks;
//      M9: lava 3 blocks, 1 block / 30 game ticks) ----
check("Core exports tickFluids", typeof C.tickFluids === "function");
check("Core exports FLUID constants", C.FLUID && typeof C.FLUID === "object");
check("FLUID.WATER_SPREAD === 7 (M8: water spreads 7 blocks)", C.FLUID.WATER_SPREAD === 7);
check("FLUID.WATER_INTERVAL === 5 (M8: 1 block / 5 game ticks)", C.FLUID.WATER_INTERVAL === 5);
check("FLUID.LAVA_SPREAD === 3 (M9: lava spreads 3 blocks)", C.FLUID.LAVA_SPREAD === 3);
check("FLUID.LAVA_INTERVAL === 30 (M9: 1 block / 30 game ticks)", C.FLUID.LAVA_INTERVAL === 30);
check("FLUID.TICK_CAP is a positive number (frame-budget cap)", typeof C.FLUID.TICK_CAP === "number" && C.FLUID.TICK_CAP > 0);

// ---- M8: water spreads DOWN first, then sideways, max 7 blocks ----
// One water source on the floor: after enough throttled ticks it must have
// spread at most 7 blocks horizontally from the source (MC parity), and the
// spread must be progressive (not all at once — throttled).
var wW = flatWorld();
wW.set(8, 9, 8, BLK.WATER);
// 7 blocks of spread at 1 block / 5 ticks: 7 spread steps = 35 fluid ticks.
for (var t = 0; t < 40; t++) C.tickFluids(wW);
var wSpan = countFluid(wW, 9, 8, 8, 7, BLK.WATER);
var wOutside = countFluid(wW, 9, 8, 8, 8, BLK.WATER) - wSpan;
check("water: spreads on the floor after 40 ticks (span cells " + wSpan + " > 1)", wSpan > 1);
check("water: never exceeds 7-block radius (outside cells " + wOutside + " === 0)", wOutside === 0);

// Progressive/throttled: after ONE tick from a fresh source, exactly one new
// cell (down or sideways) — not the full 7-block pool in a single tick.
var wW2 = flatWorld();
wW2.set(8, 9, 8, BLK.WATER);
C.tickFluids(wW2);
var after1 = countFluid(wW2, 9, 8, 8, 8, BLK.WATER);
check("water: throttled — one tick spreads at most 1 new cell (got " + after1 + ")", after1 === 2);

// Falling: water above a hole falls down before spreading sideways.
var wF = flatWorld();
wF.set(8, 9, 8, BLK.WATER);
wF.set(8, 8, 8, BLK.AIR);   // hole in the floor under the source
C.tickFluids(wF);
check("water: falls into the hole below on the first tick", wF.get(8, 8, 8) === BLK.WATER);

// ---- M9: lava spreads max 3 blocks, slower than water ----
var wL = flatWorld();
wL.set(8, 9, 8, BLK.LAVA);
for (var t2 = 0; t2 < 40; t2++) C.tickFluids(wL);
var lSpan = countFluid(wL, 9, 8, 8, 3, BLK.LAVA);
var lOutside = countFluid(wL, 9, 8, 8, 8, BLK.LAVA) - lSpan;
check("lava: spreads on the floor after 40 ticks (span cells " + lSpan + " > 1)", lSpan > 1);
check("lava: never exceeds 3-block radius (outside cells " + lOutside + " === 0)", lOutside === 0);

// Slower rate: in the same number of ticks, lava must spread strictly less
// than water (30-tick interval vs 5-tick interval).
var wL2 = flatWorld();
wL2.set(8, 9, 8, BLK.LAVA);
for (var t3 = 0; t3 < 10; t3++) C.tickFluids(wL2);
var lEarly = countFluid(wL2, 9, 8, 8, 8, BLK.LAVA);
var wW3 = flatWorld();
wW3.set(8, 9, 8, BLK.WATER);
for (var t4 = 0; t4 < 10; t4++) C.tickFluids(wW3);
var wEarly = countFluid(wW3, 9, 8, 8, 8, BLK.WATER);
check("lava spreads slower than water in 10 ticks (lava " + lEarly + " < water " + wEarly + ")", lEarly < wEarly);

// ---- Frame budget: tick cap ----
// A world saturated with fluid sources must not update more than FLUID.TICK_CAP
// cells in one tick — the cap is the fps guard.
var wCap = flatWorld();
for (var cx = 1; cx < 15; cx++) for (var cz = 1; cz < 15; cz++) wCap.set(cx, 9, cz, BLK.WATER);
var capped = C.tickFluids(wCap);
check("tick cap: saturated world updates <= FLUID.TICK_CAP cells in one tick (" + capped + " <= " + C.FLUID.TICK_CAP + ")", capped <= C.FLUID.TICK_CAP);
check("tick cap: returns the number of cells updated (number)", typeof capped === "number");

// ---- Determinism (invariant 1): same seed + same schedule -> identical grid ----
var wD1 = flatWorld(), wD2 = flatWorld();
wD1.set(8, 9, 8, BLK.WATER); wD2.set(8, 9, 8, BLK.WATER);
for (var t5 = 0; t5 < 20; t5++) { C.tickFluids(wD1); C.tickFluids(wD2); }
var identical = true;
for (var i = 0; i < wD1.data.length; i++) if (wD1.data[i] !== wD2.data[i]) { identical = false; break; }
check("determinism: two identical runs produce byte-identical grids", identical);

// ---- Fluids do not overwrite solids; solids block spread ----
var wS = flatWorld();
wS.set(8, 9, 8, BLK.WATER);
wS.set(7, 9, 8, BLK.STONE);   // wall to the -x side
for (var t6 = 0; t6 < 20; t6++) C.tickFluids(wS);
check("solids: water never replaces a solid block", wS.get(7, 9, 8) === BLK.STONE);

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
