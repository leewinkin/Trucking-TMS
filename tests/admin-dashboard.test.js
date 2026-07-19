import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adminAttentionItems,
  adminCarrierChannels,
  adminCustomerOverview,
  adminDashboardMetrics,
  adminDateRangeBounds,
  adminInvoiceMatchesFilter,
  adminQuoteConversion,
  adminQuoteMatchesFilter,
  adminRecordMatchesDateRange,
  adminRecentActivity,
  adminSetupChecklist,
  adminShipmentMatchesFilter,
  classifyCustomerActivity,
  countUsableRates,
  isPreferenceExcludedQuote,
  isCustomerOnlineBookingEnabled,
  isAdminReadyToBookQuote,
  lowestUsableSellPrice,
  normalizeAdminInvoiceStatus,
  normalizeCarrierMode,
  quoteCarrierAuditSummary,
  quoteHasUsableRates,
  validAdminSellPrice
} from "../public/admin-dashboard.js";

const now = new Date("2026-07-19T12:00:00");
const customers = [
  { id: "cust_a", companyName: "Alpha Logistics", allowedCarrierModes: ["speedship"], allowedBookingCarrierModes: ["speedshipLtl"], allowedBooking: true, createdAt: "2026-07-01T10:00:00" },
  { id: "cust_b", companyName: "Beta Foods", allowedCarrierModes: [], allowedBooking: false, createdAt: "2026-07-12T10:00:00" },
  { id: "cust_disabled", companyName: "Disabled Co", allowedCarrierModes: ["priority1"], allowedBooking: false, active: false, createdAt: "2026-07-12T10:00:00" }
];
const tariffs = [{ id: "tariff_a", customerId: "cust_a" }];
const quotes = [
  quote("quote_ready", "cust_a", "2026-07-19T09:00:00", "quoted", [{ id: "rate_1", sellPrice: 120 }], [{ carrier: "SpeedShip", status: "success", rateCount: 1 }]),
  quote("quote_no_rates", "cust_a", "2026-07-18T09:00:00", "quoted", [], [{ carrier: "SpeedShip", status: "success", rateCount: 0 }]),
  quote("quote_partial", "cust_b", "2026-07-17T09:00:00", "quoted", [{ id: "rate_2", sellPrice: 140 }], [
    { carrier: "SpeedShip", status: "success", rateCount: 1 },
    { carrier: "Priority1", status: "failed", error: "timeout" }
  ]),
  quote("quote_failed", "cust_b", "2026-07-16T09:00:00", "failed", [], [{ carrier: "Priority1", status: "failed", error: "bad lane" }]),
  quote("quote_old", "cust_a", "2026-06-01T09:00:00", "quoted", [{ id: "rate_old", sellPrice: 100 }], [{ carrier: "SpeedShip", status: "success", rateCount: 1 }])
];
const shipments = [
  shipment("ship_linked", "cust_a", "quote_ready", "booked_with_carrier", "2026-07-19T10:00:00"),
  shipment("ship_active", "cust_a", "", "in_transit", "2026-07-18T10:00:00"),
  shipment("ship_exception", "cust_b", "", "delayed", "2026-07-18T11:00:00"),
  shipment("ship_delivered", "cust_a", "quote_old", "delivered", "2026-07-10T10:00:00"),
  shipment("ship_unlinked", "cust_a", "", "booked_with_carrier", "2026-07-19T11:00:00")
];
const invoices = [
  invoice("inv_draft", "cust_a", "draft", "2026-07-19T08:00:00"),
  invoice("inv_overdue", "cust_b", "unpaid", "2026-07-18T08:00:00", "2026-07-01T08:00:00"),
  invoice("inv_paid", "cust_a", "paid", "2026-07-18T08:00:00"),
  invoice("inv_unknown", "cust_a", "provider_review", "2026-07-18T08:00:00")
];

