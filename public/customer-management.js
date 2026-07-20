export const customerManagementCarrierModes = [
  { key: "mothershipSandbox", label: "Mothership Sandbox", isDemo: false },
  { key: "speedshipLtl", label: "SpeedShip LTL", isDemo: false },
  { key: "priority1Ltl", label: "Priority1 LTL", isDemo: false },
  { key: "fedexFreight", label: "FedEx Freight", isDemo: false },
  { key: "demo", label: "Demo Rates", isDemo: true }
];

export function normalizeCustomerAccountStatus(status) {
  return String(status || "").trim().toLowerCase() === "disabled" ? "disabled" : "active";
}

export function customerStatusLabelKey(customer) {
  return normalizeCustomerAccountStatus(customer?.status) === "disabled" ? "account.status.disabled" : "account.status.active";
}

export function customerPricingSummary(customer, tariffs = []) {
  const tariff = findCustomerTariff(customer?.id, tariffs);
  if (!tariff) {
    return { labelKey: "no tariff", value: "", ruleType: "", hasRule: false };
  }
  if (tariff.ruleType === "fixed") {
    return {
      labelKey: "Fixed markup",
      value: Number(tariff.fixedAmount || 0),
      displayValue: "fixedAmount",
      ruleType: "fixed",
      hasRule: true
    };
  }
  return {
    labelKey: "Percentage markup",
    value: Number(tariff.markupPercentage || 0),
    displayValue: "markupPercentage",
    ruleType: "percentage",
    hasRule: true
  };
}

export function customerConfigurationFlags(customer, tariffs = []) {
  const active = normalizeCustomerAccountStatus(customer?.status) !== "disabled";
  const allowedModes = normalizeModeList(customer?.allowedCarrierModes);
  const bookingModes = customerExplicitBookingModes(customer);
  const hasTariff = Boolean(findCustomerTariff(customer?.id, tariffs));
  const rawBookingModes = normalizeModeList(customer?.allowedBookingCarrierModes);
  const onlineBookingEnabled = active && bookingModes.length > 0;
  const inconsistentBooking = active && customer?.allowedBooking !== false && rawBookingModes.some((mode) => !allowedModes.includes(mode));
  const portalExpected = customer?.portalAccessExpected === true;
  const portalConfigured = Boolean(String(customer?.portalEmail || "").trim());
  return {
    disabled: !active,
    missingTariff: active && !hasTariff,
    noCarrierModes: active && allowedModes.length === 0,
    onlineBookingDisabled: active && !onlineBookingEnabled,
    portalNotConfigured: active && portalExpected && !portalConfigured,
    inconsistentBooking,
    configurationComplete: active && hasTariff && allowedModes.length > 0 && !inconsistentBooking,
    onlineBookingEnabled
  };
}

export function customerMatchesSearch(customer, query = "") {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return [
    customer?.companyName,
    customer?.billingEmail,
    customer?.portalEmail,
    customer?.companyPhone,
    customer?.companyStreet,
    customer?.companyCity,
    customer?.companyState,
    customer?.companyZip
  ].some((value) => normalizeSearch(value).includes(normalized));
}

export function customerMatchesStatusFilter(customer, filter = "all") {
  if (filter === "active") return normalizeCustomerAccountStatus(customer?.status) === "active";
  if (filter === "disabled") return normalizeCustomerAccountStatus(customer?.status) === "disabled";
  return true;
}

export function customerMatchesConfigurationFilter(customer, tariffs = [], filter = "all") {
  const flags = customerConfigurationFlags(customer, tariffs);
  if (filter === "missingTariff") return flags.missingTariff;
  if (filter === "noCarrierModes") return flags.noCarrierModes;
  if (filter === "onlineBookingDisabled") return flags.onlineBookingDisabled;
  if (filter === "portalNotConfigured") return flags.portalNotConfigured;
  if (filter === "configurationComplete") return flags.configurationComplete;
  return true;
}

export function sortCustomerManagementRows(rows, sort = "recent") {
  const sorted = [...rows];
  return sorted.sort((left, right) => {
    if (sort === "company") {
      return String(left.customer.companyName || "").localeCompare(String(right.customer.companyName || ""));
    }
    if (sort === "quotes") {
      return right.activity.quotesLast30 - left.activity.quotesLast30 || String(left.customer.companyName || "").localeCompare(String(right.customer.companyName || ""));
    }
    if (sort === "shipments") {
      return right.activity.shipmentsLast30 - left.activity.shipmentsLast30 || String(left.customer.companyName || "").localeCompare(String(right.customer.companyName || ""));
    }
    return reliableCustomerDate(right.customer) - reliableCustomerDate(left.customer) || String(left.customer.companyName || "").localeCompare(String(right.customer.companyName || ""));
  });
}

export function customerActivityCounts(customer, quotes = [], shipments = [], now = new Date()) {
  const customerQuoteIds = new Set();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const customerQuotes = quotes.filter((quote) => {
    const belongs = quote?.customerId === customer?.id;
    if (belongs && quote?.id) customerQuoteIds.add(quote.id);
    return belongs && recordOnOrAfter(quote, cutoff);
  });
  const customerShipments = shipments.filter((shipment) => {
    const direct = shipment?.customerId === customer?.id;
    const viaQuote = shipment?.quoteId && customerQuoteIds.has(shipment.quoteId);
    return (direct || viaQuote) && recordOnOrAfter(shipment, cutoff);
  });
  return {
    quotesLast30: customerQuotes.length,
    shipmentsLast30: customerShipments.length
  };
}

