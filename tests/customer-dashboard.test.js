import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  customerDashboardMetrics,
  customerDashboardViewModel,
  dashboardAttentionItems,
  isActiveShipment,
  isDeliveredThisMonth,
  isOpenInvoice,
  isQuoteReadyToBook,
  normalizeInvoiceStatus,
  normalizeShipmentStatus,
  quoteStatusLabelKey,
  shipmentStatusLabelKey
} from "../public/customer-dashboard.js";

const now = new Date("2026-07-18T12:00:00Z");
const quotes = [
  quote("quote_ready_old", "2026-07-10T12:00:00Z", "quoted", [{ id: "rate_1", sellPrice: 100 }]),
  quote("quote_ready_new", "2026-07-17T12:00:00Z", "quoted", [{ id: "rate_2", sellPrice: 80 }]),
  quote("quote_booked", "2026-07-16T12:00:00Z", "quoted", [{ id: "rate_3", sellPrice: 90 }]),
  quote("quote_empty", "2026-07-15T12:00:00Z", "quoted", [])
];
const shipments = [
  shipment("ship_booked", "quote_booked", "booked_with_carrier", "2026-07-12T12:00:00Z"),
  shipment("ship_active", "", "in_transit", "2026-07-13T12:00:00Z"),
  shipment("ship_delivered_with_date", "", "delivered", "2026-07-14T12:00:00Z", {
    deliveredAt: "2026-07-15T12:00:00Z"
  }),
  shipment("ship_delivered_no_date", "", "delivered", "2026-07-14T12:00:00Z"),
  shipment("ship_cancelled", "", "cancelled", "2026-07-13T12:00:00Z"),
  shipment("ship_exception", "", "delayed", "2026-07-13T12:00:00Z")
];
const invoices = [
  invoice("inv_open", "open", "2026-07-20T12:00:00Z"),
  invoice("inv_overdue", "unpaid", "2026-07-10T12:00:00Z"),
  invoice("inv_paid", "paid", "2026-07-10T12:00:00Z"),
  invoice("inv_void", "void", "2026-07-10T12:00:00Z"),
  invoice("inv_cancelled", "cancelled", "2026-07-10T12:00:00Z"),
  invoice("inv_unknown", "provider_review", "2026-07-10T12:00:00Z")
];

assert.equal(isQuoteReadyToBook(quotes[0], shipments), true, "quote with rates and no shipment is ready to book");
assert.equal(isQuoteReadyToBook(quotes[2], shipments), false, "ready-to-book excludes quotes linked to shipments");
assert.equal(isActiveShipment(shipments[0]), true, "booked_with_carrier should be active");
assert.equal(isActiveShipment(shipments[2]), false, "delivered should not be active");
assert.equal(isActiveShipment(shipments[4]), false, "cancelled should not be active");
assert.equal(isOpenInvoice(invoices[0]), true, "open invoices should count");
assert.equal(isOpenInvoice(invoices[2]), false, "paid invoices should not count");
assert.equal(isOpenInvoice(invoices[5]), false, "unknown invoices should not count as open");
assert.equal(normalizeInvoiceStatus("void"), "void");
assert.equal(normalizeInvoiceStatus("cancelled"), "cancelled");
assert.equal(normalizeInvoiceStatus("closed"), "cancelled");
assert.equal(normalizeInvoiceStatus("refunded"), "cancelled");
assert.equal(normalizeInvoiceStatus("written off"), "cancelled");
assert.equal(normalizeInvoiceStatus("local"), "status_pending");
assert.equal(normalizeInvoiceStatus("provider_review"), "status_pending");
assert.equal(isDeliveredThisMonth(shipments[2], now), true, "delivered this month requires a reliable delivered date");
assert.equal(isDeliveredThisMonth(shipments[3], now), false, "delivered this month must not guess without a delivered date");
assert.equal(normalizeShipmentStatus("booked_with_carrier"), "booked");
assert.equal(shipmentStatusLabelKey("booked_with_carrier"), "Booked");
assert.equal(quoteStatusLabelKey(quotes[0], shipments), "Ready to Book");
assert.equal(quoteStatusLabelKey(quotes[3], shipments), "No Rates");

assert.deepEqual(
  quotes.filter((item) => quoteStatusLabelKey(item, shipments) === "Ready to Book").map((item) => item.id),
  ["quote_ready_old", "quote_ready_new"],
  "customer Quotes ready filter should include only bookable quotes"
);
assert.deepEqual(
  quotes.filter((item) => quoteStatusLabelKey(item, shipments) === "Booked").map((item) => item.id),
  ["quote_booked"],
  "customer Quotes booked filter should include quotes linked to shipments"
);
assert.deepEqual(
  quotes.filter((item) => quoteStatusLabelKey(item, shipments) === "No Rates").map((item) => item.id),
  ["quote_empty"],
  "customer Quotes no-rates filter should include only zero-rate quotes"
);
assert.deepEqual(
  shipments.filter(isActiveShipment).map((item) => item.id),
  ["ship_booked", "ship_active", "ship_exception"],
  "customer Shipments active filter should include only active statuses"
);
assert.deepEqual(
  shipments.filter((item) => isDeliveredThisMonth(item, now)).map((item) => item.id),
  ["ship_delivered_with_date"],
  "customer Shipments delivered-this-month filter should require a reliable delivery date"
);
assert.deepEqual(
  invoices.filter(isOpenInvoice).map((item) => item.id),
  ["inv_open", "inv_overdue"],
  "customer Invoices open filter should exclude paid, closed, void, and unknown statuses"
);

