const openInvoiceStatuses = new Set(["draft", "open", "pending", "unpaid", "due", "overdue", "imported"]);
const paidInvoiceStatuses = new Set(["paid", "settled"]);
const closedInvoiceStatuses = new Set(["void", "cancelled", "canceled", "closed", "refunded", "written_off", "written off"]);
const activeShipmentStatuses = new Set(["booked", "booked_with_carrier", "pickup_scheduled", "scheduled", "pickup_appointment", "picked_up", "pickup_complete", "in_transit", "transit", "out_for_delivery", "ofd"]);
const shipmentExceptionStatuses = new Set(["exception", "delayed", "rejected", "failed", "error"]);
const terminalQuoteStatuses = new Set(["booked", "cancelled", "canceled", "failed", "error", "rejected", "expired"]);
const customerTimestampToleranceMs = 1000;

export const adminDateRanges = ["today", "last7", "last30", "all"];
export const adminCarrierModes = [
  { key: "mothershipSandbox", name: "Mothership", aliases: ["mothership", "mothership_sandbox", "mothershipsandbox"] },
  { key: "speedshipLtl", name: "SpeedShip", aliases: ["speedship", "speedship_ltl", "speedshipltl", "speedshipLtl"] },
  { key: "priority1Ltl", name: "Priority1", aliases: ["priority1", "priority_1", "priority1_ltl", "priority1ltl", "p1"] },
  { key: "fedexFreight", name: "FedEx Freight", aliases: ["fedex", "fedex_freight", "fedexfreight", "fxfe"] }
];