const sellPriceCases = [
  { name: "null", rate: { sellPrice: null }, valid: false },
  { name: "undefined", rate: {}, valid: false },
  { name: "empty string", rate: { sellPrice: "" }, valid: false },
  { name: "whitespace", rate: { sellPrice: "   " }, valid: false },
  { name: "NaN text", rate: { sellPrice: "NaN" }, valid: false },
  { name: "Infinity", rate: { sellPrice: Infinity }, valid: false },
  { name: "valid zero", rate: { sellPrice: 0 }, valid: true },
  { name: "valid positive", rate: { sellPrice: 12.5 }, valid: true },
  { name: "numeric string", rate: { sellPrice: "99.50" }, valid: true }
];
sellPriceCases.forEach((testCase) => {
  assert.equal(Number.isFinite(validAdminSellPrice(testCase.rate)), testCase.valid, `strict sell price validation should handle ${testCase.name}`);
});
assert.equal(quoteHasUsableRates({ rates: [{ sellPrice: null }, { sellPrice: "" }, { sellPrice: " " }] }), false, "missing prices must not count as usable rates");
assert.equal(quoteHasUsableRates({ rates: [{ sellPrice: "0" }] }), true, "zero sellPrice is a usable rate");
assert.equal(countUsableRates({ rates: [{ sellPrice: null }, { sellPrice: 0 }, { sellPrice: "12" }] }), 2, "usable rate count should use strict sellPrice validation");
assert.equal(lowestUsableSellPrice({ rates: [{ sellPrice: "" }, { sellPrice: "20" }, { sellPrice: 5 }] }), 5, "lowest price should ignore missing or invalid prices");

assert.equal(normalizeCarrierMode("speedship"), "speedshipLtl", "SpeedShip alias should normalize to speedshipLtl");
assert.equal(normalizeCarrierMode("speedshipLtl"), "speedshipLtl", "SpeedShip stable key should stay stable");
assert.equal(normalizeCarrierMode("priority1"), "priority1Ltl", "Priority1 alias should normalize to priority1Ltl");
assert.equal(normalizeCarrierMode("PRIORITY1_LTL"), "priority1Ltl", "Priority1 case variation should normalize");
assert.equal(normalizeCarrierMode("mothership"), "mothershipSandbox", "Mothership alias should normalize");

const todayBounds = adminDateRangeBounds("today", now);
assert.equal(todayBounds.start.getHours(), 0, "today range should use browser-local calendar start");
assert.equal(adminDateRangeBounds("last7", now).start.getDate(), 13, "last 7 days should include today plus six prior local days");

const metrics = adminDashboardMetrics({ quotes, shipments, invoices }, "last7", now);
assert.equal(metrics.quotesCreated, 4, "quote-created metric should use selected date range");
assert.equal(metrics.readyToBook, 1, "ready-to-book metric should require usable rates and no linked shipment");
assert.equal(isAdminReadyToBookQuote(quotes[0], shipments), false, "linked shipment should remove ready-to-book eligibility");
assert.equal(metrics.quoteIssues, 3, "quote issue metric should include no-rates, partial failure, and failed quotes");
assert.equal(metrics.activeShipments, 3, "active shipment metric should include booked/moving statuses");
assert.equal(metrics.shipmentExceptions, 1, "shipment exception metric should include delayed/rejected/failed statuses");
assert.equal(metrics.openInvoices, 2, "open invoice metric should include draft/open-like statuses");
assert.equal(normalizeAdminInvoiceStatus("provider_review"), "unknown", "unknown invoice statuses should not count as open");
assert.equal(adminInvoiceMatchesFilter(invoices[3], "open", now), false, "unknown invoice statuses should not match open filter");
assert.equal(adminShipmentMatchesFilter(shipments[2], "exceptions"), true, "staff shipment exception filter should match delayed shipments");
assert.equal(adminQuoteMatchesFilter(quotes[2], "partialFailure", shipments, now), true, "partial-failure quote filter should exist");
assert.equal(adminQuoteMatchesFilter(quotes[1], "noRates", shipments, now), true, "no-rates quote filter should remain distinct");

