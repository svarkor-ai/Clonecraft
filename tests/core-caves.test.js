// MC 1193.9 — TDD tests for PHASE-4 caves: seeded 3D noise carve in World._generate.
// Run: node tests/core-caves.test.js   (exit 0 = all pass)
// Extracts the Core section from index.html so the tests run against the
// SHIPPED source, not a copy (same harness pattern as core-fall.test.js).
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

// Small world for fast full-grid scans (same shape as the real one: h=48).
var W = 32, H = 48, D = 32, SEED = 20260826;

function buildWorld(seed) { return new C.World(W, H, D, seed); }

// Count AIR strictly BELOW each column's TERRAIN surface (topmost GRASS/SAND/
// SNOW), excluding the lava band rows [LAVA_TOP-2, LAVA_TOP] which the carve
// must leave intact. Pre-cave terrain fills this region completely, so any
// air here is carved cave. (Tree canopies are above terrainTop — not scanned.)
var TERRAIN = {};
TERRAIN[C.BLK.GRASS] = TERRAIN[C.BLK.SAND] = TERRAIN[C.BLK.SNOW] = true;
function terrainTop(w, x, z) {
  for (var y = H - 1; y >= 0; y--) if (TERRAIN[w.get(x, y, z)]) return y;
  return -1;
}
function countAirUnderground(w) {
  var lavaTop = Math.floor(H * 0.22); // 10 — mirrors _generate's LAVA_TOP
  var air = 0;
  for (var x = 0; x < W; x++)
    for (var z = 0; z < D; z++) {
      var top = terrainTop(w, x, z);
      for (var y2 = 1; y2 < top; y2++) {
        if (y2 >= lavaTop - 2 && y2 <= lavaTop) continue;   // lava band: exempt
        if (w.get(x, y2, z) === C.BLK.AIR) air++;
      }
    }
  return air;
}
// Band volume for the %-thresholds: same scan region, all cells.
var BAND_VOL = 0; // computed after world `a` exists
function bandVolume(w) {
  var lavaTop = Math.floor(H * 0.22);
  var vol = 0;
  for (var x = 0; x < W; x++)
    for (var z = 0; z < D; z++) {
      var top = terrainTop(w, x, z);
      vol += Math.max(0, top - 1 - 3); // y=1..top-1 minus 3 lava-band rows
    }
  return vol;
}

// ---- 1. Determinism invariant: same seed twice -> byte-identical grid WITH caves ----
var a = buildWorld(SEED);
var b = buildWorld(SEED);
BAND_VOL = bandVolume(a);
var identical = true;
for (var i = 0; i < W * H * D; i++) if (a.data[i] !== b.data[i]) { identical = false; break; }
check("same seed twice -> byte-identical grid (with caves)", identical);

// Different seed -> different grid (carve rng is seed-derived, not global)
var c = buildWorld((SEED + 7919) >>> 0);
var differs = false;
for (var j = 0; j < W * H * D; j++) if (a.data[j] !== c.data[j]) { differs = true; break; }
check("different seed -> different grid", differs);

// ---- 2. Caves actually exist: the underground band is hollowed out ----
// Pre-cave terrain fills every underground voxel; a carve pass must open air
// pockets. Threshold: >0.5% of the scanned band carved (real caves, not a
// token hole), and <20% (still mostly solid rock).
var airUg = countAirUnderground(a);
check("caves carve air pockets underground (air=" + airUg + " > 0.5% of band)", airUg > 0.005 * BAND_VOL);
check("caves do not Swiss-cheese the world (air=" + airUg + " < 20% of band)", airUg < 0.20 * BAND_VOL);

// ---- 3. y=0 bedrock intact: every (x,0,z) is solid STONE ----
var bedrockOk = true;
for (var x = 0; x < W && bedrockOk; x++)
  for (var z = 0; z < D && bedrockOk; z++)
    if (a.get(x, 0, z) !== C.BLK.STONE) bedrockOk = false;
check("y=0 bedrock intact (all STONE, never carved)", bedrockOk);

// ---- 4. Lava band intact: the carve must not touch rows LAVA_TOP-2..LAVA_TOP ----
// The pre-cave generator puts ~22% lava at the band's top rows; carving there
// would destroy the lakes. Count lava at those rows — it must survive.
var lavaTop = Math.floor(H * 0.22);
var lavaTopRows = 0;
for (var x2 = 0; x2 < W; x2++)
  for (var z2 = 0; z2 < D; z2++)
    for (var y2 = lavaTop - 2; y2 <= lavaTop; y2++)
      if (a.get(x2, y2, z2) === C.BLK.LAVA) lavaTopRows++;
check("lava band intact (lava present at LAVA_TOP rows: " + lavaTopRows + " > 0)", lavaTopRows > 0);

// ---- 5. Surface preserved: the carve must not open the sky column above ground ----
// For a sample of columns, the topmost solid block must still be the surface
// block (grass/sand/snow) — caves live UNDERGROUND, they do not punch craters.
var surfaceOk = true;
for (var x3 = 0; x3 < W && surfaceOk; x3 += 3) {
  for (var z3 = 0; z3 < D && surfaceOk; z3 += 3) {
    var top = -1;
    for (var y3 = H - 1; y3 >= 0; y3--) if (a.get(x3, y3, z3) !== C.BLK.AIR) { top = y3; break; }
    var id = a.get(x3, top, z3);
    if (id !== C.BLK.GRASS && id !== C.BLK.SAND && id !== C.BLK.SNOW &&
        id !== C.BLK.WATER && id !== C.BLK.WOOD && id !== C.BLK.LEAVES) surfaceOk = false;
  }
}
check("surface intact (top block is grass/sand/snow/water, no cave craters)", surfaceOk);

// ---- 6. Carve is seeded, not Math.random: two worlds built in DIFFERENT
//         construction orders (interleaved with other rng consumers) still match ----
var a2 = buildWorld(SEED);
var noise = C.makeNoise(SEED + 5);   // burn some other rng state between builds
noise(1, 2, 0.1); noise(3, 4, 0.1);
var b2 = buildWorld(SEED);
var interleaved = true;
for (var k = 0; k < W * H * D; k++) if (a2.data[k] !== b2.data[k]) { interleaved = false; break; }
check("carve survives interleaved rng consumers (seeded, not global random)", interleaved);

// ---- 7. Caves are connected-ish: at least one pocket spans 2+ vertical cells
//         (a real tunnel, not only isolated single-block holes) ----
var tunnelFound = false;
for (var x4 = 0; x4 < W && !tunnelFound; x4++)
  for (var z4 = 0; z4 < D && !tunnelFound; z4++)
    for (var y4 = 1; y4 < lavaTop - 3; y4++)
      if (a.get(x4, y4, z4) === C.BLK.AIR &&
          a.get(x4, y4 + 1, z4) === C.BLK.AIR) { tunnelFound = true; break; }
check("carved pockets form vertical tunnels (2+ cell tall pockets exist)", tunnelFound);

if (failures > 0) { console.log(failures + " FAILURE(S)"); process.exit(1); }
console.log("ALL PASS");
