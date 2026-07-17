import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyActualCarrierNames,
  applyCarrierExclusions,
  customerRateAvailability,
  knownCarrierCodeMappings,
  normalizePackagingType,
  packagingTypeForProvider,
  providerPackagingMappings,
  resolveActualCarrierName,
  sanitizeRateForCustomerDisplay
} from "../server/quote-reliability.js";

assert.equal(normalizePackagingType("pallet"), "pallet");
assert.equal(normalizePackagingType("Pallet"), "pallet");
assert.equal(normalizePackagingType("托盘"), "pallet");
assert.equal(normalizePackagingType("Box"), "box");
assert.equal(normalizePackagingType("纸箱"), "box");
assert.equal(normalizePackagingType("Crate"), "crate");
assert.equal(normalizePackagingType("木箱"), "crate");
assert.throws(() => normalizePackagingType("barrel"), /Unsupported packaging type/);

assert.equal(packagingTypeForProvider("托盘", "mothership"), "Pallet");
assert.equal(packagingTypeForProvider("托盘", "speedship"), "PLT");
assert.equal(packagingTypeForProvider("纸箱", "priority1"), "Box");
assert.equal(packagingTypeForProvider("木箱", "fedexFreight"), "CRATE");
assert.notEqual(providerPackagingMappings.mothership.pallet, providerPackagingMappings.speedship.pallet);
assert.notEqual(providerPackagingMappings.speedship.pallet, providerPackagingMappings.fedexFreight.pallet);

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
assert.match(html, /<option value="pallet" data-i18n="Pallet">Pallet<\/option>/);
assert.match(html, /<option value="box" data-i18n="Box">Box<\/option>/);
assert.match(html, /<option value="crate" data-i18n="Crate">Crate<\/option>/);

const englishPayload = { freight: [{ type: "Pallet" }, { type: "Box" }, { type: "Crate" }] };
const chinesePayload = { freight: [{ type: "托盘" }, { type: "纸箱" }, { type: "木箱" }] };
assert.deepEqual(
  englishPayload.freight.map((item) => normalizePackagingType(item.type)),
  chinesePayload.freight.map((item) => normalizePackagingType(item.type)),
  "English and Chinese UI labels should canonicalize to the same freight payload"
);
assert.deepEqual(
  englishPayload.freight.map((item) => packagingTypeForProvider(item.type, "speedship")),
  chinesePayload.freight.map((item) => packagingTypeForProvider(item.type, "speedship")),
  "English and Chinese UI labels should create equivalent outbound SpeedShip requests"
);
assert.deepEqual(
  englishPayload.freight.map((item) => packagingTypeForProvider(item.type, "fedexFreight")),
  chinesePayload.freight.map((item) => packagingTypeForProvider(item.type, "fedexFreight")),
  "English and Chinese UI labels should create equivalent outbound FedEx requests"
);

assert.equal(resolveActualCarrierName({ carrierName: "TForce Freight" }), "TForce Freight");
assert.equal(resolveActualCarrierName({ carrierName: "Forward Air" }), "Forward Air");
assert.equal(resolveActualCarrierName({ carrierName: "Xpress Global Systems" }), "Xpress Global Systems");
assert.equal(resolveActualCarrierName({ providerScac: "ODFL" }), "Old Dominion");
assert.equal(resolveActualCarrierName({ providerScac: "ABFS" }), "ABF Freight");
assert.equal(resolveActualCarrierName({ providerScac: "CNWY" }), "XPO Logistics");
assert.equal(resolveActualCarrierName({ providerScac: "XPOL" }), "XPO Logistics");
assert.equal(resolveActualCarrierName({ providerScac: "XGSI" }), "Xpress Global Systems");
assert.equal(resolveActualCarrierName({ providerScac: "SAIA" }), "SAIA");
assert.equal(resolveActualCarrierName({}), "Contracted Carrier");
assert.equal(resolveActualCarrierName({ provider: "mothership" }, { sourcePlatform: "mothershipSandbox" }), "Self-owned Truck");
assert.equal(resolveActualCarrierName({ carrierName: "Mothership" }, { sourcePlatform: "mothershipSandbox" }), "Self-owned Truck");
assert.equal(knownCarrierCodeMappings.TFWW, "TForce Freight");
assert.equal(knownCarrierCodeMappings.FWDN, "Forward Air");
assert.equal(knownCarrierCodeMappings.XPOL, "XPO Logistics");
assert.equal(knownCarrierCodeMappings.XGSI, "Xpress Global Systems");

