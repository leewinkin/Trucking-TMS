const openInvoiceStatuses = new Set(["draft", "open", "pending", "unpaid", "due", "overdue", "imported"]);
const paidInvoiceStatuses = new Set(["paid", "settled"]);
const closedInvoiceStatuses = new Set(["void", "cancelled", "canceled", "closed", "refunded", "written_off", "written off"]);
const activeShipmentStatuses = new Set(["booked", "booked_with_carrier", "pickup_scheduled", "scheduled", "pickup_appointment", "picked_up", "pickup_complete", "in_transit", "transit", "out_for_delivery", "ofd"]);
const shipmentExceptionStatuses = new Set(["exception", "delayed", "rejected", "failed", "error"]);
const terminalQuoteStatuses = new Set(["booked", "cancelled", "canceled", "failed", "error", "rejected", "expired"]);

export const adminDateRanges = ["today", "last7", "last30", "all"];

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
  return Array.isArray(quote?.rates) && quote.rates.some((rate) => Number.isFinite(Number(rate?.sellPrice)));
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
  const requested = rows.length;
  const failedRows = rows.filter(isFailedCarrierAuditRow);
  const successRows = rows.filter((row) => !isFailedCarrierAuditRow(row) && Number(row?.rateCount || row?.ratesReturned || 0) > 0);
  return {
    requested,
    failed: failedRows.length,
    succeeded: successRows.length,
    partialFailure: requested > 0 && failedRows.length > 0 && successRows.length > 0,
    allFailed: requested > 0 && failedRows.length === requested
  };
}

export function isAdminQuoteIssue(quote) {
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
  if (filter === "noRates") return !quoteHasUsableRates(quote);
  if (filter === "partialFailure") return audit.partialFailure;
  if (filter === "failed") return status === "failed" || audit.allFailed;
  if (filter === "booked") return status === "booked" || quoteLinkedShipment(quote, shipments);
  if (filter === "expired") return status === "expired";
  return true;
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
    (filter === "open" && status === "open") ||
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
  const withRates = rangeQuotes.filter(quoteHasUsableRates).length;
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
    const date = customer.updatedAt || customer.createdAt;
    if (date && recordInDateRange({ date }, bounds, "date")) {
      rows.push(activity("customer_updated", customer.id, customer.id, customer.companyName || customer.id, date, customer.updatedAt ? "Customer updated." : "Customer created.", customerMap));
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
  if (!customers.some((customer) => customer.allowedBooking !== false)) items.push({ key: "booking", label: "Enable online booking for at least one customer." });
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
    onlineBookingEnabled: customers.filter((customer) => customer.allowedBooking !== false).length,
    noQuoteActivity: noActivityCustomers.length,
    needsConfiguration: [...new Map([...missingTariffCustomers, ...noCarrierCustomers].map((customer) => [customer.id, customer])).values()].slice(0, 5)
  };
}

export function adminCarrierChannels(health = {}, quotes = []) {
  const configuredModes = health?.configuredCarrierModes || health?.carrierModes || health?.configuredCarriers || [];
  const carrierHealth = health?.carrierHealth || health?.carriers || {};
  return [
    { key: "mothershipSandbox", name: "Mothership" },
    { key: "speedship", name: "SpeedShip" },
    { key: "priority1", name: "Priority1" },
    { key: "fedexFreight", name: "FedEx Freight" }
  ].map((mode) => {
    const modeHealth = carrierHealth[mode.key] || carrierHealth[mode.name] || {};
    const configured = Array.isArray(configuredModes)
      ? configuredModes.includes(mode.key) || configuredModes.includes(mode.name)
      : Boolean(configuredModes?.[mode.key] || configuredModes?.[mode.name] || modeHealth.configured);
    const lastQuote = quotes
      .filter((quote) => Array.isArray(quote.carrierAudit) && quote.carrierAudit.some((row) => normalizeToken(row.mode || row.carrier) === normalizeToken(mode.key) || normalizeToken(row.carrier) === normalizeToken(mode.name)))
      .map((quote) => parseReliableDate(quote.createdAt))
      .filter(Boolean)
      .sort((left, right) => right - left)[0] || null;
    return {
      ...mode,
      configured: configured ? "configured" : configured === false ? "not_configured" : "unknown",
      health: normalizeChannelHealth(modeHealth.status || modeHealth.health || (configured ? "unknown" : "unknown")),
      bookingEnabled: modeHealth.bookingEnabled,
      lastSuccessfulQuoteAt: lastQuote ? lastQuote.toISOString() : "",
      lastErrorSummary: sanitizeChannelMessage(modeHealth.lastError || modeHealth.error || "")
    };
  });
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
  const modes = health?.configuredCarrierModes || health?.carrierModes || health?.configuredCarriers;
  if (Array.isArray(modes)) return modes.length > 0;
  if (modes && typeof modes === "object") return Object.values(modes).some(Boolean);
  return Boolean(health?.mothershipConfigured || health?.speedshipConfigured || health?.priority1Configured);
}

function isFailedCarrierAuditRow(row) {
  const status = normalizeToken(row?.status || row?.result || "");
  if (["failed", "error", "timeout", "rejected"].includes(status)) return true;
  return Boolean(row?.error || row?.failed || row?.timedOut) && !row?.excluded;
}

function normalizeChannelHealth(value) {
  const status = normalizeToken(value);
  if (["healthy", "ok", "ready"].includes(status)) return "healthy";
  if (["degraded", "warning"].includes(status)) return "degraded";
  if (["error", "failed", "down"].includes(status)) return "error";
  return "unknown";
}

function sanitizeChannelMessage(value) {
  const message = String(value || "");
  if (!message) return "";
  return message.replace(/\b(token|secret|password|authorization)=[^\s&]+/gi, "$1=[redacted]").slice(0, 160);
}

function parseReliableDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
