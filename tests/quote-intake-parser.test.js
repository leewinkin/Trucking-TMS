import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuoteIntakeText } from "../public/quote-intake-parser.js";

const sample = `
提货：
5700 E Airport Drive Suite A, Dock 1-5
Ontario, CA 91761

送到美客多仓库：
1106 S Foster Rd Building 3
China Grove, TX 78263
仓库代码 USTX01

1托，23件，1000磅，48x40x72寸
玩具，不可堆叠
不需要尾板，不需要室内服务
需要POD回单，到时仓库打托，不接受线下司机
`;

const parsed = parseQuoteIntakeText(sample);

assert.equal(parsed.confidence, "high");
assert.equal(parsed.fields.pickup.street, "5700 E Airport Drive Suite A, Dock 1-5");
assert.equal(parsed.fields.pickup.city, "Ontario");
assert.equal(parsed.fields.pickup.state, "CA");
assert.equal(parsed.fields.pickup.zip, "91761");
assert.equal(parsed.fields.pickup.facilityCode, undefined);
assert.equal(parsed.fields.delivery.name, "美客多仓库");
assert.equal(parsed.fields.delivery.street, "1106 S Foster Rd Building 3");
assert.equal(parsed.fields.delivery.city, "China Grove");
assert.equal(parsed.fields.delivery.state, "TX");
assert.equal(parsed.fields.delivery.zip, "78263");
assert.equal(parsed.fields.delivery.facilityCode, "USTX01");
assert.equal(parsed.fields.freight.quantity, 1);
assert.equal(parsed.fields.freight.type, "pallet");
assert.equal(parsed.fields.freight.pieces, 23);
assert.equal(parsed.fields.freight.weight, 1000);
assert.equal(parsed.fields.freight.weightUnit, "lb");
assert.equal(parsed.fields.freight.length, 48);
assert.equal(parsed.fields.freight.width, 40);
assert.equal(parsed.fields.freight.height, 72);
assert.equal(parsed.fields.freight.dimensionUnit, "in");
assert.equal(parsed.fields.freight.description, "玩具");
assert.equal(parsed.fields.freight.stackable, false);
assert.equal(parsed.fields.accessorials.liftgate, false);
assert.equal(parsed.fields.accessorials.inside, false);
assert.match(parsed.unmatchedText, /需要POD回单/);
assert.match(parsed.unmatchedText, /到时仓库打托/);
assert.match(parsed.unmatchedText, /不接受线下司机/);

const english = parseQuoteIntakeText(`
Pickup:
5700 E Airport Drive Suite A
Ontario, CA 91761
Delivery ABC Warehouse:
1106 S Foster Rd
China Grove, TX 78263
1 pallet, 23 pieces, 1000 lb, 48x40x72 in
Toys, not stackable, no liftgate, no inside
`);

const chinese = parseQuoteIntakeText(`
提货:
5700 E Airport Drive Suite A
Ontario, CA 91761
送到ABC Warehouse:
1106 S Foster Rd
China Grove, TX 78263
1托盘,23件,1000磅,48x40x72寸
玩具,不可堆叠,不需要尾板,不需要室内服务
`);

assert.equal(english.fields.freight.type, chinese.fields.freight.type);
assert.equal(english.fields.freight.quantity, chinese.fields.freight.quantity);
assert.equal(english.fields.freight.pieces, chinese.fields.freight.pieces);
assert.equal(english.fields.freight.weight, chinese.fields.freight.weight);
assert.equal(english.fields.freight.length, chinese.fields.freight.length);
assert.equal(english.fields.freight.width, chinese.fields.freight.width);
assert.equal(english.fields.freight.height, chinese.fields.freight.height);
assert.equal(english.fields.freight.stackable, chinese.fields.freight.stackable);
assert.equal(english.fields.accessorials.liftgate, chinese.fields.accessorials.liftgate);
assert.equal(english.fields.accessorials.inside, chinese.fields.accessorials.inside);

const box = parseQuoteIntakeText("2 boxes, 10 pcs, 500 lbs, 30x20x20 in, Class 85, NMFC 12345");
assert.equal(box.fields.freight.type, "box");
assert.equal(box.fields.freight.freightClass, "85");
assert.equal(box.fields.freight.nmfc, "12345");

const crate = parseQuoteIntakeText("3木箱, 9件, 800公斤, 120x100x90厘米, 危险品");
assert.equal(crate.fields.freight.type, "crate");
assert.equal(crate.fields.freight.weightUnit, "kg");
assert.equal(crate.fields.freight.dimensionUnit, "cm");
assert.equal(crate.fields.freight.hazmat, true);

const noHazmat = parseQuoteIntakeText("1 pallet, 1 piece, 100 lb, 40x40x40 in, no hazmat");
assert.equal(noHazmat.fields.freight.hazmat, false);

const parserSource = readFileSync(new URL("../public/quote-intake-parser.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.doesNotMatch(parserSource, /\bfetch\s*\(/, "quote intake parser must not call external APIs");
assert.doesNotMatch(parserSource, /XMLHttpRequest|navigator\.sendBeacon/, "quote intake parser must remain local-only");
assert.match(htmlSource, /id="quoteIntakeText"/, "New Quote should expose a large paste box");
assert.match(htmlSource, /data-quote-intake-parse/, "New Quote should expose an explicit Parse action");
assert.match(appSource, /data-quote-intake-apply/, "parsed values should require an explicit Apply action");
assert.match(appSource, /window\.confirm\(t\("Applying this import will replace \{count\} non-empty field\(s\)\. Continue\?"/, "non-empty field overwrites should require confirmation");
assert.match(appSource, /dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/, "Apply should use existing form input events");
assert.match(appSource, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/, "Apply should use existing form change events");

console.log("quote intake parser tests passed");
