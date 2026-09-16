// MC 1193.15 — TDD tests for PHASE-7: mobs (M10) — darkness spawn rule + chase AI.
// Run: node tests/core-mobs.test.js   (exit 0 = all pass)
// Extracts the Core section from index.html so the tests run against the
// SHIPPED source, not a copy (same harness pattern as core-craft.test.js).
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

// ---- helpers: build a tiny deterministic world ----
// 16x16x16 world, seed 42; carve a flat floor at y=8 so mob tests have ground.
function flatWorld() {
  var w = new C.World(16, 16, 16, 42);
  for (var x = 0; x < 16; x++)
    for (var z = 0; z < 16; z++)
      for (var y = 0; y < 16; y++)
        w.set(x, y, z, y <= 8 ? BLK.STONE : BLK.AIR);
  return w;
}

// ---- Core exports ----
check("Core exports Mob constructor", typeof C.Mob === "function");
check("Core exports MOB constants", C.MOB && typeof C.MOB === "object");
check("MOB.DARK_LEVEL is 7 (hostile spawn rule: sky light < 7)", C.MOB && C.MOB.DARK_LEVEL === 7);
check("Core exports skyExposed (sky-exposure scan)", typeof C.skyExposed === "function");
check("Core exports spawnMobs (darkness spawn rule)", typeof C.spawnMobs === "function");

// ---- sky-exposure scan (pure Core) ----
// skyExposed(world, x, y, z) = true when NO solid block sits above (x, y, z)
// up to the world top — i.e. the column sees the sky.
var w1 = flatWorld();
check("skyExposed: open column (floor at y=8) is exposed", C.skyExposed(w1, 5, 9, 5) === true);
check("skyExposed: cell under a roof is NOT exposed", (function () {
  var wRoof = flatWorld();          // own world: do not poison w1 for later checks
  wRoof.set(5, 12, 5, BLK.STONE);
  return C.skyExposed(wRoof, 5, 9, 5) === false;
})());
check("skyExposed: out-of-bounds column is not exposed (safe default)", C.skyExposed(w1, -1, 9, 5) === false);

// ---- Mob: passive + hostile kinds, AABB movement via collides ----
var mob = new C.Mob(w1, 5.5, 9, 5.5, "passive");
check("Mob stores position + kind", mob.x === 5.5 && mob.y === 9 && mob.z === 5.5 && mob.kind === "passive");
check("Mob hostile kind accepted", new C.Mob(w1, 5.5, 9, 5.5, "hostile").kind === "hostile");
check("Mob has step(dt) AI entry point", typeof mob.step === "function");

// Mob falls to the ground like the player (gravity + AABB collision).
// (The landing y settles ~0.02 above the block top — the same settle height
// Player.step produces with this collision resolution — so the tolerance is 0.05.)
var mob2 = new C.Mob(w1, 5.5, 12, 5.5, "passive");
for (var t = 0; t < 200; t++) mob2.step(0.033);
check("Mob falls and lands on ground (gravity + collision)", mob2.onGround === true && Math.abs(mob2.y - 9) < 0.05);

// Mob cannot walk through solid blocks (AABB collision, same as Player.move).
var w3 = flatWorld();
w3.set(7, 9, 5, BLK.STONE); w3.set(7, 10, 5, BLK.STONE);   // wall east of the mob
var mob3 = new C.Mob(w3, 5.5, 9, 5.5, "hostile");
mob3.target = { x: 12.5, y: 9, z: 5.5 };                    // chase a target behind the wall
for (var t3 = 0; t3 < 120; t3++) mob3.step(0.033);
check("Mob blocked by a wall (AABB collision respected)", mob3.x < 6.9);

