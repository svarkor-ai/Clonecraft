// MC 1193.11 — TDD tests for PHASE-5: crafting + item inventory (M3/M4).
// Run: node tests/core-craft.test.js   (exit 0 = all pass)
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

var BLK = C.BLK;

// ---- M4: item-count inventory model (pure Core) ----
// Items are block ids (1..9) with stack counts. AIR (0) is never an item.
check("Core exports Inventory constructor", typeof C.Inventory === "function");
var inv = new C.Inventory();
check("new Inventory starts empty (count of every id is 0)", BLK.AIR === 0 &&
      [1,2,3,4,5,6,7,8,9].every(function (id) { return inv.count(id) === 0; }));
check("add(id, n) returns new count", inv.add(BLK.WOOD, 3) === 3);
check("add accumulates", inv.add(BLK.WOOD, 2) === 5);
check("count of untouched id stays 0", inv.count(BLK.STONE) === 0);
check("add rejects non-positive n (no phantom items)", inv.add(BLK.WOOD, 0) === 5 && inv.add(BLK.WOOD, -1) === 5);
check("add rejects AIR (id 0 is not an item)", inv.add(BLK.AIR, 4) === 0);
check("add rejects unknown ids", inv.add(99, 4) === 0);

check("take(id, n) removes and returns true when affordable", inv.take(BLK.WOOD, 2) === true && inv.count(BLK.WOOD) === 3);
check("take refuses when short (count unchanged)", inv.take(BLK.WOOD, 99) === false && inv.count(BLK.WOOD) === 3);
check("take refuses AIR/unknown", inv.take(BLK.AIR, 1) === false && inv.take(99, 1) === false);

// ---- M3: 2x2 crafting (pure Core) ----
// Recipe: 4 wood in the 2x2 grid -> 1 crafting table (real-MC recipe shape);
// 2 wood stacked vertically -> 4 sticks. Ids 10/11 are ITEMS, not placeable
// blocks — inventory-only.
check("Core exports ITEM ids for crafting table + sticks", C.ITEM && C.ITEM.CRAFTING_TABLE === 10 && C.ITEM.STICK === 11);
check("Core exports RECIPES + craft function", Array.isArray(C.RECIPES) && typeof C.craft === "function");

// Recipe matching: grid is a 2x2 array of item/block ids (0 = empty cell).
// Top the inventory back up to 4 wood (the take-tests above consumed 2).
inv.add(BLK.WOOD, 1);
// 4 wood in a square -> crafting table.
var gTable = [[BLK.WOOD, BLK.WOOD], [BLK.WOOD, BLK.WOOD]];
var r1 = C.craft(gTable, inv);
check("craft 2x2 wood square -> 1 crafting table (returns result id)", r1 === C.ITEM.CRAFTING_TABLE);
check("craft consumed the 4 wood", inv.count(BLK.WOOD) === 0);
check("craft granted the crafting table item", inv.count(C.ITEM.CRAFTING_TABLE) === 1);

// 2 wood stacked vertically -> 4 sticks. (The table craft above consumed all
// wood, so top the inventory back up first.)
inv.add(BLK.WOOD, 2);
var gSticks = [[BLK.WOOD, 0], [BLK.WOOD, 0]];
var r2 = C.craft(gSticks, inv);
check("craft 2 wood column -> 4 sticks", r2 === C.ITEM.STICK && inv.count(C.ITEM.STICK) === 4);

// Shape mismatch must NOT craft (real MC: shape matters).
var gWrong = [[BLK.WOOD, BLK.WOOD], [BLK.WOOD, 0]];
var before = inv.count(BLK.WOOD);
check("incomplete square does not craft", C.craft(gWrong, inv) === 0 && inv.count(BLK.WOOD) === before);

// Empty / wrong-material grids never craft.
check("empty grid does not craft", C.craft([[0,0],[0,0]], inv) === 0);
check("wrong material does not craft", C.craft([[BLK.DIRT,BLK.DIRT],[BLK.DIRT,BLK.DIRT]], inv) === 0);

// Crafting without materials is refused (consumes nothing).
var inv2 = new C.Inventory();
check("craft with empty inventory consumes nothing", C.craft(gTable, inv2) === 0 && inv2.count(BLK.WOOD) === 0);

// Items are inventory-only: placing them is refused by the Runtime seam.
// (Core-side contract: ITEM ids are outside BLK 1..9.)
check("ITEM ids are outside the placeable block range 1..9",
      C.ITEM.CRAFTING_TABLE > 9 && C.ITEM.STICK > 9);

// ---- Save extension (invariant 3): items serialize + v1 defaults empty ----
check("Inventory serializes to a plain array", typeof inv.items === "object" && inv.items !== null);
var inv3 = C.Inventory.fromJSON(inv.items);
check("Inventory.fromJSON roundtrips", inv3.count(C.ITEM.STICK) === 4 && inv3.count(C.ITEM.CRAFTING_TABLE) === 1);
var inv4 = C.Inventory.fromJSON(null);
check("Inventory.fromJSON(null) -> empty (v1 save default)", [1,2,3,4,5,6,7,8,9,10,11].every(function (id) { return inv4.count(id) === 0; }));
var inv5 = C.Inventory.fromJSON({ garbage: true });
check("Inventory.fromJSON(garbage) -> empty, never a crash", inv5.count(BLK.WOOD) === 0);

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
