import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQuoteIntakeApplicationPlan, parseQuoteIntakeText } from "../public/quote-intake-parser.js";
import { parseQuoteQuestionnaireText } from "../public/quote-questionnaire-parser.js";

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
assert.match(parsed.unmatchedText, /仓库代码 USTX01/);
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

const residual = parseQuoteIntakeText("1 pallet, 1000 lb, need POD");
assert.equal(residual.fields.freight.quantity, 1);
assert.equal(residual.fields.freight.weight, 1000);
assert.match(residual.unmatchedText, /^need POD$/);

const cleanDescription = parseQuoteIntakeText("Toys, not stackable, no liftgate, no inside");
assert.equal(cleanDescription.fields.freight.description, "Toys");
assert.equal(cleanDescription.fields.freight.stackable, false);
assert.equal(cleanDescription.fields.accessorials.liftgate, false);
assert.equal(cleanDescription.fields.accessorials.inside, false);

const mixedLbCm = parseQuoteIntakeText("1 pallet, 100 lb, 120x100x90 cm");
const mixedLbCmImperialPlan = buildQuoteIntakeApplicationPlan(mixedLbCm, { formUnits: "imperial" });
assert.equal(mixedLbCmImperialPlan.targets.find((item) => item.target === "freight.weight").value, "100");
assert.equal(mixedLbCmImperialPlan.targets.find((item) => item.target === "freight.length").value, "47.24");
assert.equal(mixedLbCmImperialPlan.targets.find((item) => item.target === "freight.width").value, "39.37");
assert.equal(mixedLbCmImperialPlan.targets.find((item) => item.target === "freight.height").value, "35.43");
const mixedLbCmMetricPlan = buildQuoteIntakeApplicationPlan(mixedLbCm, { formUnits: "metric" });
assert.equal(mixedLbCmMetricPlan.targets.find((item) => item.target === "freight.weight").value, "45.36");
assert.equal(mixedLbCmMetricPlan.targets.find((item) => item.target === "freight.length").value, "120");

const mixedKgIn = parseQuoteIntakeText("1 pallet, 100 kg, 48x40x72 in");
const mixedKgInImperialPlan = buildQuoteIntakeApplicationPlan(mixedKgIn, { formUnits: "imperial" });
assert.equal(mixedKgInImperialPlan.targets.find((item) => item.target === "freight.weight").value, "220.46");
assert.equal(mixedKgInImperialPlan.targets.find((item) => item.target === "freight.length").value, "48");
const mixedKgInMetricPlan = buildQuoteIntakeApplicationPlan(mixedKgIn, { formUnits: "metric" });
assert.equal(mixedKgInMetricPlan.targets.find((item) => item.target === "freight.weight").value, "100");
assert.equal(mixedKgInMetricPlan.targets.find((item) => item.target === "freight.length").value, "121.92");

const parsedHours = parseQuoteIntakeText(`
Pickup:
5700 E Airport Drive
Ontario, CA 91761
Hours 08:30-17:30
`);
const timePlan = buildQuoteIntakeApplicationPlan(parsedHours, {
  availableTimeValues: ["0800", "0900", "1700", "1800"]
});
const pickupOpenTarget = timePlan.targets.find((item) => item.target === "pickupOpen");
const pickupCloseTarget = timePlan.targets.find((item) => item.target === "pickupClose");
assert.equal(pickupOpenTarget.value, "0830");
assert.equal(pickupOpenTarget.addOption, true);
assert.equal(pickupCloseTarget.value, "1730");
assert.equal(pickupCloseTarget.addOption, true);

const reviewOnlyPlan = buildQuoteIntakeApplicationPlan(parsed);
assert.equal(reviewOnlyPlan.unsupported.some((item) => item.path === "delivery.facilityCode"), true);
assert.equal(reviewOnlyPlan.targets.some((item) => item.path === "delivery.facilityCode"), false);