export function customerManagementViewModel({
  customers = [],
  tariffs = [],
  quotes = [],
  shipments = [],
  query = "",
  statusFilter = "all",
  configurationFilter = "all",
  sort = "recent",
  now = new Date()
} = {}) {
  const rows = customers
    .filter((customer) => customerMatchesSearch(customer, query))
    .filter((customer) => customerMatchesStatusFilter(customer, statusFilter))
    .filter((customer) => customerMatchesConfigurationFilter(customer, tariffs, configurationFilter))
    .map((customer) => ({
      customer,
      tariff: findCustomerTariff(customer.id, tariffs),
      pricing: customerPricingSummary(customer, tariffs),
      flags: customerConfigurationFlags(customer, tariffs),
      activity: customerActivityCounts(customer, quotes, shipments, now)
    }));
  return {
    metrics: {
      totalCustomers: customers.length,
      configurationIncomplete: customers.filter((customer) => {
        const flags = customerConfigurationFlags(customer, tariffs);
        return !flags.disabled && !flags.configurationComplete;
      }).length,
      onlineBookingEnabled: customers.filter((customer) => customerConfigurationFlags(customer, tariffs).onlineBookingEnabled).length
    },
    rows: sortCustomerManagementRows(rows, sort)
  };
}

export function carrierModeMatrixRows(customer = {}, options = {}) {
  const quoteModes = normalizeModeList(customer.allowedCarrierModes);
  const bookingModes = customerExplicitBookingModes(customer);
  const showDemo = Boolean(options.showDemo || quoteModes.includes("demo") || bookingModes.includes("demo"));
  return customerManagementCarrierModes
    .filter((mode) => !mode.isDemo || showDemo)
    .map((mode) => {
      const quotingEnabled = quoteModes.includes(mode.key);
      return {
        ...mode,
        quotingEnabled,
        bookingEnabled: quotingEnabled && bookingModes.includes(mode.key),
        bookingAllowed: canEnableBookingMode(mode.key, quoteModes)
      };
    });
}

export function canEnableBookingMode(mode, allowedCarrierModes = []) {
  return normalizeModeList(allowedCarrierModes).includes(normalizeCarrierMode(mode));
}

export function customerExplicitBookingModes(customer = {}) {
  const active = normalizeCustomerAccountStatus(customer?.status) !== "disabled";
  if (!active || customer?.allowedBooking === false || !Array.isArray(customer?.allowedBookingCarrierModes)) {
    return [];
  }
  const allowedModes = normalizeModeList(customer.allowedCarrierModes);
  return normalizeModeList(customer.allowedBookingCarrierModes).filter((mode) => allowedModes.includes(mode));
}

export function shouldCaptureCustomerManagementDraft(drawerMode) {
  return drawerMode !== "view";
}

export function customerManagementDirtyAfterTabSwitch(wasDirty) {
  return Boolean(wasDirty);
}

export function isCustomerManagementTabDisabled({ drawerMode = "", tab = "basic" } = {}) {
  return drawerMode === "create" && tab !== "basic";
}

export function customerPortalStatusLabelKey({ drawerMode = "", draftPortalEmail = "", persistedPortalEmail = "" } = {}) {
  const value = drawerMode === "view" ? persistedPortalEmail : draftPortalEmail;
  return String(value || "").trim() ? "Configured" : "Not Configured";
}

export function updateCarrierModeSelection({ allowedCarrierModes = [], allowedBookingCarrierModes = [] }, mode, quoteEnabled) {
  const key = normalizeCarrierMode(mode);
  const allowed = new Set(normalizeModeList(allowedCarrierModes));
  const booking = new Set(normalizeModeList(allowedBookingCarrierModes));
  if (quoteEnabled) {
    allowed.add(key);
  } else {
    allowed.delete(key);
    booking.delete(key);
  }
  return {
    allowedCarrierModes: [...allowed],
    allowedBookingCarrierModes: [...booking].filter((item) => allowed.has(item))
  };
}

export function normalizeCarrierMode(mode) {
  const token = String(mode || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return {
    mothership: "mothershipSandbox",
    mothershipsandbox: "mothershipSandbox",
    speedship: "speedshipLtl",
    speedshipltl: "speedshipLtl",
    priority1: "priority1Ltl",
    priority1ltl: "priority1Ltl",
    fedex: "fedexFreight",
    fedexfreight: "fedexFreight",
    demo: "demo"
  }[token] || String(mode || "").trim();
}

function findCustomerTariff(customerId, tariffs) {
  return tariffs.find((rule) => rule.customerId === customerId) || null;
}

function normalizeModeList(values) {
  const list = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[,\s]+/)
      : [];
  return [...new Set(list.map(normalizeCarrierMode).filter((mode) => customerManagementCarrierModes.some((item) => item.key === mode)))];
}

function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function reliableCustomerDate(customer) {
  return parseReliableDate(customer?.updatedAt) || parseReliableDate(customer?.createdAt) || new Date(0);
}

function recordOnOrAfter(record, cutoff) {
  const date = parseReliableDate(record?.createdAt || record?.updatedAt);
  return Boolean(date && date >= cutoff);
}

function parseReliableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