const partialCarrierExclusionQuote = {
  ...quote("quote_partial_preference", "cust_a", "2026-07-19T08:30:00", "quoted", [
    { id: "rate_abf", sellPrice: 250 },
    { id: "rate_saia", sellPrice: 270 }
  ], [
    { mode: "speedshipLtl", status: "success", rateCount: 2 },
    { mode: "priority1Ltl", excluded: true, status: "blocked", reason: "customer preference" }
  ]),
  carrierExclusionAudit: [{ carrierCode: "XPO", reason: "customer preference" }]
};
assert.equal(isPreferenceExcludedQuote(partialCarrierExclusionQuote), false, "partial carrier exclusion with usable rates should not be fully preference-filtered");
assert.equal(isAdminReadyToBookQuote(partialCarrierExclusionQuote, shipments), true, "partial carrier exclusion with usable rates should remain ready to book");
assert.equal(adminQuoteMatchesFilter(partialCarrierExclusionQuote, "customerPreferences", shipments, now), false, "partial carrier exclusion should not match the Customer Preferences filter");
assert.equal(adminQuoteMatchesFilter(partialCarrierExclusionQuote, "issues", shipments, now), false, "partial carrier exclusion should not become a quote issue without a separate carrier failure");

const preferenceExcludedQuote = {
  ...quote("quote_preference_filtered", "cust_a", "2026-07-19T08:00:00", "quoted", [], [
    { mode: "speedshipLtl", status: "blocked", excluded: true, reason: "customer preference" },
    { mode: "priority1Ltl", status: "blocked", excluded: true, reason: "customer preference" }
  ]),
  rateAvailability: { messageCode: "NO_RATES_AVAILABLE_BY_PREFERENCE" },
  carrierExclusionAudit: [{ carrierCode: "XPO", reason: "customer preference" }]
};
assert.equal(isPreferenceExcludedQuote(preferenceExcludedQuote), true, "preference metadata should classify a quote as preference-filtered");
assert.equal(adminQuoteMatchesFilter(preferenceExcludedQuote, "issues", shipments, now), false, "preference-filtered quotes should not count as quote issues");
assert.equal(adminQuoteMatchesFilter(preferenceExcludedQuote, "noRates", shipments, now), false, "preference-filtered quotes should not count as no-rate failures");
assert.equal(adminQuoteMatchesFilter(preferenceExcludedQuote, "customerPreferences", shipments, now), true, "preference-filtered quote filter should exist");
assert.equal(isAdminReadyToBookQuote(preferenceExcludedQuote, shipments), false, "fully preference-filtered quotes should not be ready to book");

const legacyPreferenceExcludedQuote = {
  ...quote("quote_legacy_preference_filtered", "cust_a", "2026-07-19T07:30:00", "quoted", [], []),
  carrierExclusionAudit: [{ carrierCode: "XPO", reason: "customer preference" }]
};
assert.equal(isPreferenceExcludedQuote(legacyPreferenceExcludedQuote), true, "legacy records with no rates and explicit exclusion audit should be preference-filtered");
const failedHistoricalExclusionQuote = {
  ...legacyPreferenceExcludedQuote,
  id: "quote_failed_historical_preference",
  status: "failed"
};
assert.equal(isPreferenceExcludedQuote(failedHistoricalExclusionQuote), false, "failed quotes with historical exclusion audit should remain failed");
assert.equal(adminQuoteMatchesFilter(failedHistoricalExclusionQuote, "failed", shipments, now), true, "failed quotes with historical exclusion audit should still match Failed");

const auditWithExcludedRows = quoteCarrierAuditSummary({
  carrierAudit: [
    { mode: "speedshipLtl", status: "success", rateCount: 2 },
    { mode: "priority1Ltl", status: "failed", error: "timeout" },
    { mode: "fedexFreight", excluded: true, status: "failed", error: "customer preference" }
  ]
});
assert.deepEqual(auditWithExcludedRows, {
  requested: 2,
  attempted: 2,
  failed: 1,
  succeeded: 1,
  excluded: 1,
  partialFailure: true,
  allFailed: false
}, "carrier audit summary should exclude customer-preference rows from attempted/succeeded/failed denominators");
const onlyExcludedAudit = quoteCarrierAuditSummary({ carrierAudit: [{ mode: "speedshipLtl", excluded: true, status: "failed" }] });
assert.equal(onlyExcludedAudit.attempted, 0, "only excluded carrier rows should have zero attempted rows");
assert.equal(onlyExcludedAudit.allFailed, false, "only excluded carrier rows should not become an all-failed quote");
assert.equal(quoteCarrierAuditSummary({ carrierAudit: [{ mode: "speedshipLtl", status: "failed", error: "bad lane" }] }).allFailed, true, "all attempted channels failed should be recognized");