const scopedAccessorials = parseQuoteIntakeText("Pickup liftgate required. Delivery no liftgate.");
assert.equal(scopedAccessorials.fields.accessorials.pickup.liftgate, true);
assert.equal(scopedAccessorials.fields.accessorials.delivery.liftgate, false);
const scopedPlan = buildQuoteIntakeApplicationPlan(scopedAccessorials);
assert.equal(scopedPlan.targets.find((item) => item.target === "pickupAccessorials.liftgate").value, true);
assert.equal(scopedPlan.targets.find((item) => item.target === "deliveryAccessorials.liftgate").value, false);

const genericAccessorials = parseQuoteIntakeText("No liftgate");
const genericPlan = buildQuoteIntakeApplicationPlan(genericAccessorials);
assert.equal(genericPlan.targets.some((item) => item.target === "pickupAccessorials.liftgate"), true);
assert.equal(genericPlan.targets.some((item) => item.target === "deliveryAccessorials.liftgate"), true);

const chineseScopedComma = parseQuoteIntakeText("提货需要尾板，送货不需要尾板");
assert.equal(chineseScopedComma.fields.pickup.name, undefined);
assert.equal(chineseScopedComma.fields.delivery.name, undefined);
assert.equal(chineseScopedComma.fields.accessorials.pickup.liftgate, true);
assert.equal(chineseScopedComma.fields.accessorials.delivery.liftgate, false);

const serviceLineBeforeAddress = parseQuoteIntakeText(`
提货需要尾板，送货不需要尾板
123 Delivery St
Dallas, TX 75001
`);
assert.equal(serviceLineBeforeAddress.fields.pickup.street, undefined);
assert.equal(serviceLineBeforeAddress.fields.pickup.city, undefined);
assert.equal(serviceLineBeforeAddress.fields.delivery.street, undefined);
assert.equal(serviceLineBeforeAddress.fields.delivery.city, undefined);
assert.equal(serviceLineBeforeAddress.fields.accessorials.pickup.liftgate, true);
assert.equal(serviceLineBeforeAddress.fields.accessorials.delivery.liftgate, false);

const structuredQuestionnaire = `
提货地址：8449 Milliken Avenue, Unit 102, 30dock Rancho Cucamonga,CA 91730
发货地址类型：商业仓
是否需要带尾板：是

货物中文名称/英文名称：电动手推车
是否是危险品：否
危险品的UN编号：
危险类别：
托数：1
托的长宽高（CM/in）：175*75*75CM
单托重量（KG/lb）：247kg

收货地址：
PGT TRANSPORT, INC.
10125 NW 116TH WAY STE 1
MIAMI, FL 33178-1164
United States

收货地址类型：办公
是否需要带尾板：是
是否预约派送：是
麻烦帮忙测算一下费用，谢谢
`;
const questionnaire = parseQuoteQuestionnaireText(structuredQuestionnaire);
assert.equal(questionnaire.pickup.street, "8449 Milliken Avenue, Unit 102, 30dock");
assert.equal(questionnaire.pickup.city, "Rancho Cucamonga");
assert.equal(questionnaire.pickup.state, "CA");
assert.equal(questionnaire.pickup.zip, "91730");
assert.equal(questionnaire.pickup.addressType, "commercial");
assert.equal(questionnaire.accessorials.pickup.residential, false);
assert.equal(questionnaire.delivery.name, "PGT TRANSPORT, INC.");
assert.equal(questionnaire.delivery.street, "10125 NW 116TH WAY STE 1");
assert.equal(questionnaire.delivery.city, "MIAMI");
assert.equal(questionnaire.delivery.state, "FL");
assert.equal(questionnaire.delivery.zip, "33178-1164");
assert.equal(questionnaire.delivery.addressType, "office");
assert.equal(questionnaire.accessorials.delivery.residential, false);
assert.equal(questionnaire.freight.quantity, 1);
assert.equal(questionnaire.freight.type, "pallet");
assert.equal(questionnaire.freight.description, "电动手推车");
assert.equal(questionnaire.freight.weight, 247);
assert.equal(questionnaire.freight.weightUnit, "kg");
assert.equal(questionnaire.freight.length, 175);
assert.equal(questionnaire.freight.width, 75);
assert.equal(questionnaire.freight.height, 75);
assert.equal(questionnaire.freight.dimensionUnit, "cm");
assert.equal(questionnaire.freight.hazmat, false);
assert.equal(questionnaire.freight.unNumber, undefined);
assert.equal(questionnaire.freight.hazardClass, undefined);
assert.equal(questionnaire.accessorials.pickup.liftgate, true);
assert.equal(questionnaire.accessorials.delivery.liftgate, true);
assert.equal(questionnaire.accessorials.delivery.appointment, true);
assert.deepEqual(questionnaire.notes, ["麻烦帮忙测算一下费用,谢谢"]);

