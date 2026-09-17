// MC 1193.26 — TDD tests for food + eating (M5, seam S8), pure Core.
// Run: node tests/core-food.test.js   (exit 0 = all pass)
// Extracts the Core section from index.html so the tests run against the
// SHIPPED source, not a copy (same harness pattern as tests/core-fall.test.js).
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

// ---- M5: food item model ----
// ITEM.FOOD (12 = apple) is an inventory-only item id, outside the placeable
// BLK range (1..9), so placeBlock can refuse it exactly like 10/11.
check("ITEM.FOOD === 12 (apple, inventory-only id)", C.ITEM.FOOD === 12);
check("FOOD restore constant: 0 < C.FOOD_RESTORE <= 20", typeof C.FOOD_RESTORE === "number" && C.FOOD_RESTORE > 0 && C.FOOD_RESTORE <= 20);

// The inventory must accept the food id (add/take roundtrip)...
var inv = new C.Inventory();
inv.add(C.ITEM.FOOD, 2);
check("Inventory.add accepts ITEM.FOOD (count 2 after add)", inv.count(C.ITEM.FOOD) === 2);
check("Inventory.take removes ITEM.FOOD", inv.take(C.ITEM.FOOD, 1) === true && inv.count(C.ITEM.FOOD) === 1);
// ...and serialize it (save extension must ride the existing items field).
var ser = inv.toJSON();
check("Inventory.toJSON serializes ITEM.FOOD", ser[C.ITEM.FOOD] === 1);
check("Inventory.fromJSON roundtrips ITEM.FOOD", C.Inventory.fromJSON(ser).count(C.ITEM.FOOD) === 1);

// ---- M5: eating raises hunger ----
// Player.eat(inv) consumes one food item from `inv` and raises hunger by
// FOOD_RESTORE, clamped to the 0..20 scale. Returns the new hunger, or null
// when there is no food to eat (no phantom restore).
function fedPlayer() {
  var w = new C.World(8, 8, 8, 42);
  var p = new C.Player(w, 4.5, 5, 4.5);
  var i2 = new C.Inventory();
  i2.add(C.ITEM.FOOD, 3);
  return { p: p, inv: i2 };
}

var f1 = fedPlayer();
f1.p.hunger = 5;   // 5 + FOOD_RESTORE(13) = 18 — below the 20 clamp, so the raw
                   // add is observable; from 10 the clamp would mask the delta.
var h1 = f1.p.eat(f1.inv);
check("eat raises hunger by FOOD_RESTORE (5 -> " + h1 + ")", h1 === 5 + C.FOOD_RESTORE);
check("eat consumes exactly one food item", f1.inv.count(C.ITEM.FOOD) === 2);

// Clamp: hunger never exceeds 20.
var f2 = fedPlayer();
f2.p.hunger = 19;
var h2 = f2.p.eat(f2.inv);
check("eat clamps hunger at 20 (19 -> " + h2 + ")", h2 === 20);

// No food -> nothing happens (no phantom restore, no crash).
var f3 = fedPlayer();
f3.p.hunger = 8;
f3.inv.take(C.ITEM.FOOD, 3);
var h3 = f3.p.eat(f3.inv);
check("eat with empty inventory returns null and leaves hunger unchanged", h3 === null && f3.p.hunger === 8);

// Non-food items are not edible.
var f4 = fedPlayer();
f4.inv.take(C.ITEM.FOOD, 3);
f4.inv.add(C.BLK.WOOD, 5);
f4.p.hunger = 8;
var h4 = f4.p.eat(f4.inv);
check("eat with only non-food items returns null, hunger unchanged", h4 === null && f4.p.hunger === 8);

// ---- M5: hunger still gates regen (the well-fed rule is untouched) ----
// Regen only while hunger >= 18; eating is what makes that reachable again.
var wR = new C.World(8, 8, 8, 42);
var pR = new C.Player(wR, 4.5, 5, 4.5);
pR.health = 10; pR.hunger = 17;
for (var t = 0; t < 60; t++) pR.step(0.1);
check("hunger 17 (< 18): no regen after 6s (health still " + pR.health + ")", pR.health === 10);

var wR2 = new C.World(8, 8, 8, 42);
var pR2 = new C.Player(wR2, 4.5, 5, 4.5);
pR2.health = 10; pR2.hunger = 18;
for (var t2 = 0; t2 < 60; t2++) pR2.step(0.1);
check("hunger 18 (>= 18): regen runs (health > 10, got " + pR2.health.toFixed(2) + ")", pR2.health > 10);

// Full loop: drain hunger low, eat, hunger is back above the regen threshold.
var f5 = fedPlayer();
f5.p.hunger = 5;
f5.p.eat(f5.inv);
check("eat from hunger 5 lands above the regen threshold 18 (got " + f5.p.hunger + ")", f5.p.hunger >= 18);

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
