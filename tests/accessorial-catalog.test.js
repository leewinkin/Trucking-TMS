import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  accessorialCatalog,
  accessorialChargeNotice,
  accessorialExplanation,
  accessorialLabel
} from "../public/accessorial-catalog.js";

const requiredKeys = [
  "appointment",
  "liftgate",
  "inside",
  "limitedAccess",
  "residential",
  "scheduledDelivery",
  "crossDock",
  "cfs",
  "hazmat",
  "alcohol",
  "tobacco",
  "tradeshow"
];

assert.deepEqual(
  new Set(accessorialCatalog.map((item) => item.key)),
  new Set(requiredKeys),
  "catalog should cover every quote-form accessorial"
);

for (const item of accessorialCatalog) {
  assert.ok(item.label.en, `${item.key} should have an English label`);
  assert.ok(item.label.zh, `${item.key} should have a Chinese label`);
  assert.ok(item.explanation.en, `${item.key} should have an English explanation`);
  assert.ok(item.explanation.zh, `${item.key} should have a Chinese explanation`);
  assert.ok(Array.isArray(item.appliesTo) && item.appliesTo.length > 0, `${item.key} should define applicability`);
}

assert.equal(
  accessorialExplanation("appointment", "pickup", "en"),
  "The carrier must contact the pickup location to arrange an appointment before arrival."
);
assert.equal(
  accessorialExplanation("appointment", "pickup", "zh"),
  "承运商需要在到达提货地点前联系发货方，安排提货预约。"
);
assert.equal(
  accessorialExplanation("appointment", "delivery", "en"),
  "The carrier must contact the consignee to arrange a delivery appointment before arrival."
);
assert.equal(
  accessorialExplanation("appointment", "delivery", "zh"),
  "承运商需要在派送前联系收货人，安排送货预约。"
);
assert.equal(accessorialLabel("liftgate", "en"), "Liftgate");
assert.equal(accessorialLabel("liftgate", "zh"), "升降尾板");
assert.equal(
  accessorialChargeNotice.en,
  "Accessorial services may result in additional charges. Final charges are subject to the carrier invoice."
);
assert.equal(accessorialChargeNotice.zh, "附加服务可能产生额外费用，最终费用以承运商账单为准。");

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
for (const key of requiredKeys.filter((key) => key !== "scheduledDelivery")) {
  assert.match(html, new RegExp(`name="pickupAccessorials" value="${key}"`), `pickup value ${key} should be stable`);
}
for (const key of requiredKeys.filter((key) => !["crossDock", "cfs"].includes(key))) {
  assert.match(html, new RegExp(`name="deliveryAccessorials" value="${key}"`), `delivery value ${key} should be stable`);
}

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
assert.match(app, /data-accessorial-help-toggle/, "help controls should be clickable/tappable");
assert.match(app, /aria-expanded/, "help controls should expose expanded state");
assert.match(app, /aria-describedby/, "help controls should link to help text");
assert.match(styles, /focus-within/, "help text should be keyboard accessible through focus");

console.log("accessorial catalog tests passed");