const structured = parseQuoteIntakeText(structuredQuestionnaire);
assert.equal(structured.fields.pickup.city, "Rancho Cucamonga");
assert.equal(structured.fields.pickup.state, "CA");
assert.equal(structured.fields.pickup.zip, "91730");
assert.equal(structured.fields.pickup.addressType, "commercial");
assert.equal(structured.fields.pickup.name, undefined);
assert.equal(structured.fields.accessorials.pickup.residential, false);
assert.equal(structured.fields.delivery.name, "PGT TRANSPORT, INC.");
assert.equal(structured.fields.delivery.city, "MIAMI");
assert.equal(structured.fields.delivery.state, "FL");
assert.equal(structured.fields.delivery.zip, "33178-1164");
assert.equal(structured.fields.delivery.addressType, "office");
assert.equal(structured.fields.delivery.name === "办公", false);
assert.equal(structured.fields.accessorials.delivery.residential, false);
assert.equal(structured.fields.freight.quantity, 1);
assert.equal(structured.fields.freight.type, "pallet");
assert.equal(structured.fields.freight.description, "电动手推车");
assert.equal(structured.fields.freight.weight, 247);
assert.equal(structured.fields.freight.weightUnit, "kg");
assert.equal(structured.fields.freight.length, 175);
assert.equal(structured.fields.freight.width, 75);
assert.equal(structured.fields.freight.height, 75);
assert.equal(structured.fields.freight.dimensionUnit, "cm");
assert.equal(structured.fields.freight.hazmat, false);
assert.equal(structured.fields.freight.unNumber, undefined);
assert.equal(structured.fields.freight.hazardClass, undefined);
assert.equal(structured.fields.accessorials.pickup.liftgate, true);
assert.equal(structured.fields.accessorials.delivery.liftgate, true);
assert.equal(structured.fields.accessorials.delivery.appointment, true);
assert.notEqual(structured.fields.freight.description, "商业仓");
assert.notEqual(structured.fields.freight.description, "办公");
assert.match(structured.unmatchedText, /麻烦帮忙测算一下费用, 谢谢/);
assert.doesNotMatch(structured.unmatchedText, /商业仓/);
assert.doesNotMatch(structured.unmatchedText, /办公/);
assert.doesNotMatch(structured.unmatchedText, /United States/);
const structuredPlan = buildQuoteIntakeApplicationPlan(structured, { formUnits: "imperial" });
assert.equal(structuredPlan.formUnits, "metric");
assert.equal(structuredPlan.changeFormUnits, true);
assert.equal(structuredPlan.unsupported.some((item) => item.path === "pickup.addressType"), true);
assert.equal(structuredPlan.unsupported.some((item) => item.path === "delivery.addressType"), true);
assert.equal(structuredPlan.targets.find((item) => item.target === "pickupAccessorials.residential").value, false);
assert.equal(structuredPlan.targets.find((item) => item.target === "deliveryAccessorials.residential").value, false);
assert.equal(structuredPlan.targets.find((item) => item.target === "freight.weight").value, "247");
assert.equal(structuredPlan.targets.find((item) => item.target === "freight.length").value, "175");
assert.equal(structuredPlan.targets.find((item) => item.target === "freight.width").value, "75");
assert.equal(structuredPlan.targets.find((item) => item.target === "freight.height").value, "75");