assert.deepEqual(
  customerDashboardMetrics({ quotes, shipments, invoices }, now),
  {
    readyToBook: 2,
    activeShipments: 3,
    openInvoices: 2,
    deliveredThisMonth: 1
  },
  "customer metrics should follow customer-safe rules"
);

const model = customerDashboardViewModel({ quotes, shipments, invoices }, now);
assert.equal(model.recentQuotes[0].id, "quote_ready_new", "repeat-last quote source should be latest by createdAt");
assert.equal(model.activeShipments.some((item) => item.id === "ship_delivered_with_date"), false, "active list excludes delivered");
assert.deepEqual(
  dashboardAttentionItems({ quotes, shipments, invoices }, now).map((item) => item.type).slice(0, 5),
  ["shipment_exception", "invoice_overdue", "invoice_due_soon", "ready_quote", "ready_quote"],
  "attention items should be sorted by urgency"
);

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const renderCustomerDashboardSlice = app.slice(app.indexOf("function renderCustomerDashboard"), app.indexOf("function customerKpiGridHtml"));
const renderStaffDashboardSlice = app.slice(app.indexOf("function renderStaffDashboard"), app.indexOf("function staffDashboardShellHtml"));
const customerQuoteRowSlice = app.slice(app.indexOf("function customerQuoteRowHtml"), app.indexOf("function quickActionsPanelHtml"));
const documentErrorSlice = app.slice(app.indexOf('if (loadState === "error")'), app.indexOf("  const bol = filterShipmentDocumentsByKind"));
assert.match(app, /function renderDashboard\(\) {\n\s+if \(isCustomerUser\(\)\) {\n\s+renderCustomerDashboard\(\);/, "customer and employee dashboards should use separate render paths");
assert.match(app, /function renderStaffDashboard\(\)/, "staff dashboard path should be preserved");
assert.doesNotMatch(renderCustomerDashboardSlice, /className\s*=\s*"view active"|classList\.(?:add|toggle)\("active"/, "customer dashboard renderer must not own active view state");
assert.doesNotMatch(renderStaffDashboardSlice, /className\s*=\s*"view active"|classList\.(?:add|toggle)\("active"/, "staff dashboard renderer must not own active view state");
assert.match(app, /document\.querySelectorAll\("\.view"\)\.forEach\(\(view\) => {\n\s+view\.classList\.toggle\("active", view\.id === `\$\{name\}View`\);/, "setView should be the single owner of active view state");
assert.match(app, /setView\(button\.dataset\.view, \{ resetCustomerFilter: true \}\)/, "side navigation should reset customer filters to all");
assert.match(app, /data-modal="customers"/, "employee Customers KPI modal should remain in staff shell");
assert.doesNotMatch(app.slice(app.indexOf("function customerKpiGridHtml"), app.indexOf("function renderQuoteResults")), /Customers KPI|customerCount|carrierCost|margin|markup|providerScac|carrierAudit|carrierExclusionAudit|rawCarrierResponse/, "customer dashboard render path should not include internal pricing or provider fields");
assert.match(app, /data-customer-dashboard-action="newQuote"/, "New Quote dashboard action should exist");
assert.match(app, /reenterQuote\(quote\.id\)/, "Repeat Last Quote should use existing re-entry flow");
assert.match(app, /No previous quotes to repeat/, "Repeat Last Quote should explain disabled state");
assert.match(app, /openTrackShipmentModal/, "Track Shipment modal should exist");
assert.match(app, /state\.shipments\.filter/, "Track Shipment search should use customer-owned state");
assert.match(app, /event\.key === "Enter" && event\.target\?\.id === "trackShipmentSearchInput"/, "Track Shipment search should submit on Enter");
assert.match(app, /const exact = state\.shipments\.filter/, "Track Shipment search should first check exact matches");
assert.match(app, /if \(exact\.length === 1\) {\n\s+openShipmentTracking\(exact\[0\]\.id\);/, "exact tracking match should open tracking directly");
assert.match(app, /data-track-result="\$\{escapeHtml\(shipment\.id\)\}"/, "partial tracking matches should be selectable buttons");
assert.match(app, /replacingOpenModal/, "modal transitions should preserve the original focus return target");
assert.match(app, /showToast\(t\("Filter: \{filter\}"/, "KPI clicks should visibly indicate intended filter without employee modals");
assert.match(app, /state\.customerFilters\.quotes = filter === "readyQuotes" \? "ready" : "all";\n\s+setView\("quotes"\);/, "Ready quote KPI and View all quotes should navigate to the customer Quotes view");
assert.match(app, /state\.customerFilters\.invoices = "open";\n\s+setView\("invoices"\);/, "Open invoice KPI should navigate to filtered customer Invoices");
assert.match(app, /state\.customerFilters\.shipments = "active";/, "Active shipment KPI should set the customer shipment filter");
assert.match(app, /state\.customerFilters\.shipments = "deliveredThisMonth";/, "Delivered KPI should set the delivered-this-month shipment filter");
assert.match(app, /function renderQuotesView\(\)/, "customer Quotes view renderer should exist");
assert.match(html, /id="quotesNavButton"/, "customer Quotes navigation item should exist");
assert.match(html, /id="quotesView"/, "customer Quotes view should exist");
assert.match(customerQuoteRowSlice, /available rate\(s\)/, "customer quote rows should show rate counts");
assert.match(customerQuoteRowSlice, /Lowest price/, "customer quote rows should show the lowest customer sell price");
assert.match(customerQuoteRowSlice, /data-view-quote/, "customer quote rows should allow viewing a quote");
assert.match(customerQuoteRowSlice, /data-reenter-quote/, "customer quote rows should allow repeating a quote");
assert.doesNotMatch(customerQuoteRowSlice, /carrierAudit|carrierExclusionAudit|rawCarrierResponse|providerScac|carrierCost|margin|markup|Mothership|SpeedShip|Priority1/, "customer quote rows should not expose carrier diagnostics or internal pricing");
assert.match(app, /customerFilterBarHtml\("quotes"/, "Quotes view should render a filter bar");
assert.match(app, /customerFilterBarHtml\("shipments"/, "Shipments view should render customer filters");
assert.match(app, /customerFilterBarHtml\("invoices"/, "Invoices view should render customer filters");
assert.match(app, /data-customer-filter="all">\$\{t\("Clear Filter"\)\}/, "filtered customer views should offer Clear Filter");
assert.match(documentErrorSlice, /Documents could not be loaded\./, "document load failures should use a distinct customer-safe message");
assert.match(documentErrorSlice, /Try Again/, "document load failures should offer retry");
assert.match(documentErrorSlice, /data-customer-documents/, "document retry should call the safe customer document loader");
assert.doesNotMatch(documentErrorSlice, /Unavailable|error\.message|message \|\|/, "document request failures should not look like loaded missing documents or expose raw errors");
assert.match(html, /id="portalSubtitle"/, "portal subtitle should support customer branding");
assert.match(styles, /customer-kpi-grid/, "responsive customer KPI layout classes should exist");
assert.match(styles, /repeat\(4, minmax\(0, 1fr\)\)/, "desktop KPI layout should have four balanced columns");
assert.match(styles, /repeat\(2, minmax\(0, 1fr\)\)/, "tablet KPI layout should have two columns");
assert.match(styles, /customer-dashboard-main/, "customer dashboard main layout should exist");
assert.match(styles, /customer-filter-bar/, "customer filter chip layout should exist");
assert.match(styles, /repeat\(auto-fit, minmax\(92px, 1fr\)\)/, "mobile nav should adapt when customer Quotes nav is visible");
assert.match(app, /"Customer Portal": "客户门户"/, "Customer Portal Chinese translation should exist");
assert.match(app, /"Welcome back, \{companyName\}": "欢迎回来，\{companyName\}"/, "welcome translation should exist");
assert.match(app, /"Clear Filter": "清除筛选"/, "Clear Filter Chinese translation should exist");
assert.match(app, /"Documents could not be loaded\.": "文件加载失败。"/, "document failure Chinese translation should exist");
assert.match(app, /"Try Again": "重试"/, "document retry Chinese translation should exist");
assert.match(app, /"Status Pending": "状态待更新"/, "pending invoice status Chinese translation should exist");

console.log("customer dashboard tests passed");

function quote(id, createdAt, status, rates) {
  return {
    id,
    createdAt,
    status,
    rates,
    pickup: { address: { city: "Los Angeles", state: "CA" } },
    delivery: { address: { city: "New York", state: "NY" } }
  };
}

function shipment(id, quoteId, status, createdAt, extra = {}) {
  return {
    id,
    quoteId,
    status,
    createdAt,
    confirmationNumber: `CN-${id}`,
    pickup: { address: { city: "Los Angeles", state: "CA" } },
    delivery: { address: { city: "New York", state: "NY" } },
    ...extra
  };
}

function invoice(id, status, dueAt) {
  return {
    id,
    status,
    dueAt,
    invoiceNumber: id
  };
}
