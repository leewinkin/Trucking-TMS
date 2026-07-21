import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adminAddressViewModel,
  adminFreightSummary,
  adminQuoteCarrierChannelRows,
  adminQuoteFinancialSummary,
  adminQuoteRateBadges,
  adminQuoteRateRows,
  adminRateFinancials,
  adminTariffSummary,
  aggregateAdminFreightRows,
  diagnosticPayloadIsSafe,
  filterAdminQuoteRates,
  redactDiagnosticPayload,
  sortAdminQuoteRates
} from "../public/admin-quote-details.js";

const quote = {
  id: "quote_1",
  status: "quoted",
  carrierModes: ["mothershipSandbox", "speedshipLtl", "priority1Ltl", "fedexFreight"],
  pickup: {
    name: "Isabella",
    address: { street: "222 Mound Ave", city: "Miamisburg", state: "OH", zip: "45342" },
    openTime: "08:00",
    closeTime: "17:00",
    accessorials: ["liftgate"]
  },
  delivery: {
    name: "TPXY",
    address: { street: "520 Jersey Ave", city: "New Brunswick", state: "NJ", zip: "08901" },
    accessorials: ["residential"]
  },
  rates: [
    { id: "xpo", actualCarrierName: "XPO Logistics", providerScac: "XPOL", carrierSource: "speedshipLtl", service: "standard", transitDays: 3, estimatedDeliveryDate: "2026-07-24", carrierCost: 100, sellPrice: 125 },
    { id: "xgs", actualCarrierName: "Xpress Global Systems", providerScac: "XGSI", carrierSource: "priority1Ltl", service: "priority", transitDays: 2, estimatedDeliveryDate: "2026-07-23", carrierCost: 105, sellPrice: 140 },
    { id: "tforce", providerScac: "TFWW", carrierSource: "fedexFreight", service: "economy", transitDays: 4, estimatedDeliveryDate: "2026-07-25", carrierCost: 90, sellPrice: 118 },
    { id: "negative", carrierName: "Forward Air", providerScac: "FWRD", carrierSource: "speedshipLtl", service: "loss", transitDays: 5, carrierCost: 150, sellPrice: 120 },
    { id: "missing_cost", carrierName: "SAIA", providerScac: "SAIA", carrierSource: "mothershipSandbox", service: "standard", transitDays: 6, sellPrice: 160, bookingAllowed: false }
  ],
  carrierAudit: [
    { mode: "speedshipLtl", status: "success", rateCount: 2, carrierQuoteId: "SS-1", carrierMessage: "ok", request: { headers: { authorization: "Bearer abc123" } }, response: { token: "secret-token", rates: [] } },
    { mode: "priority1Ltl", status: "success", rateCount: 1 },
    { mode: "fedexFreight", status: "failed", rateCount: 1, carrierMessage: "partial timeout" },
    { mode: "mothershipSandbox", status: "excluded", excluded: true, rateCount: 0 }
  ]
};

assert.deepEqual(adminRateFinancials({ sellPrice: 125, carrierCost: 100 }), {
  carrierCost: 100,
  customerPrice: 125,
  grossProfit: 25,
  marginPercent: 20,
  hasCarrierCost: true,
  hasCustomerPrice: true
});
assert.equal(adminRateFinancials({ sellPrice: 125 }).hasCarrierCost, false, "sellPrice alone must not become carrier cost");
assert.equal(Number.isFinite(adminRateFinancials({ sellPrice: 125 }).carrierCost), false, "missing carrier cost stays unavailable");
assert.equal(adminRateFinancials({ sellPrice: 120, carrierCost: 150 }).grossProfit, -30, "negative gross profit should be calculated");

