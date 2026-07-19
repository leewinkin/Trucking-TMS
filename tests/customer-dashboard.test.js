import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aggregateReadyQuoteAttentionItems,
  customerQuoteNumber,
  customerQuoteRateMetrics,
  customerDashboardMetrics,
  customerDashboardViewModel,
  dashboardAttentionItems,
  isActiveShipment,
  isDeliveredThisMonth,
  isOpenInvoice,
  isQuoteReadyToBook,
  normalizeInvoiceStatus,
  normalizeShipmentStatus,
  quoteLowestSellPrice,
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
assert.equal(quoteStatusLabelKey(quote("quote_failed", "2026-07-18T12:00:00Z", "failed", []), shipments), "Exception");
assert.equal(customerQuoteNumber(quotes[0]), "Q-READYOLD");
assert.equal(quoteLowestSellPrice(quote("quote_multi", "2026-07-18T12:00:00Z", "quoted", [{ sellPrice: 125 }, { sellPrice: 95 }])), 95);
assert.equal(quoteLowestSellPrice(quote("quote_missing_price", "2026-07-18T12:00:00Z", "quoted", [{ sellPrice: "" }])), Number.POSITIVE_INFINITY);

const quoteDetailRates = [
  { id: "old_dominion", carrierName: "Old Dominion", sellPrice: 80, transitDays: 5, estimatedDeliveryDate: "2026-07-26" },
  { id: "xpress", carrierName: "Xpress Global Systems", sellPrice: 120, transitDays: 2, estimatedDeliveryDate: "2026-07-24" },
  { id: "saia", carrierName: "SAIA", sellPrice: 95, transitDays: 3, estimatedDeliveryDate: "2026-07-25" }
];
const quoteDetailsAllMetrics = customerQuoteRateMetrics(quoteDetailRates, {
  search: "",
  sort: "lowestPrice",
  visibleCount: 2,
  carrierName: (rate) => rate.carrierName
});
assert.equal(quoteDetailsAllMetrics.totalCount, 3, "quote detail metrics should keep the original total count");
assert.equal(quoteDetailsAllMetrics.matchingCount, 3, "empty search should match all original rates");
assert.equal(quoteDetailsAllMetrics.visibleCount, 2, "quote detail metrics should keep visible rates separate from matching rates");
assert.equal(quoteDetailsAllMetrics.lowestPrice, 80, "quote detail summary should use the original lowest price");
assert.equal(quoteDetailsAllMetrics.badgeForRate(quoteDetailRates[0]).lowestPrice, true, "best-price badge should be based on original rates");
const quoteDetailsSearchMetrics = customerQuoteRateMetrics(quoteDetailRates, {
  search: "xpress",
  sort: "lowestPrice",
  visibleCount: 12,
  carrierName: (rate) => rate.carrierName
});
assert.equal(quoteDetailsSearchMetrics.totalCount, 3, "search should not change the original total count");
assert.equal(quoteDetailsSearchMetrics.matchingCount, 1, "search should track matching rates separately");
assert.equal(quoteDetailsSearchMetrics.visibleCount, 1, "search should track visible rates separately");
assert.equal(quoteDetailsSearchMetrics.lowestPrice, 80, "search should not change summary lowest price");
assert.equal(quoteDetailsSearchMetrics.badgeForRate(quoteDetailRates[1]).lowestPrice, false, "filtered-only rates should not become best price badges");
const quoteDetailsLoadMoreMetrics = customerQuoteRateMetrics(quoteDetailRates, {
  search: "a",
  sort: "fastestTransit",
  visibleCount: 24,
  carrierName: (rate) => rate.carrierName
});
assert.equal(quoteDetailsLoadMoreMetrics.matchingCount, 2, "load-more calculations should preserve search state");
assert.deepEqual(
  quoteDetailsLoadMoreMetrics.visibleRates.map((rate) => rate.id),
  ["xpress", "saia"],
  "load-more calculations should preserve sort state"
);

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
const aggregatedAttentionItems = aggregateReadyQuoteAttentionItems(model.attentionItems);
assert.deepEqual(
  aggregatedAttentionItems.map((item) => item.type),
  ["shipment_exception", "invoice_overdue", "invoice_due_soon", "ready_quote_group"],
  "same-route ready quotes should aggregate without merging invoice or shipment alerts"
);
const readyGroup = aggregatedAttentionItems.find((item) => item.type === "ready_quote_group");
assert.equal(readyGroup.quotes.length, 2, "same-route ready quote group should retain matching quote count");
assert.equal(readyGroup.rateCount, 2, "same-route ready quote group should include available-rate count");
assert.equal(readyGroup.lowestSellPrice, 80, "same-route ready quote group should expose the lowest customer sell price");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const renderCustomerDashboardSlice = app.slice(app.indexOf("function renderCustomerDashboard"), app.indexOf("function customerKpiGridHtml"));
const renderStaffDashboardSlice = app.slice(app.indexOf("function renderStaffDashboard"), app.indexOf("function staffDashboardShellHtml"));
const viewMetaSlice = app.slice(app.indexOf("const viewMeta"), app.indexOf("document.addEventListener"));
const customerQuoteRowSlice = app.slice(app.indexOf("function customerQuoteRowHtml"), app.indexOf("function customerQuoteStatusBadgeHtml"));
const quoteStatusBadgeSlice = app.slice(app.indexOf("function customerQuoteStatusBadgeHtml"), app.indexOf("function currentCustomer"));
const needsAttentionSlice = app.slice(app.indexOf("function needsAttentionSectionHtml"), app.indexOf("function recentQuotesSectionHtml"));
const customerQuoteDetailsSlice = app.slice(app.indexOf("function customerQuoteDetailsHtml"), app.indexOf("function quoteDetailsHtml"));
const customerQuoteRateCardSlice = app.slice(app.indexOf("function customerQuoteRateCardHtml"), app.indexOf("function customerRateBadgesHtml"));
const employeeQuoteDetailsSlice = app.slice(app.indexOf("function quoteDetailsHtml"), app.indexOf("function bookingConfirmationHtml"));
const documentErrorSlice = app.slice(app.indexOf('if (loadState === "error")'), app.indexOf("  const bol = filterShipmentDocumentsByKind"));
const openQuoteDetailsSlice = app.slice(app.indexOf("async function openQuoteDetails"), app.indexOf("function resetCustomerQuoteDetailsControls"));
const searchUpdateSlice = app.slice(app.indexOf("function updateCustomerQuoteDetailsSearch"), app.indexOf("function loadMoreCustomerQuoteDetailsRates"));
const rateResultsUpdateSlice = app.slice(app.indexOf("function updateCustomerQuoteRateResults"), app.indexOf("function cssAttributeEscape"));
const confirmPendingBookingSlice = app.slice(app.indexOf("async function confirmPendingBooking"), app.indexOf("async function openInvoiceDetails"));
const bookingConfirmationSlice = app.slice(app.indexOf("function bookingConfirmationHtml"), app.indexOf("function shipmentDetailsHtml"));
const customerBookingConfirmationSlice = app.slice(app.indexOf("function customerBookingConfirmationHtml"), app.indexOf("function staffBookingConfirmationHtml"));
const staffBookingConfirmationSlice = app.slice(app.indexOf("function staffBookingConfirmationHtml"), app.indexOf("function shipmentDetailsHtml"));
assert.match(app, /function renderDashboard\(\) {\n\s+if \(isCustomerUser\(\)\) {\n\s+renderCustomerDashboard\(\);/, "customer and employee dashboards should use separate render paths");
assert.match(app, /function renderStaffDashboard\(\)/, "staff dashboard path should be preserved");
assert.doesNotMatch(renderCustomerDashboardSlice, /className\s*=\s*"view active"|classList\.(?:add|toggle)\("active"/, "customer dashboard renderer must not own active view state");
assert.doesNotMatch(renderStaffDashboardSlice, /className\s*=\s*"view active"|classList\.(?:add|toggle)\("active"/, "staff dashboard renderer must not own active view state");
assert.match(app, /document\.querySelectorAll\("\.view"\)\.forEach\(\(view\) => {\n\s+view\.classList\.toggle\("active", view\.id === `\$\{name\}View`\);/, "setView should be the single owner of active view state");
assert.match(app, /setView\(button\.dataset\.view, \{ resetCustomerFilter: true \}\)/, "side navigation should reset customer filters to all");
assert.match(app, /data-staff-dashboard-action="customers"/, "employee customer dashboard actions should navigate to Customer Management instead of old KPI modals");
assert.doesNotMatch(app.slice(app.indexOf("function customerKpiGridHtml"), app.indexOf("function renderQuoteResults")), /Customers KPI|customerCount|carrierCost|margin|markup|providerScac|carrierAudit|carrierExclusionAudit|rawCarrierResponse/, "customer dashboard render path should not include internal pricing or provider fields");
assert.doesNotMatch(viewMetaSlice, /Welcome back, \{companyName\}/, "dashboard topbar should not duplicate the customer welcome headline");
assert.match(viewMetaSlice, /\? \[t\("Dashboard"\), t\("Review your current shipping activity\."\)\]/, "customer Dashboard topbar should use the generic Dashboard title and shipping activity subtitle");
assert.equal((renderCustomerDashboardSlice.match(/Welcome back, \{companyName\}/g) || []).length, 1, "customer hero should be the only dashboard welcome headline");
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
assert.match(renderCustomerDashboardSlice, /aggregateReadyQuoteAttentionItems\(model\.attentionItems\)/, "customer dashboard should aggregate same-route ready quote attention rows");
assert.match(needsAttentionSlice, /items\.slice\(0, 3\)/, "Needs Attention preview should be limited to three rows");
assert.match(needsAttentionSlice, /\{count\} more items/, "Needs Attention should show a customer-friendly more-items count");
assert.match(needsAttentionSlice, /Quote \{quoteNumber\}/, "ready quote attention rows should include a distinguishing quote number");
assert.match(needsAttentionSlice, /Lowest price/, "ready quote attention rows should include lowest customer sell price");
assert.match(needsAttentionSlice, /available rate\(s\)/, "ready quote attention rows should include available-rate count");
assert.match(needsAttentionSlice, /formatDateTime\(item\.date\)/, "ready quote attention rows should include created date and time");
assert.match(app, /function renderQuotesView\(\)/, "customer Quotes view renderer should exist");
assert.match(html, /id="quotesNavButton"/, "customer Quotes navigation item should exist");
assert.match(html, /id="quotesView"/, "customer Quotes view should exist");
assert.match(customerQuoteRowSlice, /available rate\(s\)/, "customer quote rows should show rate counts");
assert.match(customerQuoteRowSlice, /Lowest price/, "customer quote rows should show the lowest customer sell price");
assert.match(customerQuoteRowSlice, /Quote \{quoteNumber\}/, "customer quote rows should show a customer-safe quote number");
assert.match(customerQuoteRowSlice, /formatDateTime\(quote\.createdAt\)/, "customer quote rows should show full created date and time");
assert.match(customerQuoteRowSlice, /customerQuoteStatusBadgeHtml\(quote\)/, "customer quote rows should render a real status badge");
assert.match(quoteStatusBadgeSlice, /"Ready to Book": "blue"/, "ready quote badge should use the blue status treatment");
assert.match(quoteStatusBadgeSlice, /Booked: "green"/, "booked quote badge should use the green status treatment");
assert.match(quoteStatusBadgeSlice, /"No Rates": "neutral"/, "no-rates quote badge should use a neutral status treatment");
assert.match(quoteStatusBadgeSlice, /Expired: "gray"/, "expired quote badge should use the gray status treatment");
assert.match(quoteStatusBadgeSlice, /Exception: "red"/, "exception quote badge should use the red status treatment");
assert.match(customerQuoteRowSlice, /data-view-quote/, "customer quote rows should allow viewing a quote");
assert.match(customerQuoteRowSlice, /data-reenter-quote/, "customer quote rows should allow repeating a quote");
assert.doesNotMatch(customerQuoteRowSlice, /carrierAudit|carrierExclusionAudit|rawCarrierResponse|providerScac|carrierCost|margin|markup|Mothership|SpeedShip|Priority1/, "customer quote rows should not expose carrier diagnostics or internal pricing");
assert.doesNotMatch(renderCustomerDashboardSlice, /quickActionsPanelHtml|Quick Actions/, "duplicated Quick Actions panel should not render in the dashboard lower row");
assert.match(renderCustomerDashboardSlice, /customer-dashboard-lower customer-dashboard-lower-full/, "Recent Quotes should use the full-width lower dashboard layout");
assert.match(renderCustomerDashboardSlice, /View Saved Addresses/, "saved-address action should move to compact customer auxiliary actions");
assert.match(renderCustomerDashboardSlice, /Contact Support/, "support action should move to compact customer auxiliary actions");
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
assert.match(styles, /customer-dashboard-lower-full[\s\S]*grid-template-columns: 1fr/, "Recent Quotes full-width layout should exist");
assert.match(styles, /action-empty[\s\S]*min-height: 132px/, "empty active shipment state should stay compact");
assert.doesNotMatch(styles, /action-empty[\s\S]*min-height:\s*(?:2\d\d|3\d\d|4\d\d)px/, "empty active shipment state should not use excessive min-height");
assert.match(styles, /customer-session #refreshButton\.refresh-action/, "customer Refresh should be visually secondary");
assert.match(app, /refreshButton\.classList\.toggle\("primary-action", false\)/, "Refresh should not remain a primary action");
assert.match(app, /refreshButton\.classList\.toggle\("secondary-action", true\)/, "Refresh should be visually secondary");
assert.match(app, /const identifier = state\.user\.email \|\| state\.user\.username \|\| state\.user\.name \|\| "";/, "customer chip should show email or username separately");
assert.match(app, /sidebarHealth\.classList\.toggle\("hidden", Boolean\(state\.user && isCustomerUser\(\) && state\.health\?\.ok\)\)/, "customer should not see the low-level server-ready indicator");
assert.match(app, /const message = state\.health\?\.ok \? t\("Server ready"\) : t\("Checking server"\);/, "employee health indicator message should remain unchanged");
assert.match(styles, /customer-filter-bar/, "customer filter chip layout should exist");
assert.match(styles, /repeat\(auto-fit, minmax\(92px, 1fr\)\)/, "mobile nav should adapt when customer Quotes nav is visible");
assert.match(app, /"Customer Portal": "客户门户"/, "Customer Portal Chinese translation should exist");
assert.match(app, /"My Quotes": "我的报价"/, "customer Quotes Chinese navigation should use 我的报价");
assert.match(app, /"New Quote": "新建报价"/, "customer New Quote Chinese navigation should use 新建报价");
assert.match(app, /"My Shipments": "我的货件"/, "customer Shipments Chinese navigation should use 我的货件");
assert.match(app, /"Track Shipment": "查询货件"/, "customer Track Shipment Chinese terminology should be consistent");
assert.match(app, /"Tracking": "运输轨迹"/, "customer Tracking Chinese terminology should be consistent");
assert.match(app, /"My Invoices": "我的账单"/, "customer Invoices Chinese navigation should use 我的账单");
assert.match(app, /"Welcome back, \{companyName\}": "欢迎回来，\{companyName\}"/, "welcome translation should exist");
assert.match(app, /"Clear Filter": "清除筛选"/, "Clear Filter Chinese translation should exist");
assert.match(app, /"Documents could not be loaded\.": "文件加载失败。"/, "document failure Chinese translation should exist");
assert.match(app, /"Try Again": "重试"/, "document retry Chinese translation should exist");
assert.match(app, /"Status Pending": "状态待更新"/, "pending invoice status Chinese translation should exist");

assert.match(customerQuoteRateCardSlice, /<small>\$\{escapeHtml\(t\("Your Price"\)\)\}<\/small>/, "every customer quote detail rate should label sellPrice as Your Price");
assert.match(customerQuoteRateCardSlice, /customerRatePriceHtml\(rate\)/, "customer quote detail rate cards should render customer-safe sellPrice");
assert.match(customerQuoteDetailsSlice, /function customerRatePriceHtml\(rate\)/, "customer price formatter should exist");
assert.match(customerQuoteDetailsSlice, /validSellPrice\(rate\)/, "customer price formatter should use rate.sellPrice validation");
assert.match(customerQuoteDetailsSlice, /Price unavailable/, "missing sellPrice should display Price unavailable");
assert.doesNotMatch(customerQuoteDetailsSlice, /\$0\.00|carrierCost|markup|margin|providerScac|carrierAudit|carrierExclusionAudit|rawCarrierResponse|carrierSource|carrierQuoteId|carrierRateId/, "customer quote detail HTML should not expose internal carrier or pricing fields");
assert.match(customerQuoteRateCardSlice, /rateBookingAllowedForUser\(quote, rate\)/, "per-rate booking should use rateBookingAllowedForUser");
assert.match(customerQuoteRateCardSlice, /accountBookingAllowed/, "account booking restrictions should be checked before rendering per-rate booking helpers");
assert.match(customerQuoteRateCardSlice, /bookingVisible && accountBookingAllowed/, "account-disabled customers should not see repeated per-rate unavailable helpers");
assert.match(app, /state\.currentQuote\?\.id === quoteId \? state\.currentQuote : state\.quotes\.find/, "booking confirmation should resolve the clicked quote ID instead of blindly using currentQuote");
assert.match(customerQuoteRateCardSlice, /data-book-quote="\$\{escapeHtml\(quote\.id\)\}"/, "per-rate booking buttons should carry the quote ID");
assert.match(customerQuoteRateCardSlice, /Booking unavailable for this carrier\./, "disabled customer rates should show a compact helper instead of an active booking button");
assert.match(customerQuoteDetailsSlice, /customerQuoteBookingControlsVisible\(quote\)/, "customer quote details should suppress booking controls for terminal quotes");
assert.match(customerQuoteDetailsSlice, /\["expired", "cancelled", "failed", "booked"\]/, "expired, cancelled, failed, and booked quotes should not show active booking buttons");
assert.match(app, /if \(\["expired", "cancelled", "failed", "booked"\]\.includes\(status\) \|\| quoteHasShipment\(quote, state\.shipments\)\)/, "customer booking eligibility should reject terminal quotes and linked shipments");
assert.match(app, /if \(!Number\.isFinite\(validSellPrice\(rate\)\)\)/, "customer booking eligibility should reject rates without a valid sellPrice");
assert.match(app, /if \(rate\?\.bookingAllowed === false\)/, "customer booking eligibility should honor rate-level booking denial");
assert.match(app, /return customerBookingAllowed\(quote\?\.customerId, rate\?\.carrierSource \|\| quote\?\.carrierMode\)/, "rate-level allow flags must not override account-level booking restrictions");
assert.match(customerQuoteDetailsSlice, /data-customer-quote-reenter/, "Use as New Quote should appear in the sticky header");
assert.match(customerQuoteDetailsSlice, /data-customer-quote-close/, "sticky customer quote header should include a close action");
assert.doesNotMatch(customerQuoteDetailsSlice, /Re-enter Quote/, "customer quote details should not keep the old bottom Re-enter Quote button");
assert.match(customerQuoteDetailsSlice, /customerQuoteSummaryHtml\(quote, originalRates, lowest\)/, "customer quote details should render a structured quote summary from original rates");
assert.match(customerQuoteDetailsSlice, /function renderCustomerQuoteDetailsShell\(quote\)/, "customer quote details should render a stable shell before populating rates");
assert.match(customerQuoteDetailsSlice, /function renderCustomerQuoteRateResults\(quote\)/, "customer quote details should render rate results separately from the modal shell");
assert.match(customerQuoteDetailsSlice, /data-customer-quote-rate-list/, "customer quote details should keep a stable rate-list mount point");
assert.match(customerQuoteDetailsSlice, /data-customer-quote-rate-count/, "customer quote details should keep a stable rate-count mount point");
assert.match(customerQuoteDetailsSlice, /data-customer-quote-rate-footer/, "customer quote details should keep a stable load-more footer mount point");
assert.match(openQuoteDetailsSlice, /renderCustomerQuoteDetailsShell\(quote\)/, "opening customer quote details should render the shell once");
assert.match(openQuoteDetailsSlice, /updateCustomerQuoteRateResults\(quoteId\)/, "opening customer quote details should populate the rate results after mounting the shell");
assert.match(searchUpdateSlice, /updateCustomerQuoteRateResults\(quoteId\)/, "searching customer quote details should update only the rate results");
assert.doesNotMatch(searchUpdateSlice, /paintModal|openModal|renderCustomerQuoteDetailsShell/, "searching customer quote details should not repaint the whole modal");
assert.match(rateResultsUpdateSlice, /innerHTML = rendered\.listHtml/, "rate result updates should replace only the rate list");
assert.doesNotMatch(rateResultsUpdateSlice, /modalBody|paintModal|openModal/, "rate result updates should not replace the modal body");
assert.match(customerQuoteDetailsSlice, /originalRates = customerVisibleRates\(quote\)/, "customer quote details should keep original rates separate from filtered rates");
assert.match(customerQuoteDetailsSlice, /filteredRates = filterCustomerQuoteRates/, "customer quote details should keep filtered rates separate");
assert.match(customerQuoteDetailsSlice, /visibleRates = sortedFilteredRates\.slice/, "customer quote details should keep visible rates separate");
assert.match(customerQuoteDetailsSlice, /Showing \{visible\} of \{matching\} matching rates · \{total\} total/, "searched quote details should explain visible, matching, and total counts");
assert.match(customerQuoteDetailsSlice, /Pickup accessorials/, "customer quote summary should include pickup accessorials");
assert.match(customerQuoteDetailsSlice, /Delivery accessorials/, "customer quote summary should include delivery accessorials");
assert.match(customerQuoteDetailsSlice, /Rates quoted on \{dateTime\}/, "customer quote details should show quote creation time");
assert.match(app, /visibleCount: 12/, "customer quote details should default to 12 visible rates");
assert.match(app, /loadMoreCustomerQuoteDetailsRates/, "customer quote details should support Load More");
assert.match(app, /updateCustomerQuoteDetailsSearch/, "customer quote details should support carrier search");
assert.match(customerQuoteDetailsSlice, /lowestPrice/, "customer quote details should support Lowest Price sorting");
assert.match(customerQuoteDetailsSlice, /fastestTransit/, "customer quote details should support Fastest Transit sorting");
assert.match(customerQuoteDetailsSlice, /earliestEta/, "customer quote details should support Earliest ETA sorting");
assert.match(customerQuoteDetailsSlice, /price === lowestPrice/, "Lowest Price badge should support ties");
assert.match(customerQuoteDetailsSlice, /transit === fastestTransit/, "Fastest badge should support ties");
assert.match(customerQuoteDetailsSlice, /Online booking is not enabled for this account/, "customer booking-disabled notice should use compact customer-safe copy");
assert.match(styles, /customer-quote-details-header[\s\S]*position: sticky/, "customer quote details header should stay sticky");
assert.match(styles, /customer-quote-details-modal \.modal-header[\s\S]*clip-path: inset\(50%\)/, "customer quote details should visually hide the generic modal header while preserving aria-labelledby");
assert.match(styles, /compact-notice[\s\S]*padding: 10px 12px/, "booking-disabled notice should remain compact");
assert.match(styles, /customer-rate-toolbar/, "customer quote rate controls should be styled");
assert.match(styles, /customer-quote-rate-card[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(160px, auto\)/, "desktop rate row should keep price and booking action on the right");
assert.match(employeeQuoteDetailsSlice, /Quote Audit/, "employee quote audit screen should remain available");
assert.match(employeeQuoteDetailsSlice, /quoteAuditHtml\(quote\)/, "employee quote details should retain quote audit rendering");
assert.match(app, /"Your Price": "您的报价"/, "Your Price Chinese translation should exist");
assert.match(app, /"Price unavailable": "价格暂不可用"/, "Price unavailable Chinese translation should exist");
assert.match(app, /"Book Shipment": "订舱"/, "Book Shipment Chinese translation should be 订舱");
assert.match(app, /"Use as New Quote": "复制为新报价"/, "Use as New Quote Chinese translation should exist");
assert.match(app, /"Close": "关闭"/, "Close Chinese translation should exist");
assert.match(app, /"Lowest Price": "最低价格"/, "Lowest Price Chinese translation should exist");
assert.match(app, /"Fastest Transit": "最快运输"/, "Fastest Transit Chinese translation should exist");
assert.match(app, /"Earliest ETA": "最早送达"/, "Earliest ETA Chinese translation should exist");
assert.match(app, /"Search carrier": "搜索承运商"/, "Search carrier Chinese translation should exist");
assert.match(app, /"Load More": "加载更多"/, "Load More Chinese translation should exist");
assert.match(app, /"Showing \{visible\}\/\{total\} rates": "当前显示 \{visible\}\/\{total\} 条报价"/, "showing rate count Chinese translation should exist");
assert.match(app, /"Showing \{visible\} of \{total\} rates": "当前显示 \{visible\}\/\{total\} 条报价"/, "customer quote detail visible-total Chinese translation should exist");
assert.match(app, /"Showing \{visible\} of \{matching\} matching rates · \{total\} total": "当前显示 \{visible\}\/\{matching\} 条匹配报价 · 共 \{total\} 条"/, "customer quote detail search-count Chinese translation should exist");

assert.match(bookingConfirmationSlice, /if \(customerView\) {\n\s+return customerBookingConfirmationHtml\(quote, rate\);/, "customer booking confirmation should use a dedicated customer-safe renderer");
assert.match(customerBookingConfirmationSlice, /<small>\$\{t\("Your Price"\)\}<\/small>/, "customer booking confirmation should label sellPrice as Your Price");
assert.match(customerBookingConfirmationSlice, /Number\.isFinite\(price\) \? money\.format\(price\) : escapeHtml\(t\("Price unavailable"\)\)/, "customer booking confirmation should not fall back to $0.00 for missing prices");
assert.doesNotMatch(customerBookingConfirmationSlice, /<small>\$\{t\("Cost"\)\}<\/small>|carrierCost|markup|margin/, "customer booking confirmation should not show internal cost terminology or pricing fields");
assert.doesNotMatch(customerBookingConfirmationSlice, /Mothership|SpeedShip|Priority1|providerScac|provider ID|providerId|carrierSource|carrierQuoteId|carrierRateId|Mothership status|Booking blocked by Mothership|Purchase eligibility|Fix these fields|invalidFields|Pickup suggestions|Delivery suggestions|rawCarrierResponse|pickupSuggestedAccessorials|deliverySuggestedAccessorials/, "customer booking confirmation should not expose source-platform diagnostics");
assert.match(customerBookingConfirmationSlice, /This rate cannot be booked online\. Please choose another rate or contact customer service\./, "blocked customer purchase validation should use a generic customer-safe message");
assert.match(customerBookingConfirmationSlice, /data-confirm-booking \$\{bookingBlocked \? "disabled" : ""\}/, "blocked customer purchase validation should disable Confirm Booking");
assert.match(customerBookingConfirmationSlice, /This will submit the selected rate for shipment booking\. Please confirm before continuing\./, "customer booking confirmation should use customer-safe confirmation wording");
assert.match(customerBookingConfirmationSlice, /carrierNameLabel\(rate, quote, true\)/, "customer booking confirmation should show the customer-safe actual carrier name");
assert.match(confirmPendingBookingSlice, /isCustomerUser\(\)\n\s+\? t\("This rate cannot be booked online\. Please choose another rate or contact customer service\."\)/, "direct customer confirmation blocks should use the generic customer-safe message");
assert.match(confirmPendingBookingSlice, /await finalizeBooking\(quote\.id, rate\.id\)/, "valid customer booking should still reach the existing booking flow");
assert.match(staffBookingConfirmationSlice, /Mothership status/, "staff booking confirmation should retain provider purchase diagnostics");
assert.match(staffBookingConfirmationSlice, /Booking blocked by Mothership/, "staff booking confirmation should retain provider-specific blocked diagnostics");
assert.match(staffBookingConfirmationSlice, /Purchase eligibility/, "staff booking confirmation should retain purchase eligibility details");
assert.match(staffBookingConfirmationSlice, /Pickup suggestions/, "staff booking confirmation should retain pickup suggestion details");
assert.match(staffBookingConfirmationSlice, /Delivery suggestions/, "staff booking confirmation should retain delivery suggestion details");
assert.match(staffBookingConfirmationSlice, /<small>\$\{t\("Cost"\)\}<\/small>/, "staff booking confirmation may retain internal Cost label");
assert.match(app, /"This will submit the selected rate for shipment booking\. Please confirm before continuing\.": "系统将使用所选报价提交订舱，请确认信息后继续。"/, "customer-safe confirmation wording Chinese translation should exist");
assert.match(app, /"This rate cannot be booked online\. Please choose another rate or contact customer service\.": "此报价暂无法在线订舱，请选择其他报价或联系客服。"/, "customer-safe blocked booking Chinese translation should exist");

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