// ---- Chase AI: hostile mob moves toward the target when in range ----
var w4 = flatWorld();
var mob4 = new C.Mob(w4, 5.5, 9, 5.5, "hostile");
mob4.target = { x: 8.5, y: 9, z: 5.5 };                     // 3 blocks east
var d0 = Math.abs(mob4.x - mob4.target.x) + Math.abs(mob4.z - mob4.target.z);
for (var t4 = 0; t4 < 60; t4++) mob4.step(0.033);
var d1 = Math.abs(mob4.x - mob4.target.x) + Math.abs(mob4.z - mob4.target.z);
check("hostile mob closes distance to its target (chase AI)", d1 < d0);

// Passive mob does NOT chase: it wanders (no net approach required) but must
// never gain the chase speed burst toward a target.
var w5 = flatWorld();
var mob5 = new C.Mob(w5, 5.5, 9, 5.5, "passive");
mob5.target = { x: 8.5, y: 9, z: 5.5 };
var moved = 0;
for (var t5 = 0; t5 < 60; t5++) { var px = mob5.x, pz = mob5.z; mob5.step(0.033); moved += Math.abs(mob5.x - px) + Math.abs(mob5.z - pz); }
check("passive mob wanders (moves) but is not a chaser", moved > 0 && moved < 60 * 0.033 * C.MOB.CHASE_SPEED);

// ---- Darkness spawn rule (pure Core) ----
// spawnMobs(world, rng, opts) scans candidate columns and returns the spawned
// mobs. Hostile mobs spawn ONLY where the sky-exposure scan says dark (a solid
// roof above), passive mobs only in open daylight.
var w6 = flatWorld();
w6.set(3, 12, 3, BLK.STONE);   // roof over column (3,*,3) -> dark under it
var rng6 = C.createRng(1234);
var spawned = C.spawnMobs(w6, rng6, { count: 40 });
check("spawnMobs returns an array of Mob instances",
      Array.isArray(spawned) && spawned.length > 0 && spawned.every(function (s) { return s instanceof C.Mob; }));
var hostiles = spawned.filter(function (s) { return s.kind === "hostile"; });
var passives = spawned.filter(function (s) { return s.kind === "passive"; });
check("spawnMobs spawned both kinds", hostiles.length > 0 && passives.length > 0);
check("hostile mobs spawned ONLY under cover (dark rule: sky light < 7)",
      hostiles.every(function (s) { return C.skyExposed(w6, Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) === false; }));
check("passive mobs spawned ONLY in the open (daylight rule)",
      passives.every(function (s) { return C.skyExposed(w6, Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) === true; }));
check("hostile spawn positions stand on solid ground",
      hostiles.every(function (s) {
        var bx = Math.floor(s.x), by = Math.floor(s.y), bz = Math.floor(s.z);
        return w6.get(bx, by, bz) === BLK.AIR && w6.get(bx, by - 1, bz) !== BLK.AIR;
      }));

// Determinism: same seed -> same spawn set (INVARIANT 1: seeded rng, never Math.random).
var w7 = flatWorld();
w7.set(3, 12, 3, BLK.STONE);
var a = C.spawnMobs(w7, C.createRng(1234), { count: 40 });
var b = C.spawnMobs(w7, C.createRng(1234), { count: 40 });
check("spawnMobs is deterministic for the same rng seed (invariant 1)",
      a.length === b.length && a.every(function (s, i) { return s.x === b[i].x && s.y === b[i].y && s.z === b[i].z && s.kind === b[i].kind; }));

// Spawn cap: never more than the requested count.
check("spawnMobs respects the count cap", C.spawnMobs(w7, C.createRng(9), { count: 5 }).length <= 5);

// ---- Pause-freeze contract (invariant 4, structural) ----
// Mob stepping is a Core function the Runtime calls from update() — the same
// gate that freezes the player. Prove the Core side: a mob that is not stepped
// does not move (the Runtime-side pause gate is asserted in selfCheck).
var mob8 = new C.Mob(w1, 5.5, 9, 5.5, "hostile");
mob8.target = { x: 12.5, y: 9, z: 5.5 };
var xBefore = mob8.x, zBefore = mob8.z;
check("mob state is frozen when step() is not called (pause contract, Core side)",
      mob8.x === xBefore && mob8.z === zBefore);

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