const internalRate = applyActualCarrierNames(
  [
    {
      id: "rate_1",
      provider: "speedship",
      providerScac: "TFWW",
      carrierCost: 100,
      sellPrice: 125
    }
  ],
  "speedshipLtl"
)[0];
assert.equal(internalRate.actualCarrierName, "TForce Freight");
assert.equal(internalRate.sourcePlatform, "speedshipLtl");
assert.equal(internalRate.provider, "speedship");
assert.equal(internalRate.carrierCost, 100, "carrier cost should be unchanged");
assert.equal(internalRate.sellPrice, 125, "sell price should be unchanged");

const customerRate = sanitizeRateForCustomerDisplay(internalRate, { sourcePlatform: "speedshipLtl" });
assert.equal(customerRate.carrierName, "TForce Freight");
assert.equal(customerRate.sellPrice, 125);
assert.equal(Object.prototype.hasOwnProperty.call(customerRate, "provider"), false);
assert.equal(Object.prototype.hasOwnProperty.call(customerRate, "providerScac"), false);
assert.equal(Object.prototype.hasOwnProperty.call(customerRate, "carrierCost"), false);

assert.deepEqual(
  customerRateAvailability(
    [
      { mode: "speedshipLtl", rates: [{ id: "rate_1" }], carrierMessage: "" },
      { mode: "mothershipSandbox", rates: [], carrierMessage: "Mothership failed" }
    ],
    [{ id: "rate_1" }]
  ),
  { status: "partial", messageCode: "PARTIAL_RATES_UNAVAILABLE" }
);
assert.deepEqual(customerRateAvailability([{ mode: "speedshipLtl", rates: [] }], []), {
  status: "none",
  messageCode: "NO_RATES_AVAILABLE"
});
assert.deepEqual(customerRateAvailability([{ mode: "speedshipLtl", rates: [{ id: "rate_1" }] }], [{ id: "rate_1" }]), {
  status: "complete",
  messageCode: null
});

const exclusionRates = [
  { id: "rate_tf", providerScac: "TFWW", actualCarrierName: "TForce Freight", carrierCost: 100, sellPrice: 125 },
  { id: "rate_xpo", providerScac: "XPOL", actualCarrierName: "XPO Logistics", carrierCost: 90, sellPrice: 115 },
  { id: "rate_saia", actualCarrierName: "SAIA", carrierCost: 80, sellPrice: 105 }
];
const scacBlocked = applyCarrierExclusions(exclusionRates, [
  { carrierKey: "XPOL", carrierName: "XPO Logistics", preference: "blocked", status: "active", reason: "Customer preference" }
]);
assert.deepEqual(scacBlocked.blockedRates.map((item) => item.rate.id), ["rate_xpo"], "blocking by SCAC should remove the matching carrier");
assert.deepEqual(scacBlocked.allowedRates.map((rate) => rate.id), ["rate_tf", "rate_saia"], "allowed rate order should be unchanged");
assert.equal(scacBlocked.allowedRates[0].sellPrice, 125, "allowed rate pricing should be unchanged");

const nameBlocked = applyCarrierExclusions(exclusionRates, [
  { carrierKey: "saia", carrierName: "SAIA", preference: "blocked", status: "active" }
]);
assert.deepEqual(nameBlocked.blockedRates.map((item) => item.rate.id), ["rate_saia"], "fallback blocking by normalized name should work");
assert.equal(nameBlocked.allowedRates.length, 2);

console.log("quote reliability tests passed");