const conversion = adminQuoteConversion({ quotes, shipments }, "last7", now);
assert.equal(conversion.quotesCreated, 4);
assert.equal(conversion.quotesWithRates, 2);
assert.equal(conversion.bookedShipments, 1, "conversion should count only reliably quote-linked shipments");
assert.equal(conversion.deliveredShipments, 0, "conversion should not guess delivered shipments without selected-range quote links");
assert.equal(adminQuoteConversion({ quotes: [], shipments }, "last7", now).quoteSuccessRate, null, "conversion should not divide by zero");
assert.equal(adminQuoteConversion({ quotes: [preferenceExcludedQuote, quotes[0]], shipments: [] }, "last7", now).quotesWithRates, 1, "preference-filtered quotes should be excluded from no-rate failure conversion metrics");
const preferenceConversion = adminQuoteConversion({ quotes: [preferenceExcludedQuote, partialCarrierExclusionQuote], shipments: [] }, "last7", now);
assert.equal(preferenceConversion.quotesCreated, 2, "quote-created metric should still count preference-filtered quotes");
assert.equal(preferenceConversion.quotesWithRates, 1, "partial carrier exclusion with usable rates should count as a successful quote");
assert.equal(preferenceConversion.quoteSuccessRate, 1, "fully preference-filtered quotes should be excluded from the quote success-rate denominator");
assert.equal(preferenceConversion.quoteToBookingRate, 0, "quote-to-booking conversion intentionally uses all created quotes as its denominator");

const attention = adminAttentionItems({ quotes, shipments, invoices, customers, tariffs }, "last7", now);
assert.equal(attention[0].type, "shipment_exception", "attention items should prioritize shipment exceptions");
assert(attention.some((item) => item.type === "quote_no_rates"), "no-rates attention item should exist");
assert(attention.some((item) => item.type === "quote_partial_failure"), "partial-failure attention item should remain distinct");
assert(attention.some((item) => item.type === "customer_missing_tariff"), "customer missing tariff warning should exist");
assert(attention.some((item) => item.type === "customer_no_carriers"), "customer no-carrier warning should exist");
assert.equal(adminAttentionItems({ quotes: [preferenceExcludedQuote], shipments: [], invoices: [], customers, tariffs }, "last7", now).some((item) => item.type === "quote_no_rates"), false, "fully preference-filtered quotes should not create no-rate attention items");

const completeSetup = adminSetupChecklist({
  customers: [{ id: "cust_ok", allowedCarrierModes: ["speedship"], allowedBookingCarrierModes: ["speedshipLtl"], allowedBooking: true }],
  tariffs: [{ customerId: "cust_ok" }],
  quotes: [{ rates: [{ sellPrice: 1 }] }],
  health: { configuredCarrierModes: ["speedship"] }
});
assert.equal(completeSetup.remaining.length, 0, "setup checklist should hide when all supported checks pass");
assert.equal(adminSetupChecklist({ customers, tariffs, quotes, health: {} }).remaining.length > 0, true, "setup checklist should find actionable setup work");

