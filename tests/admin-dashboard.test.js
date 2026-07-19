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
  adminRecentActivity,
  adminSetupChecklist,
  adminShipmentMatchesFilter,
  isAdminReadyToBookQuote,
  normalizeAdminInvoiceStatus
} from "../public/admin-dashboard.js";

const now = new Date("2026-07-19T12:00:00");
const customers = [
  { id: "cust_a", companyName: "Alpha Logistics", allowedCarrierModes: ["speedship"], allowedBooking: true, createdAt: "2026-07-01T10:00:00" },
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

const conversion = adminQuoteConversion({ quotes, shipments }, "last7", now);
assert.equal(conversion.quotesCreated, 4);
assert.equal(conversion.quotesWithRates, 2);
assert.equal(conversion.bookedShipments, 1, "conversion should count only reliably quote-linked shipments");
assert.equal(conversion.deliveredShipments, 0, "conversion should not guess delivered shipments without selected-range quote links");
assert.equal(adminQuoteConversion({ quotes: [], shipments }, "last7", now).quoteSuccessRate, null, "conversion should not divide by zero");

const attention = adminAttentionItems({ quotes, shipments, invoices, customers, tariffs }, "last7", now);
assert.equal(attention[0].type, "shipment_exception", "attention items should prioritize shipment exceptions");
assert(attention.some((item) => item.type === "quote_no_rates"), "no-rates attention item should exist");
assert(attention.some((item) => item.type === "quote_partial_failure"), "partial-failure attention item should remain distinct");
assert(attention.some((item) => item.type === "customer_missing_tariff"), "customer missing tariff warning should exist");
assert(attention.some((item) => item.type === "customer_no_carriers"), "customer no-carrier warning should exist");

const completeSetup = adminSetupChecklist({
  customers: [{ id: "cust_ok", allowedCarrierModes: ["speedship"], allowedBooking: true }],
  tariffs: [{ customerId: "cust_ok" }],
  quotes: [{ rates: [{ sellPrice: 1 }] }],
  health: { configuredCarrierModes: ["speedship"] }
});
assert.equal(completeSetup.remaining.length, 0, "setup checklist should hide when all supported checks pass");
assert.equal(adminSetupChecklist({ customers, tariffs, quotes, health: {} }).remaining.length > 0, true, "setup checklist should find actionable setup work");

const activity = adminRecentActivity({ quotes, shipments, invoices, customers }, "last7", now);
assert.equal(activity[0].recordId, "ship_unlinked", "recent activity should sort newest first");
assert.equal(activity.some((item) => item.recordId === "missing_timestamp"), false, "recent activity should not fabricate missing timestamps");

const overview = adminCustomerOverview({ customers, tariffs, quotes }, "last7", now);
assert.equal(overview.activeCustomers, 2);
assert.equal(overview.disabledCustomers, 1);
assert.equal(overview.missingTariffRules, 2);
assert.equal(overview.withoutCarrierModes, 1);
assert.equal(overview.onlineBookingEnabled, 1);

const channels = adminCarrierChannels(
  {
    configuredCarrierModes: ["speedship"],
    carrierHealth: {
      speedship: { status: "healthy", lastError: "token=abc123 should not leak", bookingEnabled: true }
    }
  },
  quotes
);
assert.equal(channels.find((item) => item.key === "speedship").lastErrorSummary.includes("abc123"), false, "carrier channel panel data should redact tokens/secrets");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const renderDashboardSlice = app.slice(app.indexOf("function renderDashboard"), app.indexOf("function renderQuotesView"));
const renderStaffDashboardSlice = app.slice(app.indexOf("function renderStaffDashboard"), app.indexOf("function renderCustomerDashboard"));
const renderCustomerDashboardSlice = app.slice(app.indexOf("function renderCustomerDashboard"), app.indexOf("function customerKpiGridHtml"));
const renderQuotesViewSlice = app.slice(app.indexOf("function renderQuotesView"), app.indexOf("function renderStaffDashboard"));
const staffNavigationSlice = app.slice(app.indexOf("function navigateStaffDashboardFilter"), app.indexOf("function handleStaffDashboardAction"));
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
assert.match(app, /resetStaffFilterForView\(name\)/, "sidebar navigation should reset staff destination filters");
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