export function adminDateRangeBounds(range = "last7", now = new Date()) {
  const selected = adminDateRanges.includes(range) ? range : "last7";
  if (selected === "all") {
    return { key: selected, start: null, end: null };
  }
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (selected === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (selected === "last30") {
    start.setDate(start.getDate() - 29);
  }
  return { key: selected, start, end };
}

export function recordInDateRange(record, range, field = "createdAt", now = new Date()) {
  const bounds = typeof range === "object" && range ? range : adminDateRangeBounds(range, now);
  if (!bounds.start && !bounds.end) {
    return true;
  }
  const date = parseReliableDate(record?.[field]);
  return Boolean(date && (!bounds.start || date >= bounds.start) && (!bounds.end || date <= bounds.end));
}

export function normalizeAdminInvoiceStatus(status) {
  const value = normalizeToken(status);
  if (openInvoiceStatuses.has(value)) {
    return value === "overdue" ? "overdue" : value === "draft" ? "draft" : "open";
  }
  if (paidInvoiceStatuses.has(value)) {
    return "paid";
  }
  if (closedInvoiceStatuses.has(value)) {
    return "closed";
  }
  return "unknown";
}

export function normalizeAdminShipmentStatus(status) {
  const value = normalizeToken(status);
  if (shipmentExceptionStatuses.has(value)) {
    return "exception";
  }
  if (activeShipmentStatuses.has(value)) {
    return "active";
  }
  if (["delivered", "completed", "complete"].includes(value)) {
    return "delivered";
  }
  if (["cancelled", "canceled", "void"].includes(value)) {
    return "cancelled";
  }
  return "unknown";
}

export function normalizeAdminQuoteStatus(status) {
  const value = normalizeToken(status);
  if (["booked", "converted", "shipment_created"].includes(value)) {
    return "booked";
  }
  if (["cancelled", "canceled"].includes(value)) {
    return "cancelled";
  }
  if (["failed", "error", "rejected"].includes(value)) {
    return "failed";
  }
  if (value === "expired") {
    return "expired";
  }
  if (["quoted", "ready", "ready_to_book"].includes(value)) {
    return "ready";
  }
  return "pending";
}

export function quoteHasUsableRates(quote) {
  return countUsableRates(quote) > 0;
}

export function validAdminSellPrice(rate) {
  const raw = rate?.sellPrice;
  if (raw === null || raw === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return Number.POSITIVE_INFINITY;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

export function countUsableRates(quote) {
  return Array.isArray(quote?.rates) ? quote.rates.filter((rate) => Number.isFinite(validAdminSellPrice(rate))).length : 0;
}

export function lowestUsableSellPrice(quote) {
  return Array.isArray(quote?.rates)
    ? quote.rates.reduce((lowest, rate) => Math.min(lowest, validAdminSellPrice(rate)), Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;
}

export function quoteLinkedShipment(quote, shipments = []) {
  return shipments.some((shipment) => shipment?.quoteId && shipment.quoteId === quote?.id);
}

export function isAdminReadyToBookQuote(quote, shipments = []) {
  return quoteHasUsableRates(quote) &&
    !terminalQuoteStatuses.has(normalizeToken(quote?.status)) &&
    !quoteLinkedShipment(quote, shipments);
}

export function quoteCarrierAuditSummary(quote) {
  const rows = Array.isArray(quote?.carrierAudit) ? quote.carrierAudit : [];
  const excludedRows = rows.filter((row) => row?.excluded);
  const attemptedRows = rows.filter((row) => !row?.excluded);
  const failedRows = attemptedRows.filter(isFailedCarrierAuditRow);
  const successRows = attemptedRows.filter(isSuccessfulCarrierAuditRow);
  return {
    requested: attemptedRows.length,
    attempted: attemptedRows.length,
    failed: failedRows.length,
    succeeded: successRows.length,
    excluded: excludedRows.length,
    partialFailure: successRows.length > 0 && failedRows.length > 0,
    allFailed: attemptedRows.length > 0 && failedRows.length === attemptedRows.length
  };
}

export function isAdminQuoteIssue(quote) {
  if (isPreferenceExcludedQuote(quote)) {
    return false;
  }
  const status = normalizeAdminQuoteStatus(quote?.status);
  const audit = quoteCarrierAuditSummary(quote);
  if (["failed", "pending"].includes(status) && !quoteHasUsableRates(quote)) {
    return true;
  }
  return !quoteHasUsableRates(quote) || audit.allFailed || audit.partialFailure || String(quote?.errorCode || quote?.carrierMessage || "").toLowerCase().includes("timeout");
}

export function adminDashboardMetrics({ quotes = [], shipments = [], invoices = [] }, range = "last7", now = new Date()) {
  const bounds = adminDateRangeBounds(range, now);
  const rangeQuotes = quotes.filter((quote) => recordInDateRange(quote, bounds));
  const rangeShipments = shipments.filter((shipment) => recordInDateRange(shipment, bounds));
  const rangeInvoices = invoices.filter((invoice) => recordInDateRange(invoice, bounds));
  return {
    quotesCreated: rangeQuotes.length,
    readyToBook: rangeQuotes.filter((quote) => isAdminReadyToBookQuote(quote, shipments)).length,
    quoteIssues: rangeQuotes.filter(isAdminQuoteIssue).length,
    activeShipments: rangeShipments.filter((shipment) => normalizeAdminShipmentStatus(shipment?.status) === "active").length,
    shipmentExceptions: rangeShipments.filter((shipment) => normalizeAdminShipmentStatus(shipment?.status) === "exception").length,
    openInvoices: rangeInvoices.filter((invoice) => ["draft", "open", "overdue"].includes(normalizeAdminInvoiceStatus(invoice?.status))).length
  };
}

export function adminQuoteMatchesFilter(quote, filter = "all", shipments = [], now = new Date()) {
  if (filter === "all") return true;
  if (filter === "today") return recordInDateRange(quote, "today", "createdAt", now);
  const status = normalizeAdminQuoteStatus(quote?.status);
  const audit = quoteCarrierAuditSummary(quote);
  if (filter === "ready") return isAdminReadyToBookQuote(quote, shipments);
  if (filter === "issues") return isAdminQuoteIssue(quote);
  if (filter === "noRates") return !quoteHasUsableRates(quote) && !isPreferenceExcludedQuote(quote);
  if (filter === "customerPreferences") return isPreferenceExcludedQuote(quote);
  if (filter === "partialFailure") return audit.partialFailure;
  if (filter === "failed") return status === "failed" || audit.allFailed;
  if (filter === "booked") return status === "booked" || quoteLinkedShipment(quote, shipments);
  if (filter === "cancelled") return status === "cancelled";
  if (filter === "expired") return status === "expired";
  return true;
}

export function adminRecordMatchesDateRange(record, range = "all", field = "createdAt", now = new Date()) {
  return recordInDateRange(record, range || "all", field, now);
}

export function adminShipmentMatchesFilter(shipment, filter = "all") {
  const status = normalizeAdminShipmentStatus(shipment?.status);
  return filter === "all" ||
    (filter === "active" && status === "active") ||
    (filter === "exceptions" && status === "exception") ||
    (filter === "delivered" && status === "delivered") ||
    (filter === "cancelled" && status === "cancelled");
}

export function adminInvoiceMatchesFilter(invoice, filter = "all", now = new Date()) {
  const status = normalizeAdminInvoiceStatus(invoice?.status);
  const dueDate = parseReliableDate(invoice?.dueAt || invoice?.dueDate);
  return filter === "all" ||
    (filter === "draft" && status === "draft") ||
    (filter === "open" && ["draft", "open", "overdue"].includes(status)) ||
    (filter === "overdue" && (status === "overdue" || (status === "open" && dueDate && dueDate < now))) ||
    (filter === "paid" && status === "paid") ||
    (filter === "importIssues" && status === "unknown");
}

export function adminQuoteConversion({ quotes = [], shipments = [] }, range = "last7", now = new Date()) {
  const rangeQuotes = quotes.filter((quote) => recordInDateRange(quote, range, "createdAt", now));
  const quoteIds = new Set(rangeQuotes.map((quote) => quote?.id).filter(Boolean));
  const linkedShipments = shipments.filter((shipment) => shipment?.quoteId && quoteIds.has(shipment.quoteId));
  const bookedShipments = linkedShipments.filter((shipment) => ["active", "delivered"].includes(normalizeAdminShipmentStatus(shipment?.status)));
  const deliveredShipments = linkedShipments.filter((shipment) => normalizeAdminShipmentStatus(shipment?.status) === "delivered");
  const conversionEligibleQuotes = rangeQuotes.filter((quote) => !isPreferenceExcludedQuote(quote));
  const withRates = conversionEligibleQuotes.filter(quoteHasUsableRates).length;
  const created = rangeQuotes.length;
  return {
    quotesCreated: created,
    quotesWithRates: withRates,
    readyToBook: rangeQuotes.filter((quote) => isAdminReadyToBookQuote(quote, shipments)).length,
    bookedShipments: bookedShipments.length,
    deliveredShipments: deliveredShipments.length,
    quoteSuccessRate: created > 0 ? withRates / created : null,
    quoteToBookingRate: created > 0 ? bookedShipments.length / created : null
  };
}

export function adminAttentionItems({ quotes = [], shipments = [], invoices = [], customers = [], tariffs = [] }, range = "last7", now = new Date()) {
  const bounds = adminDateRangeBounds(range, now);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const items = [];
  shipments.filter((shipment) => recordInDateRange(shipment, bounds)).forEach((shipment) => {
    const status = normalizeAdminShipmentStatus(shipment?.status);
    if (status === "exception" || normalizeToken(shipment?.status).includes("booking_failed")) {
      items.push(attentionItem("shipment_exception", 1, shipment.customerId, shipment.id, shipment.confirmationNumber, shipment.updatedAt || shipment.createdAt, "Shipment requires operational review.", customerMap));
    }
  });
  quotes.filter((quote) => recordInDateRange(quote, bounds)).forEach((quote) => {
    const audit = quoteCarrierAuditSummary(quote);
    if (isPreferenceExcludedQuote(quote)) {
      return;
    }
    if (!quoteHasUsableRates(quote) || normalizeAdminQuoteStatus(quote?.status) === "failed" || audit.allFailed) {
      items.push(attentionItem("quote_no_rates", 2, quote.customerId, quote.id, quote.quoteNumber || quote.id, quote.createdAt, "Quote has no available rates.", customerMap));
    } else if (audit.partialFailure) {
      items.push(attentionItem("quote_partial_failure", 4, quote.customerId, quote.id, quote.quoteNumber || quote.id, quote.createdAt, "Some carrier channels did not return rates.", customerMap));
    } else if (isAdminReadyToBookQuote(quote, shipments)) {
      items.push(attentionItem("ready_quote", 7, quote.customerId, quote.id, quote.quoteNumber || quote.id, quote.createdAt, "Ready-to-book quote awaiting action.", customerMap));
    }
  });
  invoices.filter((invoice) => recordInDateRange(invoice, bounds)).forEach((invoice) => {
    const status = normalizeAdminInvoiceStatus(invoice?.status);
    const dueDate = parseReliableDate(invoice?.dueAt || invoice?.dueDate);
    if (status === "overdue" || (status === "open" && dueDate && dueDate < now)) {
      items.push(attentionItem("invoice_overdue", 3, invoice.customerId, invoice.id, invoice.invoiceNumber || invoice.id, invoice.dueAt || invoice.createdAt, "Invoice is overdue.", customerMap));
    } else if (status === "draft") {
      items.push(attentionItem("invoice_draft", 6, invoice.customerId, invoice.id, invoice.invoiceNumber || invoice.id, invoice.createdAt, "Draft invoice awaiting review.", customerMap));
    }
  });
  customers.forEach((customer) => {
    const hasTariff = tariffs.some((tariff) => tariff.customerId === customer.id);
    const modes = customer.allowedCarrierModes || customer.carrierModes || [];
    if (!hasTariff) {
      items.push(attentionItem("customer_missing_tariff", 5, customer.id, customer.id, customer.companyName || customer.id, customer.updatedAt || customer.createdAt, "Customer is missing tariff configuration.", customerMap));
    }
    if (Array.isArray(modes) && modes.length === 0) {
      items.push(attentionItem("customer_no_carriers", 5, customer.id, customer.id, customer.companyName || customer.id, customer.updatedAt || customer.createdAt, "Customer has no allowed carrier modes.", customerMap));
    }
    if (customer.disabled || customer.active === false) {
      items.push(attentionItem("customer_disabled", 5, customer.id, customer.id, customer.companyName || customer.id, customer.updatedAt || customer.createdAt, "Customer account is disabled.", customerMap));
    }
  });
  return items.sort((left, right) => left.priority - right.priority || ((parseReliableDate(right.date)?.getTime() || 0) - (parseReliableDate(left.date)?.getTime() || 0)));
}

export function adminRecentActivity({ quotes = [], shipments = [], invoices = [], customers = [] }, range = "last7", now = new Date()) {
  const bounds = adminDateRangeBounds(range, now);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const rows = [];
  quotes.forEach((quote) => {
    if (recordInDateRange(quote, bounds, "createdAt")) {
      rows.push(activity("quote_created", quote.customerId, quote.id, quote.quoteNumber || quote.id, quote.createdAt, quoteHasUsableRates(quote) ? "Quote completed with rates." : "Quote created.", customerMap));
    }
  });
  shipments.forEach((shipment) => {
    const date = shipment.updatedAt || shipment.createdAt;
    if (date && recordInDateRange({ date }, bounds, "date")) {
      rows.push(activity("shipment_updated", shipment.customerId, shipment.id, shipment.confirmationNumber || shipment.id, date, normalizeAdminShipmentStatus(shipment.status) === "active" ? "Shipment booked or moving." : "Shipment status updated.", customerMap));
    }
  });
  invoices.forEach((invoice) => {
    if (recordInDateRange(invoice, bounds, "createdAt")) {
      rows.push(activity("invoice_created", invoice.customerId, invoice.id, invoice.invoiceNumber || invoice.id, invoice.createdAt, "Invoice created or imported.", customerMap));
    }
  });
  customers.forEach((customer) => {
    const classification = classifyCustomerActivity(customer);
    if (classification.date && recordInDateRange({ date: classification.date }, bounds, "date")) {
      rows.push(activity(classification.type, customer.id, customer.id, customer.companyName || customer.id, classification.date, classification.detail, customerMap));
    }
  });
  return rows
    .filter((row) => parseReliableDate(row.date))
    .sort((left, right) => parseReliableDate(right.date).getTime() - parseReliableDate(left.date).getTime());
}

export function adminSetupChecklist({ customers = [], tariffs = [], quotes = [], health = null }) {
  const items = [];
  if (customers.length === 0) items.push({ key: "customers", label: "Add at least one customer." });
  if (customers.some((customer) => !tariffs.some((tariff) => tariff.customerId === customer.id))) items.push({ key: "tariffs", label: "Configure customer tariff rules." });
  if (!carrierModesConfigured(health)) items.push({ key: "carriers", label: "Configure at least one carrier channel." });
  if (!customers.some((customer) => isCustomerOnlineBookingEnabled(customer))) items.push({ key: "booking", label: "Enable online booking for at least one customer." });
  if (!quotes.some(quoteHasUsableRates)) items.push({ key: "quotes", label: "Create one successful quote." });
  return { total: 5, remaining: items, completed: 5 - items.length };
}

export function adminCustomerOverview({ customers = [], tariffs = [], quotes = [] }, range = "last7", now = new Date()) {
  const activeCustomers = customers.filter((customer) => !customer.disabled && customer.active !== false);
  const missingTariffCustomers = customers.filter((customer) => !tariffs.some((tariff) => tariff.customerId === customer.id));
  const noCarrierCustomers = customers.filter((customer) => Array.isArray(customer.allowedCarrierModes || customer.carrierModes || []) && (customer.allowedCarrierModes || customer.carrierModes || []).length === 0);
  const activeQuoteCustomerIds = new Set(quotes.filter((quote) => recordInDateRange(quote, range, "createdAt", now)).map((quote) => quote.customerId).filter(Boolean));
  const noActivityCustomers = customers.filter((customer) => !activeQuoteCustomerIds.has(customer.id));
  return {
    activeCustomers: activeCustomers.length,
    disabledCustomers: customers.length - activeCustomers.length,
    missingTariffRules: missingTariffCustomers.length,
    withoutCarrierModes: noCarrierCustomers.length,
    onlineBookingEnabled: customers.filter(isCustomerOnlineBookingEnabled).length,
    noQuoteActivity: noActivityCustomers.length,
    needsConfiguration: [...new Map([...missingTariffCustomers, ...noCarrierCustomers].map((customer) => [customer.id, customer])).values()].slice(0, 5)
  };
}

export function adminCarrierChannels(health = {}, quotes = []) {
  const configuredModes = health?.configuredCarrierModes || health?.carrierModes || health?.configuredCarriers;
  const carrierHealth = health?.carrierHealth || health?.carriers || {};
  return adminCarrierModes.map((mode) => {
    const modeHealth = lookupModeRecord(carrierHealth, mode.key) || {};
    const configured = resolveCarrierConfigurationState(health, mode.key, modeHealth);
    const matchingQuotes = quotes
      .map((quote) => ({
        quote,
        rows: Array.isArray(quote.carrierAudit)
          ? quote.carrierAudit.filter((row) => normalizeCarrierMode(row.mode || row.carrier || row.provider || row.carrierSource) === mode.key)
          : []
      }))
      .filter((entry) => entry.rows.length > 0);
    const successfulQuote = matchingQuotes
      .filter((entry) => entry.rows.some(isSuccessfulCarrierAuditRow))
      .map((entry) => parseReliableDate(entry.quote.createdAt))
      .filter(Boolean)
      .sort((left, right) => right - left)[0] || null;
    const latestFailure = matchingQuotes
      .flatMap((entry) => entry.rows.filter(isFailedCarrierAuditRow).map((row) => ({ row, date: parseReliableDate(entry.quote.createdAt), quote: entry.quote })))
      .filter((entry) => entry.date)
      .sort((left, right) => right.date - left.date)[0] || null;
    return {
      ...mode,
      configured,
      health: normalizeChannelHealth(modeHealth.status || modeHealth.health || "unknown"),
      bookingEnabled: modeHealth.bookingEnabled,
      lastSuccessfulQuoteAt: successfulQuote ? successfulQuote.toISOString() : "",
      lastErrorSummary: sanitizeChannelMessage(modeHealth.lastError || modeHealth.error || latestFailure?.row?.message || latestFailure?.row?.error || ""),
      failedQuoteIds: matchingQuotes
        .filter((entry) => entry.rows.some(isFailedCarrierAuditRow))
        .map((entry) => entry.quote.id)
        .filter(Boolean)
        .slice(0, 5)
    };
  });
}

export function normalizeCarrierMode(value) {
  const token = normalizeToken(value);
  const match = adminCarrierModes.find((mode) =>
    normalizeToken(mode.key) === token ||
    normalizeToken(mode.name) === token ||
    mode.aliases.some((alias) => normalizeToken(alias) === token)
  );
  return match?.key || token;
}

export function isPreferenceExcludedQuote(quote) {
  if (quote?.rateAvailability?.messageCode === "NO_RATES_AVAILABLE_BY_PREFERENCE") {
    return true;
  }
  const audit = quote?.carrierExclusionAudit;
  if (Array.isArray(audit) && audit.length > 0) {
    return true;
  }
  if (audit && typeof audit === "object" && Object.keys(audit).length > 0) {
    return true;
  }
  if (quote?.excludedByCustomerPreferences || quote?.customerPreferenceExcluded) {
    return true;
  }
  return false;
}

export function isCustomerOnlineBookingEnabled(customer) {
  if (!customer || customer.disabled || customer.active === false || customer.allowedBooking === false) {
    return false;
  }
  const allowed = normalizeModeList(customer.allowedCarrierModes || customer.carrierModes || []);
  if (allowed.length === 0) {
    return false;
  }
  const booking = normalizeModeList(customer.allowedBookingCarrierModes || []);
  if (booking.length === 0) {
    return false;
  }
  return booking.some((mode) => allowed.includes(mode));
}

export function classifyCustomerActivity(customer) {
  const createdAt = parseReliableDate(customer?.createdAt);
  const updatedAt = parseReliableDate(customer?.updatedAt);
  if (updatedAt && createdAt && updatedAt.getTime() - createdAt.getTime() > customerTimestampToleranceMs) {
    return { type: "customer_updated", date: updatedAt.toISOString(), detail: "Customer updated." };
  }
  if (createdAt) {
    return { type: "customer_created", date: createdAt.toISOString(), detail: "Customer created." };
  }
  return { type: "", date: "", detail: "" };
}

function attentionItem(type, priority, customerId, recordId, recordNumber, date, reason, customerMap) {
  return {
    type,
    priority,
    customerId,
    customerName: customerMap.get(customerId)?.companyName || customerMap.get(customerId)?.name || "Unknown customer",
    recordId,
    recordNumber,
    date,
    reason
  };
}

function activity(type, customerId, recordId, recordNumber, date, detail, customerMap) {
  return {
    type,
    customerId,
    customerName: customerMap.get(customerId)?.companyName || customerMap.get(customerId)?.name || "Unknown customer",
    recordId,
    recordNumber,
    date,
    detail
  };
}

function carrierModesConfigured(health) {
  return adminCarrierModes.some((mode) => resolveCarrierConfigurationState(health || {}, mode.key) === "configured");
}

function isFailedCarrierAuditRow(row) {
  if (row?.excluded) return false;
  const status = normalizeToken(row?.status || row?.result || "");
  if (["failed", "error", "timeout", "rejected"].includes(status)) return true;
  return Boolean(row?.error || row?.failed || row?.timedOut);
}

function isSuccessfulCarrierAuditRow(row) {
  return !row?.excluded && !isFailedCarrierAuditRow(row) && Number(row?.rateCount || row?.ratesReturned || 0) > 0;
}

function normalizeModeList(values) {
  return Array.isArray(values) ? values.map(normalizeCarrierMode).filter(Boolean) : [];
}

function carrierModeConfigured(configuredModes, modeKey) {
  if (Array.isArray(configuredModes)) {
    return configuredModes.some((mode) => normalizeCarrierMode(mode) === modeKey);
  }
  if (configuredModes && typeof configuredModes === "object") {
    return Object.entries(configuredModes).some(([key, value]) => value && normalizeCarrierMode(key) === modeKey);
  }
  return false;
}

function lookupModeRecord(records, modeKey) {
  if (!records || typeof records !== "object") return null;
  return Object.entries(records).find(([key]) => normalizeCarrierMode(key) === modeKey)?.[1] || null;
}

function resolveCarrierConfigurationState(health = {}, modeKey, modeHealth = lookupModeRecord(health?.carrierHealth || health?.carriers || {}, modeKey) || {}) {
  const explicitModeHealth = explicitConfiguredValue(modeHealth);
  if (explicitModeHealth === true) return "configured";
  if (explicitModeHealth === false) return "not_configured";

  const configuredModes = health?.configuredCarrierModes || health?.carrierModes || health?.configuredCarriers;
  if (Array.isArray(configuredModes)) {
    return carrierModeConfigured(configuredModes, modeKey) ? "configured" : "not_configured";
  }
  if (configuredModes && typeof configuredModes === "object") {
    return carrierModeConfigured(configuredModes, modeKey) ? "configured" : "not_configured";
  }

  const legacyValue = legacyConfiguredValue(health, modeKey);
  if (legacyValue === true) return "configured";
  if (legacyValue === false) return "not_configured";
  return "unknown";
}

function explicitConfiguredValue(value) {
  if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, "configured")) {
    return null;
  }
  return parseConfiguredFlag(value.configured);
}

function legacyConfiguredValue(health, modeKey) {
  const legacyFields = {
    mothershipSandbox: ["mothershipConfigured", "mothershipSandboxConfigured"],
    speedshipLtl: ["speedshipConfigured", "speedshipLtlConfigured"],
    priority1Ltl: ["priority1Configured", "priority1LtlConfigured"],
    fedexFreight: ["fedexConfigured", "fedexFreightConfigured", "fedExConfigured"]
  }[modeKey] || [];
  for (const field of legacyFields) {
    if (Object.prototype.hasOwnProperty.call(health || {}, field)) {
      return parseConfiguredFlag(health[field]);
    }
  }
  return null;
}

function parseConfiguredFlag(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const token = normalizeToken(value);
    if (["true", "1", "yes", "enabled", "configured"].includes(token)) return true;
    if (["false", "0", "no", "disabled", "not_configured", "notconfigured"].includes(token)) return false;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  return Boolean(value);
}

function normalizeChannelHealth(value) {
  const status = normalizeToken(value);
  if (["healthy", "ok", "ready"].includes(status)) return "healthy";
  if (["degraded", "warning"].includes(status)) return "degraded";
  if (["error", "failed", "down"].includes(status)) return "error";
  return "unknown";
}

function sanitizeChannelMessage(value) {
  const message = typeof value === "string"
    ? value
    : value == null
      ? ""
      : JSON.stringify(value);
  if (!message) return "";
  return message
    .replace(/\b(token|secret|password|authorization|apiKey|api_key|access_token)=([^\s&"'}]+)/gi, "$1=[redacted]")
    .replace(/(["'])(token|secret|password|authorization|apiKey|api_key|access_token)\1\s*:\s*(["'])(.*?)\3/gi, "$1$2$1: $3[redacted]$3")
    .replace(/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Authorization: Bearer [redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|secret|password|authorization|apiKey|api_key|access_token)=)[^&\s"'}]+/gi, "$1[redacted]")
    .slice(0, 160);
}

function parseReliableDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
