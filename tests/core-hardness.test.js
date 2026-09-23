// MC 1193.28 — TDD tests for timed breaking + hardness table (M2), tool=hand only.
// Run: node tests/core-hardness.test.js   (exit 0 = all pass)
// Extracts the Core section from index.html so the tests run against the
// SHIPPED source, not a copy (same harness pattern as core-food.test.js).
// FLOAT-SAFE: every computed-time comparison uses Math.abs(a-b) < 1e-9 —
// never === on products like 0.6*1.5 (the 1193.7 companion-test bug).
"use strict";
var fs = require("fs");
var path = require("path");

var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var lines = html.split("\n");
// Core section: from the "Clonecraft Core" banner to just before the App banner.
var startIdx = lines.findIndex(function (l) { return l.indexOf("Clonecraft Core (pure") >= 0; });
var endIdx = lines.findIndex(function (l) { return l.indexOf("Clonecraft App (render") >= 0; });
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
function near(a, b) { return Math.abs(a - b) < 1e-9; }

// ---- M2 hardness table: covers ALL 9 block ids (DoD) ----
// Real-Minecraft hand-mining base times (research 1193.1, minecraft.wiki):
// base time = hardness * 1.5 s if the block is harvestable by hand, else * 5.
// Hand tool speed = 1, so breakTime(id, "hand") = base time directly.
var BLK = C.BLK;
var IDS = [BLK.GRASS, BLK.DIRT, BLK.STONE, BLK.WOOD, BLK.LEAVES,
           BLK.SAND, BLK.WATER, BLK.SNOW, BLK.LAVA];
check("HARDNESS table exists and is an object", C.HARDNESS && typeof C.HARDNESS === "object");
check("HARDNESS covers all 9 block ids (1..9)", !!C.HARDNESS && IDS.every(function (id) {
  return typeof C.HARDNESS[id] === "number" && C.HARDNESS[id] >= 0;
}));
check("Core exports HARVESTABLE map", C.HARVESTABLE && typeof C.HARVESTABLE === "object");
check("Core exports breakTime function", typeof C.breakTime === "function");
if (typeof C.breakTime !== "function") { console.log(failures + " FAILURE(S) — breakTime missing, stopping early"); process.exit(1); }

// Harvestable-by-hand blocks: base = hardness * 1.5 (wiki values).
// grass 0.6 -> 0.9 s; dirt 0.5 -> 0.75 s; sand 0.5 -> 0.75 s; snow 0.1 -> 0.15 s;
// wood 2.0 -> 3.0 s; leaves 0.2 -> 0.3 s.
check("breakTime(GRASS) ~ 0.9  (0.6 * 1.5)", near(C.breakTime(BLK.GRASS), 0.9));
check("breakTime(DIRT)  ~ 0.75 (0.5 * 1.5)", near(C.breakTime(BLK.DIRT), 0.75));
check("breakTime(SAND)  ~ 0.75 (0.5 * 1.5)", near(C.breakTime(BLK.SAND), 0.75));
check("breakTime(SNOW)  ~ 0.15 (0.1 * 1.5)", near(C.breakTime(BLK.SNOW), 0.15));
check("breakTime(WOOD)  ~ 3.0  (2.0 * 1.5)", near(C.breakTime(BLK.WOOD), 3.0));
check("breakTime(LEAVES)~ 0.3  (0.2 * 1.5)", near(C.breakTime(BLK.LEAVES), 0.3));

// NOT harvestable by hand (stone needs a pickaxe in real MC): base = hardness * 5.
// SPEC (research 1193.1): stone by hand = 7.5 s — a hand CAN break stone slowly.
// (The 1193.7 patch returned Infinity here; this test pins the corrected spec.)
check("breakTime(STONE) ~ 7.5  (1.5 * 5, hand can break slowly)", near(C.breakTime(BLK.STONE), 7.5));

// Fluids: not breakable — breakTime returns Infinity (hold never completes).
check("breakTime(WATER) === Infinity (fluid, unbreakable)", C.breakTime(BLK.WATER) === Infinity);
check("breakTime(LAVA)  === Infinity (fluid, unbreakable)", C.breakTime(BLK.LAVA) === Infinity);

// Unknown id (AIR=0 or out of range): unbreakable, never a crash.
check("breakTime(AIR) === Infinity", C.breakTime(BLK.AIR) === Infinity);
check("breakTime(999) === Infinity (unknown id)", C.breakTime(999) === Infinity);

// Tool parameter: hand speed 1 (only tool this phase). A tool speed multiplier
// divides the base time — the seam M11 (tools) will plug into later.
check("breakTime(STONE, {speed:1}) ~ 7.5 (hand speed 1)", near(C.breakTime(BLK.STONE, { speed: 1 }), 7.5));
check("breakTime(STONE, {speed:2}) ~ 3.75 (speed divides)", near(C.breakTime(BLK.STONE, { speed: 2 }), 3.75));
check("breakTime(GRASS, {speed:2}) ~ 0.45 (harvestable path too)", near(C.breakTime(BLK.GRASS, { speed: 2 }), 0.45));

// ---- Hold-to-break progress model (pure Core helper) ----
// The Runtime advances a BreakProgress each update tick while the aim is held;
// the Core helper owns the arithmetic so the node test can prove it headless.
check("Core exports BreakProgress constructor", typeof C.BreakProgress === "function");
var bp = new C.BreakProgress(BLK.STONE);
check("BreakProgress starts at 0 progress, not done", bp.progress === 0 && !bp.done());
check("BreakProgress total matches breakTime(STONE)", near(bp.total, 7.5));
bp.tick(1.0);
check("tick(1.0s) on stone: progress 1.0/7.5, not done", near(bp.progress, 1.0) && !bp.done());
bp.tick(6.5);
check("tick(6.5s) more: stone done (total 7.5s)", bp.done());
var bp2 = new C.BreakProgress(BLK.DIRT);
bp2.tick(0.7);
check("dirt at 0.70s: not done (needs 0.75)", !bp2.done());
bp2.tick(0.055);
check("dirt at 0.755s: done (past total, float-safe)", bp2.done());
var bp3 = new C.BreakProgress(BLK.WATER);
bp3.tick(100);
check("water never completes (unbreakable)", !bp3.done());
var bp4 = new C.BreakProgress(BLK.AIR);
bp4.tick(100);
check("AIR never completes (unbreakable)", !bp4.done());

// Reset semantics: aim change resets progress (S1 seam requirement).
bp2.reset();
check("reset() zeroes progress", bp2.progress === 0 && !bp2.done());

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