const rows = adminQuoteRateRows(quote);
assert.equal(rows.find((row) => row.id === "tforce").carrierName, "TForce Freight", "SCAC-only mapping should resolve carrier name");
assert.deepEqual(adminQuoteRateBadges(rows.find((row) => row.id === "negative"), rows).includes("negativeMargin"), true, "negative margin should be classified");
assert.deepEqual(rows.find((row) => row.id === "tforce").badges.includes("lowestCarrierCost"), true, "lowest carrier cost badge should be calculated");
assert.deepEqual(rows.find((row) => row.id === "tforce").badges.includes("lowestCustomerPrice"), true, "lowest customer price badge should be calculated");
assert.deepEqual(rows.find((row) => row.id === "xgs").badges.includes("fastest"), true, "fastest badge should be calculated");
assert.deepEqual(rows.find((row) => row.id === "xgs").badges.includes("highestMargin"), true, "highest margin badge should be calculated");

assert.deepEqual(
  filterAdminQuoteRates(rows, { search: "xgsi", sourceFilter: "all", bookableOnly: false }).map((row) => row.id),
  ["xgs"],
  "search should match SCAC"
);
assert.deepEqual(
  filterAdminQuoteRates(rows, { search: "priority", sourceFilter: "all", bookableOnly: false }).map((row) => row.id),
  ["xgs"],
  "search should match service and channel text"
);
assert.deepEqual(
  filterAdminQuoteRates(rows, { search: "", sourceFilter: "speedshipLtl", bookableOnly: false }).map((row) => row.id),
  ["xpo", "negative"],
  "channel filtering should use normalized carrier source"
);
assert.equal(filterAdminQuoteRates(rows, { bookableOnly: true }).some((row) => row.id === "missing_cost"), false, "bookable-only filter should remove unavailable rates");

assert.deepEqual(sortAdminQuoteRates(rows, "customerPrice").map((row) => row.id).slice(0, 2), ["tforce", "negative"]);
assert.deepEqual(sortAdminQuoteRates(rows, "carrierCost").map((row) => row.id)[0], "tforce");
assert.deepEqual(sortAdminQuoteRates(rows, "grossProfit").map((row) => row.id)[0], "xgs");
assert.deepEqual(sortAdminQuoteRates(rows, "margin").map((row) => row.id)[0], "xgs");
assert.deepEqual(sortAdminQuoteRates(rows, "transit").map((row) => row.id)[0], "xgs");
assert.deepEqual(sortAdminQuoteRates(rows, "eta").map((row) => row.id)[0], "xgs");
assert.deepEqual(sortAdminQuoteRates(rows, "carrierName").map((row) => row.id)[0], "negative");

assert.deepEqual(adminQuoteFinancialSummary(rows), {
  availableRates: 5,
  lowestCarrierCost: 90,
  lowestCustomerPrice: 118,
  highestGrossProfit: 35
});

const freight = aggregateAdminFreightRows([
  { quantity: 1, type: "pallet", pieces: 2, weight: 100, length: 48, width: 40, height: 48, freightClass: "70", description: "widgets", stackable: true, hazmat: false },
  { quantity: 1, type: "pallet", pieces: 2, weight: 100, length: 48, width: 40, height: 48, freightClass: "70", description: "widgets", stackable: true, hazmat: false },
  { quantity: 1, type: "pallet", pieces: 2, weight: 100, length: 48, width: 40, height: 50, freightClass: "70", description: "widgets", stackable: true, hazmat: false }
]);
assert.equal(freight.length, 2, "identical freight rows aggregate while material differences stay separate");
assert.equal(freight[0].quantity, 2, "matching freight quantities should add up");
assert.equal(adminFreightSummary(freight).totalWeight, 300, "total freight weight should be calculated");

const address = adminAddressViewModel(quote.pickup);
assert.equal(address.cityStateZip, "Miamisburg, OH 45342", "city/state/ZIP should be formatted once");

assert.deepEqual(adminTariffSummary({ ruleType: "fixed", fixedAmount: 50 }), { available: true, labelKey: "Fixed markup", value: 50 });
assert.deepEqual(adminTariffSummary({ ruleType: "percentage", markupPercentage: 10 }), { available: true, labelKey: "Percentage markup", value: 10 });
assert.equal(adminTariffSummary({}).available, false, "legacy missing tariff snapshots should not be fabricated");