const activity = adminRecentActivity({ quotes, shipments, invoices, customers }, "last7", now);
assert.equal(activity[0].recordId, "ship_unlinked", "recent activity should sort newest first");
assert.equal(activity.some((item) => item.recordId === "missing_timestamp"), false, "recent activity should not fabricate missing timestamps");
assert.equal(classifyCustomerActivity({ id: "c1", createdAt: "2026-07-19T01:00:00" }).detail, "Customer created.", "customer with only createdAt should be created");
assert.equal(classifyCustomerActivity({ id: "c2", createdAt: "2026-07-19T01:00:00.000Z", updatedAt: "2026-07-19T01:00:00.500Z" }).detail, "Customer created.", "nearly equal customer timestamps should be created");
assert.equal(classifyCustomerActivity({ id: "c3", createdAt: "2026-07-19T01:00:00Z", updatedAt: "2026-07-19T01:05:00Z" }).detail, "Customer updated.", "later updatedAt should be an update");
assert.equal(classifyCustomerActivity({ id: "c4" }).date, "", "customer activity should require reliable timestamps");
assert.equal(classifyCustomerActivity({ id: "c5", updatedAt: "2026-07-19T01:05:00Z" }).date, "", "updatedAt without createdAt should not create synthetic customer activity");

const overview = adminCustomerOverview({ customers, tariffs, quotes }, "last7", now);
assert.equal(overview.activeCustomers, 2);
assert.equal(overview.disabledCustomers, 1);
assert.equal(overview.missingTariffRules, 2);
assert.equal(overview.withoutCarrierModes, 1);
assert.equal(overview.onlineBookingEnabled, 1);
assert.equal(isCustomerOnlineBookingEnabled({ allowedBooking: false, allowedCarrierModes: ["speedshipLtl"], allowedBookingCarrierModes: ["speedshipLtl"] }), false, "allowedBooking false should disable online booking");
assert.equal(isCustomerOnlineBookingEnabled({ allowedCarrierModes: [] }), false, "no carrier modes should disable online booking");
assert.equal(isCustomerOnlineBookingEnabled({ allowedCarrierModes: ["speedshipLtl"] }), false, "allowed mode without booking mode should not count");
assert.equal(isCustomerOnlineBookingEnabled({ allowedCarrierModes: ["speedshipLtl"], allowedBookingCarrierModes: ["priority1Ltl"] }), false, "booking mode must overlap allowed modes");
assert.equal(isCustomerOnlineBookingEnabled({ allowedCarrierModes: ["speedship"], allowedBookingCarrierModes: ["speedshipLtl"] }), true, "valid overlapping normalized modes should count");
assert.equal(isCustomerOnlineBookingEnabled({ active: false, allowedCarrierModes: ["speedshipLtl"], allowedBookingCarrierModes: ["speedshipLtl"] }), false, "disabled customer should not count");

const channels = adminCarrierChannels(
  {
    configuredCarrierModes: ["speedship"],
    carrierHealth: {
      speedship: { status: "healthy", lastError: "token=abc123 should not leak", bookingEnabled: true }
    }
  },
  quotes
);
assert.equal(channels.find((item) => item.key === "speedshipLtl").configured, "configured", "carrier aliases should not show configured channels as not configured");
assert.equal(channels.find((item) => item.key === "speedshipLtl").lastErrorSummary.includes("abc123"), false, "carrier channel panel data should redact tokens/secrets");
assert.equal(adminCarrierChannels({ speedshipConfigured: true }, []).find((item) => item.key === "speedshipLtl").configured, "configured", "legacy SpeedShip booleans should use the shared carrier config resolver");
assert.equal(adminCarrierChannels({ speedshipConfigured: "false" }, []).find((item) => item.key === "speedshipLtl").configured, "not_configured", "string false legacy config should not be treated as configured");
assert.equal(adminCarrierChannels({}, []).find((item) => item.key === "speedshipLtl").configured, "unknown", "missing carrier config metadata should remain unknown");
assert.equal(adminCarrierChannels({ carrierHealth: { speedship: { configured: false } } }, []).find((item) => item.key === "speedshipLtl").configured, "not_configured", "explicit carrier health configured=false should win");