const hazmatQuestionnaire = parseQuoteIntakeText(`
是否是危险品：是
危险品的UN编号：UN3481
危险类别：9
`);
assert.equal(hazmatQuestionnaire.fields.freight.hazmat, true);
assert.equal(hazmatQuestionnaire.fields.freight.unNumber, "UN3481");
assert.equal(hazmatQuestionnaire.fields.freight.hazardClass, "9");
const hazmatPlan = buildQuoteIntakeApplicationPlan(hazmatQuestionnaire);
assert.equal(hazmatPlan.targets.some((item) => item.path === "freight.hazmat"), true);
assert.equal(hazmatPlan.unsupported.some((item) => item.path === "freight.unNumber" && item.value === "UN3481"), true);
assert.equal(hazmatPlan.unsupported.some((item) => item.path === "freight.hazardClass" && item.value === "9"), true);

const englishScopedComma = parseQuoteIntakeText("Pickup requires liftgate, delivery does not need liftgate");
assert.equal(englishScopedComma.fields.pickup.name, undefined);
assert.equal(englishScopedComma.fields.delivery.name, undefined);
assert.equal(englishScopedComma.fields.accessorials.pickup.liftgate, true);
assert.equal(englishScopedComma.fields.accessorials.delivery.liftgate, false);

const conflictPlan = buildQuoteIntakeApplicationPlan(parseQuoteIntakeText("1 pallet, 100 lb, no liftgate"), {
  currentValues: {
    "freight.weight": "90",
    "pickupAccessorials.liftgate": true,
    "deliveryAccessorials.liftgate": false
  }
});
assert.equal(conflictPlan.conflictCount, 2);

const parserSource = readFileSync(new URL("../public/quote-intake-parser.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.doesNotMatch(parserSource, /\bfetch\s*\(/, "quote intake parser must not call external APIs");
assert.doesNotMatch(parserSource, /XMLHttpRequest|navigator\.sendBeacon/, "quote intake parser must remain local-only");
assert.match(htmlSource, /id="quoteIntakeText"/, "New Quote should expose a large paste box");
assert.match(appSource, /"accessorials\.pickup\.liftgate": "Pickup liftgate"/, "scoped pickup accessorial preview labels should exist");
assert.match(appSource, /"accessorials\.delivery\.liftgate": "Delivery liftgate"/, "scoped delivery accessorial preview labels should exist");
assert.match(appSource, /"pickup\.addressType": "Pickup address type"/, "pickup address type preview label should exist");
assert.match(appSource, /"delivery\.addressType": "Delivery address type"/, "delivery address type preview label should exist");
assert.match(appSource, /"freight\.unNumber": "Hazmat UN number"/, "hazmat UN number preview label should exist");
assert.match(appSource, /"freight\.hazardClass": "Hazard class"/, "hazard class preview label should exist");
assert.match(appSource, /"Pickup address type": "提货地址类型"/, "pickup address type translation should exist");
assert.match(appSource, /"Delivery address type": "派送地址类型"/, "delivery address type translation should exist");
assert.match(appSource, /"Hazmat UN number": "危险品 UN 编号"/, "hazmat UN number translation should exist");
assert.match(appSource, /"Hazard class": "危险类别"/, "hazard class translation should exist");
assert.match(appSource, /"Pickup liftgate": "提货尾板"/, "scoped pickup accessorial Chinese translation should exist");
assert.match(appSource, /"Delivery liftgate": "派送尾板"/, "scoped delivery accessorial Chinese translation should exist");
assert.match(htmlSource, /data-quote-intake-parse/, "New Quote should expose an explicit Parse action");
assert.match(appSource, /data-quote-intake-apply/, "parsed values should require an explicit Apply action");
assert.match(appSource, /window\.confirm\(t\("Applying this import will replace \{count\} non-empty field\(s\)\. Continue\?"/, "non-empty field overwrites should require confirmation");
assert.match(appSource, /ensureQuoteIntakeSelectOption\(controlTarget\.control, target\.value\)/, "exact parsed HHMM times should be added before selection when needed");
assert.match(appSource, /dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/, "Apply should use existing form input events");
assert.match(appSource, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/, "Apply should use existing form change events");

console.log("quote intake parser tests passed");
