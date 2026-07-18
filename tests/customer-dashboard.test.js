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
  invoice("inv_cancelled", "cancelled", "2026-07-10T12:00:00Z")
];

assert.equal(isQuoteReadyToBook(quotes[0], shipments), true, "quote with rates and no shipment is ready to book");
assert.equal(isQuoteReadyToBook(quotes[2], shipments), false, "ready-to-book excludes quotes linked to shipments");
assert.equal(isActiveShipment(shipments[0]), true, "booked_with_carrier should be active");
assert.equal(isActiveShipment(shipments[2]), false, "delivered should not be active");
assert.equal(isActiveShipment(shipments[4]), false, "cancelled should not be active");
assert.equal(isOpenInvoice(invoices[0]), true, "open invoices should count");
assert.equal(isOpenInvoice(invoices[2]), false, "paid invoices should not count");
assert.equal(normalizeInvoiceStatus("void"), "void");
assert.equal(normalizeInvoiceStatus("cancelled"), "cancelled");
assert.equal(isDeliveredThisMonth(shipments[2], now), true, "delivered this month requires a reliable delivered date");
assert.equal(isDeliveredThisMonth(shipments[3], now), false, "delivered this month must not guess without a delivered date");
assert.equal(normalizeShipmentStatus("booked_with_carrier"), "booked");
assert.equal(shipmentStatusLabelKey("booked_with_carrier"), "Booked");
assert.equal(quoteStatusLabelKey(quotes[0], shipments), "Ready to Book");
assert.equal(quoteStatusLabelKey(quotes[3], shipments), "No Rates");

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
assert.match(app, /function renderDashboard\(\) {\n\s+if \(isCustomerUser\(\)\) {\n\s+renderCustomerDashboard\(\);/, "customer and employee dashboards should use separate render paths");
assert.match(app, /function renderStaffDashboard\(\)/, "staff dashboard path should be preserved");
assert.match(app, /data-modal="customers"/, "employee Customers KPI modal should remain in staff shell");
assert.doesNotMatch(app.slice(app.indexOf("function customerKpiGridHtml"), app.indexOf("function renderQuoteResults")), /Customers KPI|customerCount|carrierCost|margin|markup|providerScac|carrierAudit|carrierExclusionAudit|rawCarrierResponse/, "customer dashboard render path should not include internal pricing or provider fields");
assert.match(app, /data-customer-dashboard-action="newQuote"/, "New Quote dashboard action should exist");
assert.match(app, /reenterQuote\(quote\.id\)/, "Repeat Last Quote should use existing re-entry flow");
assert.match(app, /No previous quotes to repeat/, "Repeat Last Quote should explain disabled state");
assert.match(app, /openTrackShipmentModal/, "Track Shipment modal should exist");
assert.match(app, /state\.shipments\.filter/, "Track Shipment search should use customer-owned state");
assert.match(app, /showToast\(t\("Filter: \{filter\}"/, "KPI clicks should visibly indicate intended filter without employee modals");
assert.match(html, /id="portalSubtitle"/, "portal subtitle should support customer branding");
assert.match(styles, /customer-kpi-grid/, "responsive customer KPI layout classes should exist");
assert.match(styles, /repeat\(4, minmax\(0, 1fr\)\)/, "desktop KPI layout should have four balanced columns");
assert.match(styles, /repeat\(2, minmax\(0, 1fr\)\)/, "tablet KPI layout should have two columns");
assert.match(styles, /customer-dashboard-main/, "customer dashboard main layout should exist");
assert.match(app, /"Customer Portal": "客户门户"/, "Customer Portal Chinese translation should exist");
assert.match(app, /"Welcome back, \{companyName\}": "欢迎回来，\{companyName\}"/, "welcome translation should exist");

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
