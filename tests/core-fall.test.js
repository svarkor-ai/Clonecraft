// MC 1193.5 — TDD tests for fall damage (M7) + sneaking (M16), pure Core.
// Run: node tests/core-fall.test.js   (exit 0 = all pass)
// Extracts the Core section from index.html so the tests run against the
// SHIPPED source, not a copy.
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

// ---- M7 fall damage formula: damage = Max(0, Floor[(fallDist - 3) * 1]) ----
// Health model: 0..20 whole units (Player "health 0..20"), damage() subtracts
// whole units — the formula's unit maps 1:1 onto the existing health scale.
// DoD: assert the formula for 4/5/10/30-block falls.
check("fallDamage(4)  === 1  (first damaging fall: floor(4-3)=1)", C.fallDamage(4) === 1);
check("fallDamage(5)  === 2", C.fallDamage(5) === 2);
check("fallDamage(10) === 7", C.fallDamage(10) === 7);
check("fallDamage(30) === 27", C.fallDamage(30) === 27);
check("fallDamage(3)  === 0  (exactly safe distance)", C.fallDamage(3) === 0);
check("fallDamage(2.5) === 0 (sub-block safe fall)", C.fallDamage(2.5) === 0);

// Build a tiny flat world: 8x8x8, ground at y=4 (STONE), air above.
function flatWorld() {
  var w = new C.World(8, 8, 8, 42);
  for (var x = 0; x < 8; x++) for (var z = 0; z < 8; z++) {
    for (var y = 0; y < 4; y++) w.set(x, y, z, C.BLK.STONE);
    for (var y2 = 4; y2 < 8; y2++) w.set(x, y2, z, C.BLK.AIR);
  }
  return w;
}

// Drop a player from `dropBlocks` above the ground surface (y=4) through the
// real physics loop; the applied damage must equal the formula over the
// MEASURED fall distance (discrete integration loses <1 block on landing).
function dropFrom(dropBlocks) {
  var w = flatWorld();
  var p = new C.Player(w, 4.5, 4 + dropBlocks, 4.5);
  var startY = p.y;
  for (var t = 0; t < 600 && !p.onGround; t++) p.step(0.033);
  var fallDist = startY - p.y;
  return { damage: 20 - p.health, health: p.health, onGround: p.onGround, fallDist: fallDist };
}

var cases = [4, 5, 10];
for (var i = 0; i < cases.length; i++) {
  (function (drop) {
    var r = dropFrom(drop);
    var expect = C.fallDamage(r.fallDist);
    check("drop " + drop + "b: measured fallDist " + r.fallDist.toFixed(2) +
          " -> damage " + expect + " (got " + r.damage + ")", r.damage === expect);
    check("drop " + drop + "b: health = 20-" + expect + " (got " + r.health + ")", r.health === 20 - expect);
    check("drop " + drop + "b: lands onGround", r.onGround);
  })(cases[i]);
}

// 30-block fall: damage 27 > 20 health -> clamped to 0 (death), per damage() clamp.
var r30 = dropFrom(30);
check("drop 30b: health clamped to 0 (got " + r30.health + ")", r30.health === 0);
check("drop 30b: applied damage = min(health, formula) = 20 (got " + r30.damage + ")", r30.damage === 20);

// ---- M16 sneak: slow move + edge guard (S7 seam) ----
check("Core exports SNEAK speed constant (0 < SNEAK < WALK)",
      typeof C.SNEAK === "number" && C.SNEAK > 0 && C.SNEAK < C.WALK);

var wS = flatWorld();
var pS = new C.Player(wS, 4.5, 5, 4.5);
check("Player has .sneaking flag, default false", pS.sneaking === false);

// Edge guard, S7 semantics: sneaking on ground must never end at a position
// with NO support under the AABB ("would leave ground" = no block below).
// Walking (control) does leave the pillar and falls.
function pillarWorld() {
  var w = new C.World(8, 8, 8, 42);
  for (var x = 0; x < 8; x++) for (var z = 0; z < 8; z++)
    for (var y = 0; y < 8; y++) w.set(x, y, z, C.BLK.AIR);
  w.set(4, 3, 4, C.BLK.STONE);   // single pillar block, top surface y=4
  return w;
}
function supported(w, p) { return C.collides(w, p.x, p.y - 1, p.z); }

var wP = pillarWorld();
var pP = new C.Player(wP, 4.5, 4, 4.5);
pP.onGround = true; pP.sneaking = true;
var everUnsupported = false;
for (var s = 0; s < 60; s++) { pP.move(0.1, 0, 0); if (!supported(wP, pP)) { everUnsupported = true; break; } }
check("sneak edge guard: never leaves the pillar after 60 moves (x=" + pP.x.toFixed(2) + ")", !everUnsupported && supported(wP, pP));
check("sneak edge guard: still onGround", pP.onGround);

// Control: NOT sneaking, same moves walk off the pillar and fall — proves the
// guard is the sneak's work, not a movement bug.
var wP2 = pillarWorld();
var pP2 = new C.Player(wP2, 4.5, 4, 4.5);
pP2.onGround = true;
var walkedOff = false;
for (var s2 = 0; s2 < 60; s2++) { pP2.move(0.1, 0, 0); pP2.step(0.033); if (!supported(wP2, pP2)) { walkedOff = true; break; } }
check("no sneak: walking leaves the pillar (walkedOff=" + walkedOff + ")", walkedOff);

// Sneak slow move: step() with vx = SNEAK advances slower than WALK.
var wA = flatWorld(), wB = flatWorld();
var pA = new C.Player(wA, 4.5, 5, 4.5); pA.sneaking = true; pA.vx = C.SNEAK; pA.vz = 0;
var pB = new C.Player(wB, 4.5, 5, 4.5); pB.vx = C.WALK; pB.vz = 0;
for (var st = 0; st < 10; st++) { pA.step(0.1); pB.step(0.1); }
check("sneak moves slower than walk (sneak dx=" + (pA.x - 4.5).toFixed(3) + " < walk dx=" + (pB.x - 4.5).toFixed(3) + ")", (pA.x - 4.5) < (pB.x - 4.5));

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