const channels = adminQuoteCarrierChannelRows(quote);
assert.equal(channels.find((channel) => channel.mode === "speedshipLtl").status, "success");
assert.equal(channels.find((channel) => channel.mode === "fedexFreight").status, "partial");
assert.equal(channels.find((channel) => channel.mode === "mothershipSandbox").status, "excluded");

const sensitive = {
  headers: { authorization: "Bearer abc123", cookie: "session=private" },
  nested: { apiKey: "key", account_number: "12345", normal: "Bearer visible-token" },
  list: [{ password: "secret" }]
};
const redacted = redactDiagnosticPayload(sensitive);
assert.notEqual(redacted, sensitive, "redaction should not mutate the source object");
assert.equal(sensitive.headers.authorization, "Bearer abc123", "original payload must remain unchanged");
assert.equal(redacted.headers.authorization, "[REDACTED]");
assert.equal(redacted.headers.cookie, "[REDACTED]");
assert.equal(redacted.nested.apiKey, "[REDACTED]");
assert.equal(redacted.nested.account_number, "[REDACTED]");
assert.equal(redacted.nested.normal, "Bearer [REDACTED]");
assert.equal(redacted.list[0].password, "[REDACTED]");
assert.equal(diagnosticPayloadIsSafe(redacted), true, "redacted payload should be safe to display");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const customerQuoteDetailsSlice = app.slice(app.indexOf("function customerQuoteDetailsHtml"), app.indexOf("function quoteDetailsHtml"));
const staffQuoteDetailsSlice = app.slice(app.indexOf("function adminQuoteDetailsHtml"), app.indexOf("function bookingConfirmationHtml"));
const quoteDetailsRouterSlice = app.slice(app.indexOf("function quoteDetailsHtml"), app.indexOf("function bookingConfirmationHtml"));
assert.match(quoteDetailsRouterSlice, /if \(customerView\) {\n\s+return customerQuoteDetailsHtml\(quote\);/, "customer users should continue routing to customer Quote Details");
assert.match(quoteDetailsRouterSlice, /return adminQuoteDetailsHtml\(quote\);/, "staff users should route to Admin Quote Details");
assert.doesNotMatch(customerQuoteDetailsSlice, /Technical Diagnostics|carrierAudit|rawCarrierResponse|Carrier Cost|Gross Profit|providerScac/, "customer Quote Details should not render admin diagnostics");
assert.match(staffQuoteDetailsSlice, /Technical Diagnostics/, "staff Quote Details should include diagnostics section");
assert.match(staffQuoteDetailsSlice, /data-book-rate/, "admin rates should keep existing booking workflow attributes");
assert.match(staffQuoteDetailsSlice, /data-book-quote/, "admin rates should keep quote-aware booking workflow attributes");
assert.doesNotMatch(staffQuoteDetailsSlice, /mothershipReferenceAuditMessage/, "Mothership implementation notes should not render in admin business view");
assert.match(staffQuoteDetailsSlice, /data-admin-quote-rate-list/, "admin rate list should have a stable mount point");
assert.match(app.slice(app.indexOf("function updateAdminQuoteDetailsSearch"), app.indexOf("function updateAdminQuoteDetailsSort")), /updateAdminQuoteRateResults\(quoteId\)/, "admin search should update only the rate results");
assert.doesNotMatch(app.slice(app.indexOf("function updateAdminQuoteDetailsSearch"), app.indexOf("function updateAdminQuoteDetailsSort")), /paintModal|openModal|adminQuoteDetailsHtml/, "admin search must not recreate the modal");
assert.match(staffQuoteDetailsSlice, /<details class="detail-section admin-quote-section admin-diagnostics">/, "technical diagnostics should be collapsed by default");
assert.match(staffQuoteDetailsSlice, /<details class="audit-entry admin-diagnostic-entry">/, "carrier diagnostic entries should be collapsed by default");

console.log("admin quote details tests passed");