const sanitizedChannel = adminCarrierChannels({
  configuredCarrierModes: ["speedship"],
  carrierHealth: {
    speedship: {
      status: "error",
      lastError: {
        url: "https://carrier.example/rates?api_key=query-secret&access_token=access-secret",
        headers: { Authorization: "Bearer bearer-secret-token" },
        token: "json-token-secret",
        apiKey: "json-api-key-secret",
        message: "password=form-secret secret=also-secret"
      }
    }
  }
}, []).find((item) => item.key === "speedshipLtl").lastErrorSummary;
assert.equal(sanitizedChannel.includes("query-secret"), false, "query string api_key should be redacted");
assert.equal(sanitizedChannel.includes("access-secret"), false, "query string access_token should be redacted");
assert.equal(sanitizedChannel.includes("bearer-secret-token"), false, "bearer tokens should be redacted");
assert.equal(sanitizedChannel.includes("json-token-secret"), false, "JSON token fields should be redacted");
assert.equal(sanitizedChannel.length <= 160, true, "sanitized carrier messages should be length limited");

const channelHistory = adminCarrierChannels(
  { configuredCarrierModes: ["speedshipLtl", "priority1Ltl"] },
  [
    quote("latest_failed", "cust_a", "2026-07-19T11:00:00", "quoted", [], [{ mode: "speedshipLtl", status: "failed", error: "authorization=bad", rateCount: 0 }]),
    quote("earlier_success", "cust_a", "2026-07-18T11:00:00", "quoted", [{ sellPrice: 10 }], [{ mode: "speedship", status: "success", rateCount: 1 }]),
    quote("excluded", "cust_a", "2026-07-19T10:00:00", "quoted", [], [{ mode: "priority1", status: "failed", excluded: true, rateCount: 0 }]),
    quote("returned", "cust_a", "2026-07-17T10:00:00", "quoted", [{ sellPrice: 30 }], [{ mode: "priority1Ltl", status: "success", ratesReturned: 2 }])
  ]
);
assert.equal(channelHistory.find((item) => item.key === "speedshipLtl").lastSuccessfulQuoteAt.startsWith("2026-07-18"), true, "latest failed record should not replace earlier successful quote time");
assert.equal(channelHistory.find((item) => item.key === "speedshipLtl").lastErrorSummary.includes("[redacted]"), true, "latest failed record may provide a sanitized error");
assert.equal(channelHistory.find((item) => item.key === "speedshipLtl").lastErrorSummary.includes("authorization=bad"), false, "authorization details should be redacted");
assert.equal(channelHistory.find((item) => item.key === "priority1Ltl").lastSuccessfulQuoteAt.startsWith("2026-07-17"), true, "ratesReturned should count as successful");
assert.equal(adminCarrierChannels({}, [quote("only_failed", "cust_a", "2026-07-19T11:00:00", "failed", [], [{ mode: "speedship", status: "failed", rateCount: 0 }])]).find((item) => item.key === "speedshipLtl").lastSuccessfulQuoteAt, "", "only failed records should not show last successful quote time");

const drillDownRange = "last7";
const drillDownQuoteCount = quotes.filter((item) => adminQuoteMatchesFilter(item, "issues", shipments, now) && adminRecordMatchesDateRange(item, drillDownRange, "createdAt", now)).length;
assert.equal(drillDownQuoteCount, metrics.quoteIssues, "Quote Issues KPI count should match drill-down record count in the same range");
const drillDownShipmentCount = shipments.filter((item) => adminShipmentMatchesFilter(item, "active") && adminRecordMatchesDateRange(item, drillDownRange, "createdAt", now)).length;
assert.equal(drillDownShipmentCount, metrics.activeShipments, "Active Shipments KPI count should match drill-down record count in the same range");
const drillDownInvoiceCount = invoices.filter((item) => adminInvoiceMatchesFilter(item, "open", now) && adminRecordMatchesDateRange(item, drillDownRange, "createdAt", now)).length;
assert.equal(drillDownInvoiceCount, metrics.openInvoices, "Open Invoices KPI count should match drill-down record count in the same range");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const renderDashboardSlice = app.slice(app.indexOf("function renderDashboard"), app.indexOf("function renderQuotesView"));
const renderStaffDashboardSlice = app.slice(app.indexOf("function renderStaffDashboard"), app.indexOf("function renderCustomerDashboard"));
const renderCustomerDashboardSlice = app.slice(app.indexOf("function renderCustomerDashboard"), app.indexOf("function customerKpiGridHtml"));
const renderQuotesViewSlice = app.slice(app.indexOf("function renderQuotesView"), app.indexOf("function renderStaffDashboard"));
const staffNavigationSlice = app.slice(app.indexOf("function navigateStaffDashboardFilter"), app.indexOf("function handleStaffDashboardAction"));
const staffActionSlice = app.slice(app.indexOf("function handleStaffDashboardAction"), app.indexOf("function openTrackShipmentModal"));
const rolePresentationSlice = app.slice(app.indexOf("function updateRolePresentation"), app.indexOf("function isStaffUser"));

assert.match(renderDashboardSlice, /if \(isCustomerUser\(\)\) {\n\s+renderCustomerDashboard\(\);\n\s+return;\n\s+}\n\n\s+renderStaffDashboard\(\);/, "staff and customer dashboards should keep separate render paths");
assert.match(renderStaffDashboardSlice, /Operations Overview/, "staff dashboard should use Operations Overview header");
assert.doesNotMatch(renderStaffDashboardSlice, /Welcome back, \{companyName\}|Customer Portal|Manage your quotes, shipments, documents, and invoices\./, "staff dashboard should not contain customer-only hero content");
assert.doesNotMatch(renderCustomerDashboardSlice, /Carrier Channels|System Setup|Customer Overview|carrierCost|markup|margin|rawCarrierResponse|provider IDs|organizationId/, "customer dashboard should not contain staff diagnostics");
assert.match(renderQuotesViewSlice, /staffQuoteRowHtml/, "staff Quote Management view should render real quote rows");
assert.match(html, /id="quotesNavButton"/, "Quote Management navigation route should exist");
assert.doesNotMatch(html.slice(html.indexOf('id="quotesNavButton"'), html.indexOf('data-view="quote"')), /customer-only/, "staff Quote Management nav should not be customer-only");
assert.match(rolePresentationSlice, /quotes: isCustomer \? "My Quotes" : "Quote Management"/, "customer My Quotes label should remain role-aware");
assert.match(staffNavigationSlice, /state\.staffFilters\.shipments = filter === "shipmentExceptions" \? "exceptions" : "active"/, "staff KPI clicks should open filtered shipment views");
assert.match(staffNavigationSlice, /state\.staffFilters\.invoices = "open"/, "staff KPI clicks should open filtered invoice view");
assert.match(staffNavigationSlice, /state\.staffFilterRanges\.quotes = state\.staffDashboardRange/, "staff quote KPI drill-down should preserve dashboard date range");
assert.match(staffNavigationSlice, /state\.staffFilterRanges\.shipments = state\.staffDashboardRange/, "staff shipment KPI drill-down should preserve dashboard date range");
assert.match(staffNavigationSlice, /state\.staffFilterRanges\.invoices = state\.staffDashboardRange/, "staff invoice KPI drill-down should preserve dashboard date range");
assert.match(app, /staff-filter-summary/, "staff filtered management views should show a visible filter summary");
assert.match(app, /data-staff-clear-date-range/, "staff filtered management views should allow clearing date range only");
assert.match(app, /data-staff-clear-all-filters/, "staff filtered management views should allow clearing all filters");
assert.match(app, /resetStaffFilterForView\(name\)/, "sidebar navigation should reset staff destination filters");
assert.match(app, /openStaffSearchModal/, "staff Search action should open a real search modal");
assert.doesNotMatch(staffActionSlice, /action === "search"[\s\S]*setView\("quotes"\)/, "staff Search action should not be a fake Quote Management shortcut");
assert.match(app, /function runStaffSearch\(\)/, "staff global search should be implemented");
assert.match(app, /quote number|quote, PO, shipment, invoice, or customer|billingEmail/i, "staff search should cover safe operational identifiers");
assert.match(app, /function openCarrierDiagnosticsModal\(\)/, "carrier diagnostics action should open a real diagnostics modal");
assert.doesNotMatch(staffActionSlice, /action === "diagnostics"[\s\S]*openDashboardModal\("quotes"\)/, "carrier diagnostics should not open the old Quotes summary modal");
assert.match(app, /refreshButton\.classList\.toggle\("primary-action", false\)/, "Refresh should not remain primary for staff");
assert.match(app, /data-staff-dashboard-action="newQuote"/, "New Quote should be the primary staff top action");
assert.match(app, /Administrator \/ Staff/, "staff account chip should hide raw role codes");
assert.match(app, /Account[\s\S]*System status[\s\S]*Logout/, "staff account menu should include account, system status, and logout");
assert.match(app, /Last updated \{time\}/, "last successful refresh time label should exist");
assert.match(styles, /staff-dashboard-view/, "responsive staff dashboard classes should exist");
assert.match(styles, /staff-kpi-grid[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/, "wide staff dashboard should support six KPI columns");
assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*staff-kpi-grid[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/, "laptop staff dashboard should support three KPI columns");
assert.match(styles, /@media \(max-width: 980px\)[\s\S]*staff-kpi-grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/, "tablet staff dashboard should support two KPI columns");
assert.match(styles, /@media \(max-width: 560px\)[\s\S]*staff-kpi-grid[\s\S]*grid-template-columns: 1fr/, "mobile staff dashboard should collapse to one column");
assert.match(app, /"Operations Overview": "运营总览"/, "Operations Overview Chinese translation should exist");
assert.match(app, /"Monitor quotes, shipments, customers, invoices, and carrier activity\.": "查看报价、货件、客户、账单和承运商运行情况。"/, "staff subtitle Chinese translation should exist");
assert.match(app, /"Quote Management": "报价管理"/, "Quote Management Chinese translation should exist");
assert.match(app, /"Carrier Channels": "承运商渠道"/, "Carrier Channels Chinese translation should exist");
assert.match(app, /"System Setup": "系统设置"/, "System Setup Chinese translation should exist");
assert.match(app, /"Customer Overview": "客户概况"/, "Customer Overview Chinese translation should exist");
assert.match(app, /"Customer created": "客户已创建"/, "Customer created Chinese translation should exist");
assert.match(app, /"Filtered by Customer Preferences": "已按客户偏好过滤"/, "preference-filtered quote status Chinese translation should exist");
assert.match(app, /"Customer Preferences": "客户偏好过滤"/, "customer preferences filter Chinese translation should exist");
assert.match(app, /staffQuoteStatusLabel[\s\S]*Booked[\s\S]*Cancelled[\s\S]*Expired[\s\S]*Failed[\s\S]*Filtered by Customer Preferences[\s\S]*Partial Failure[\s\S]*Ready to Book[\s\S]*No Rates[\s\S]*Status Pending/, "staff quote classification should keep the required priority order");
assert.match(app, /sidebarHealth\.classList\.toggle\("hidden", Boolean\(state\.user && isCustomerUser\(\) && state\.health\?\.ok\)\)/, "customer health indicator should remain hidden when healthy");
assert.match(app, /const message = state\.health\?\.ok \? t\("Server ready"\) : t\("Checking server"\);/, "employee health indicator should remain available");

console.log("admin dashboard tests passed");

function quote(id, customerId, createdAt, status, rates, carrierAudit = []) {
  return {
    id,
    quoteNumber: id.toUpperCase(),
    customerId,
    createdAt,
    status,
    rates,
    carrierAudit,
    pickup: { address: { city: "Los Angeles", state: "CA", zip: "90001" } },
    delivery: { address: { city: "New York", state: "NY", zip: "10001" } }
  };
}

function shipment(id, customerId, quoteId, status, createdAt) {
  return {
    id,
    customerId,
    quoteId,
    status,
    createdAt,
    updatedAt: createdAt,
    confirmationNumber: id.toUpperCase()
  };
}

function invoice(id, customerId, status, createdAt, dueAt = "") {
  return {
    id,
    customerId,
    status,
    createdAt,
    dueAt,
    invoiceNumber: id.toUpperCase()
  };
}
