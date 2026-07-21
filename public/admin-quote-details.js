const unavailableValue = Number.POSITIVE_INFINITY;

const carrierModeLabels = {
  mothershipSandbox: "Mothership Test Environment",
  speedshipLtl: "SpeedShip LTL",
  priority1Ltl: "Priority1 LTL",
  fedexFreight: "FedEx Freight",
  demo: "Demo Rates"
};

const carrierCodeNames = {
  ABFS: "ABF Freight",
  CNWY: "XPO Logistics",
  FWRD: "Forward Air",
  FXFE: "FedEx Freight",
  ODFL: "Old Dominion",
  SAIA: "SAIA",
  TFWW: "TForce Freight",
  TFIN: "TForce Freight",
  XGSI: "Xpress Global Systems",
  XPOL: "XPO Logistics"
};

const sensitiveKeyPattern = /authorization|token|access\s*token|refresh\s*token|api\s*key|apikey|client\s*secret|secret|password|credential|cookie|session|account\s*number|account_number/i;

export function adminQuoteDetailsViewModel(quote = {}, options = {}) {
  const rates = adminQuoteRateRows(quote, options);
  return {
    header: adminQuoteHeaderSummary(quote, options),
    financial: adminQuoteFinancialSummary(rates),
    rates,
    channels: adminQuoteCarrierChannelRows(quote),
    freight: adminFreightSummary(aggregateAdminFreightRows(quote.freight || [])),
    pickup: adminAddressViewModel(quote.pickup || {}),
    delivery: adminAddressViewModel(quote.delivery || {}),
    tariff: adminTariffSummary(quote.tariffRule || quote.tariffSnapshot || null)
  };
}

export function adminQuoteHeaderSummary(quote = {}, options = {}) {
  return {
    quoteId: stringValue(quote.id),
    quoteNumber: stringValue(quote.quoteNumber || quote.id),
    status: stringValue(quote.status || "status_pending"),
    customerName: stringValue(quote.customerName || options.customerName || quote.customer?.companyName),
    route: buildRouteLabel(quote.pickup, quote.delivery),
    createdAt: quote.createdAt || "",
    expiresAt: firstDisplayValue([quote.expiresAt, quote.expiration, quote.expirationDate, quote.validUntil, quote.ratesExpireAt, quote.rateExpiration]),
    referenceNumber: stringValue(quote.referenceNumber || quote.poNumber)
  };
}

export function adminQuoteFinancialSummary(rateRows = []) {
  const rows = Array.isArray(rateRows) ? rateRows : [];
  const carrierCosts = rows.map((row) => row.financials.carrierCost).filter(Number.isFinite);
  const customerPrices = rows.map((row) => row.financials.customerPrice).filter(Number.isFinite);
  const grossProfits = rows.map((row) => row.financials.grossProfit).filter(Number.isFinite);
  return {
    availableRates: rows.length,
    lowestCarrierCost: carrierCosts.length ? Math.min(...carrierCosts) : unavailableValue,
    lowestCustomerPrice: customerPrices.length ? Math.min(...customerPrices) : unavailableValue,
    highestGrossProfit: grossProfits.length ? Math.max(...grossProfits) : unavailableValue
  };
}

export function adminRateFinancials(rate = {}) {
  const carrierCost = readMoney(rate.carrierCost);
  const customerPrice = readMoney(rate.sellPrice);
  const hasCarrierCost = Number.isFinite(carrierCost);
  const hasCustomerPrice = Number.isFinite(customerPrice);
  const grossProfit = hasCarrierCost && hasCustomerPrice ? roundMoney(customerPrice - carrierCost) : unavailableValue;
  const marginPercent = Number.isFinite(grossProfit) && hasCustomerPrice && customerPrice !== 0
    ? roundMoney((grossProfit / customerPrice) * 100)
    : unavailableValue;
  return {
    carrierCost,
    customerPrice,
    grossProfit,
    marginPercent,
    hasCarrierCost,
    hasCustomerPrice
  };
}

export function adminQuoteRateRows(quote = {}, options = {}) {
  const rates = Array.isArray(quote.rates) ? quote.rates : [];
  const rows = rates.map((rate, index) => {
    const source = normalizeCarrierMode(rate?.carrierSource || rate?.mode || quote.carrierMode || rate?.provider);
    const scac = stringValue(rate?.providerScac || rate?.scac || rate?.carrierCode).toUpperCase();
    const carrierName = resolveAdminCarrierName(rate, source);
    const financials = adminRateFinancials(rate);
    const booking = adminRateBookingState(rate, {
      quoteStatus: quote.status,
      quoteHasShipment: Boolean(options.quoteHasShipment),
      bookingAllowed: typeof options.bookingAllowed === "function" ? options.bookingAllowed(quote, rate) : options.bookingAllowed
    });
    return {
      index,
      rate,
      id: stringValue(rate?.id || rate?.carrierRateId || `rate_${index + 1}`),
      carrierName,
      service: stringValue(rate?.service || "Service"),
      source,
      channel: carrierModeLabels[source] || humanize(source || rate?.provider || "Carrier"),
      scac,
      transitDays: readFiniteNumber(rate?.transitDays),
      etaTime: parseDateTime(rate?.estimatedDeliveryDate),
      estimatedDeliveryDate: rate?.estimatedDeliveryDate || "",
      carrierQuoteId: stringValue(rate?.carrierQuoteId || rate?.carrierRateId || rate?.quoteId || ""),
      provider: stringValue(rate?.provider || ""),
      financials,
      booking,
      badges: []
    };
  });
  return rows.map((row) => ({
    ...row,
    badges: adminQuoteRateBadges(row, rows)
  }));
}

export function filterAdminQuoteRates(rows = [], controls = {}) {
  const search = stringValue(controls.search).toLowerCase();
  const sourceFilter = normalizeCarrierMode(controls.sourceFilter || "all");
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (sourceFilter && sourceFilter !== "all" && row.source !== sourceFilter) {
      return false;
    }
    if (controls.bookableOnly && !row.booking.bookable) {
      return false;
    }
    if (!search) {
      return true;
    }
    return [
      row.carrierName,
      row.scac,
      row.service,
      row.channel
    ].some((value) => stringValue(value).toLowerCase().includes(search));
  });
}

export function sortAdminQuoteRates(rows = [], sort = "customerPrice") {
  const sorted = [...(Array.isArray(rows) ? rows : [])];
  const byName = (left, right) => left.carrierName.localeCompare(right.carrierName) || left.service.localeCompare(right.service);
  sorted.sort((left, right) => {
    if (sort === "carrierCost") {
      return compareNumbers(left.financials.carrierCost, right.financials.carrierCost) || byName(left, right);
    }
    if (sort === "grossProfit") {
      return compareNumbersDescending(left.financials.grossProfit, right.financials.grossProfit) || byName(left, right);
    }
    if (sort === "margin") {
      return compareNumbersDescending(left.financials.marginPercent, right.financials.marginPercent) || byName(left, right);
    }
    if (sort === "transit") {
      return compareNumbers(left.transitDays, right.transitDays) || compareNumbers(left.financials.customerPrice, right.financials.customerPrice) || byName(left, right);
    }
    if (sort === "eta") {
      return compareNumbers(left.etaTime, right.etaTime) || compareNumbers(left.financials.customerPrice, right.financials.customerPrice) || byName(left, right);
    }
    if (sort === "carrierName") {
      return byName(left, right);
    }
    return compareNumbers(left.financials.customerPrice, right.financials.customerPrice) || byName(left, right);
  });
  return sorted;
}

export function adminQuoteRateBadges(row = {}, rows = []) {
  const carrierCosts = rows.map((item) => item.financials.carrierCost).filter(Number.isFinite);
  const customerPrices = rows.map((item) => item.financials.customerPrice).filter(Number.isFinite);
  const margins = rows.map((item) => item.financials.marginPercent).filter(Number.isFinite);
  const transitDays = rows.map((item) => item.transitDays).filter(Number.isFinite);
  const badges = [];
  if (Number.isFinite(row.financials?.customerPrice) && row.financials.customerPrice === Math.min(...customerPrices)) {
    badges.push("lowestCustomerPrice");
  }
  if (Number.isFinite(row.financials?.carrierCost) && row.financials.carrierCost === Math.min(...carrierCosts)) {
    badges.push("lowestCarrierCost");
  }
  if (Number.isFinite(row.transitDays) && row.transitDays === Math.min(...transitDays)) {
    badges.push("fastest");
  }
  if (Number.isFinite(row.financials?.marginPercent) && row.financials.marginPercent === Math.max(...margins)) {
    badges.push("highestMargin");
  }
  badges.push(row.booking?.bookable ? "bookable" : "unavailable");
  if (Number.isFinite(row.financials?.grossProfit) && row.financials.grossProfit < 0) {
    badges.push("negativeMargin");
  }
  return badges;
}

export function adminQuoteCarrierChannelRows(quote = {}) {
  const modes = normalizeCarrierModes(quote.carrierModes || quote.carrierMode || []);
  const auditRows = quoteAuditRows(quote);
  const rateRows = adminQuoteRateRows(quote);
  const knownModes = new Set([...modes, ...auditRows.map((row) => normalizeCarrierMode(row.mode || row.carrier || row.provider)).filter(Boolean)]);
  if (knownModes.size === 0 && rateRows.length > 0) {
    rateRows.forEach((row) => knownModes.add(row.source || "unknown"));
  }
  return [...knownModes].map((mode) => {
    const rows = auditRows.filter((row) => normalizeCarrierMode(row.mode || row.carrier || row.provider) === mode);
    const rates = rateRows.filter((row) => row.source === mode);
    const primary = rows[0] || {};
    const excluded = rows.some((row) => row.excluded || row.status === "excluded");
    const failed = rows.some((row) => /fail|error|invalid/i.test(`${row.status || ""} ${row.error || ""}`));
    const rateCount = rows.reduce((max, row) => Math.max(max, Number(row.rateCount) || 0), rates.length);
    let status = "unknown";
    if (excluded) {
      status = "excluded";
    } else if (failed && rateCount > 0) {
      status = "partial";
    } else if (failed) {
      status = "failed";
    } else if (rateCount > 0) {
      status = "success";
    } else if (rows.length > 0) {
      status = "noRates";
    } else {
      status = "notAttempted";
    }
    return {
      mode,
      channel: carrierModeLabels[mode] || humanize(mode || "Carrier"),
      status,
      rateCount,
      carrierQuoteId: stringValue(primary.carrierQuoteId || primary.quoteId || ""),
      message: stringValue(primary.carrierMessage || primary.message || primary.error || ""),
      bookingSupported: rates.some((row) => row.booking.bookable),
      auditRows: rows
    };
  });
}

export function aggregateAdminFreightRows(freight = []) {
  const groups = new Map();
  for (const item of Array.isArray(freight) ? freight : []) {
    const keyFields = {
      type: normalizePackaging(item.type || item.packagingType),
      pieces: stringValue(item.pieces || item.piecesPerHandlingUnit),
      weight: stringValue(item.weight),
      length: stringValue(item.length),
      width: stringValue(item.width),
      height: stringValue(item.height),
      freightClass: stringValue(item.freightClass),
      description: stringValue(item.description),
      nmfc: stringValue(item.nmfc || item.nmfcCode),
      stackable: Boolean(item.stackable),
      hazmat: Boolean(item.hazmat)
    };
    const key = JSON.stringify(keyFields);
    const existing = groups.get(key) || { ...keyFields, quantity: 0, totalWeight: 0 };
    const quantity = readFiniteNumber(item.quantity);
    const weight = readFiniteNumber(item.weight);
    existing.quantity += Number.isFinite(quantity) ? quantity : 0;
    if (Number.isFinite(quantity) && Number.isFinite(weight)) {
      existing.totalWeight += quantity * weight;
    }
    groups.set(key, existing);
  }
  return [...groups.values()];
}

export function adminFreightSummary(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const handlingUnits = list.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const totalWeight = list.reduce((sum, row) => sum + (Number(row.totalWeight) || 0), 0);
  return {
    handlingUnits,
    totalPieces: list.reduce((sum, row) => sum + ((Number(row.quantity) || 0) * (Number(row.pieces) || 0)), 0),
    totalWeight,
    freightClasses: [...new Set(list.map((row) => row.freightClass).filter(Boolean))],
    groupCount: list.length
  };
}

export function adminAddressViewModel(stop = {}) {
  const address = stop.address || {};
  const city = stringValue(address.city || stop.city);
  const state = stringValue(address.state || stop.state);
  const zip = stringValue(address.zip || stop.zip);
  const cityState = [city, state].filter(Boolean).join(", ");
  return {
    name: stringValue(stop.name || stop.companyName || stop.contactName),
    street: stringValue(address.street || stop.street),
    cityStateZip: [cityState, zip].filter(Boolean).join(" "),
    phone: stringValue(stop.phone || stop.contactPhone),
    hours: [stop.openTime, stop.closeTime].filter(Boolean).join("-"),
    accessorials: Array.isArray(stop.accessorials) ? stop.accessorials.filter(Boolean) : []
  };
}

export function adminTariffSummary(tariffRule = null) {
  if (!tariffRule || typeof tariffRule !== "object") {
    return { available: false, labelKey: "Pricing rule unavailable", value: "" };
  }
  const type = stringValue(tariffRule.ruleType || tariffRule.type).toLowerCase();
  if (type === "fixed") {
    return { available: true, labelKey: "Fixed markup", value: readMoney(tariffRule.fixedAmount) };
  }
  if (type === "percentage") {
    return { available: true, labelKey: "Percentage markup", value: readFiniteNumber(tariffRule.markupPercentage) };
  }
  return { available: false, labelKey: "Pricing rule unavailable", value: "" };
}

export function redactDiagnosticPayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticPayload(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactDiagnosticPayload(item)
    ]));
  }
  if (typeof value === "string") {
    return value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  }
  return value;
}

export function diagnosticPayloadIsSafe(value) {
  const text = JSON.stringify(value);
  return !/(Bearer\s+(?!\[REDACTED\])|sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16})/i.test(text);
}

export function adminRateBookingState(rate = {}, options = {}) {
  const normalizedStatus = stringValue(options.quoteStatus).toLowerCase().replace(/[\s-]+/g, "_");
  if (["expired", "cancelled", "canceled", "failed", "booked"].includes(normalizedStatus) || options.quoteHasShipment) {
    return { bookable: false, reason: "Quote is not bookable" };
  }
  if (options.bookingAllowed === false || rate?.bookingAllowed === false) {
    return { bookable: false, reason: "Booking unavailable" };
  }
  if (rate?.purchaseMetadata?.purchasable === false || rate?.mothershipMetadata?.purchasable === false) {
    return { bookable: false, reason: "Carrier purchase validation blocked booking" };
  }
  if (!Number.isFinite(adminRateFinancials(rate).customerPrice)) {
    return { bookable: false, reason: "Customer price unavailable" };
  }
  return { bookable: true, reason: "" };
}

function quoteAuditRows(quote) {
  if (Array.isArray(quote?.carrierAudit) && quote.carrierAudit.length > 0) {
    return quote.carrierAudit;
  }
  if (Array.isArray(quote?.rawCarrierResponse)) {
    return quote.rawCarrierResponse.map((run) => ({
      mode: run.carrier || run.mode,
      status: run.status,
      rateCount: Array.isArray(run.rates) ? run.rates.length : 0,
      carrierMessage: run.error || run.message,
      request: run.request,
      response: run.rawCarrierResponse || run.response
    }));
  }
  return [];
}

function resolveAdminCarrierName(rate = {}, source = "") {
  const explicit = stringValue(rate.actualCarrierName || rate.carrierName || rate.providerCarrierName || rate.carrier?.name || rate.vendor?.name);
  if (explicit) {
    return explicit;
  }
  const scac = stringValue(rate.providerScac || rate.scac || rate.carrierCode).toUpperCase();
  if (carrierCodeNames[scac]) {
    return carrierCodeNames[scac];
  }
  if (source === "mothershipSandbox") {
    return "Mothership Test Environment";
  }
  return humanize(rate.provider || source || "Contracted Carrier");
}

function normalizeCarrierModes(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/).filter(Boolean) : [];
  return [...new Set(values.map(normalizeCarrierMode).filter(Boolean))];
}

function normalizeCarrierMode(value) {
  const key = stringValue(value).toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = {
    all: "all",
    mothership: "mothershipSandbox",
    mothershipsandbox: "mothershipSandbox",
    speedship: "speedshipLtl",
    speedshipltl: "speedshipLtl",
    priority1: "priority1Ltl",
    priority1ltl: "priority1Ltl",
    p1: "priority1Ltl",
    fedex: "fedexFreight",
    fedexfreight: "fedexFreight",
    fxfe: "fedexFreight",
    demo: "demo"
  };
  return aliases[key] || stringValue(value);
}

function normalizePackaging(value) {
  return stringValue(value).toLowerCase().replace(/[\s_-]+/g, "") || "freight";
}

function readMoney(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return unavailableValue;
  }
  const number = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : unavailableValue;
}

function readFiniteNumber(value) {
  if (value && typeof value === "object") {
    return readFiniteNumber(value.minimum ?? value.value ?? value.amount);
  }
  if (value === null || value === undefined || String(value).trim() === "") {
    return unavailableValue;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : unavailableValue;
}

function compareNumbers(left, right) {
  const leftValid = Number.isFinite(left);
  const rightValid = Number.isFinite(right);
  if (leftValid && rightValid && left !== right) {
    return left - right;
  }
  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }
  return 0;
}

function compareNumbersDescending(left, right) {
  const leftValid = Number.isFinite(left);
  const rightValid = Number.isFinite(right);
  if (leftValid && rightValid && left !== right) {
    return right - left;
  }
  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }
  return 0;
}

function parseDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : unavailableValue;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function firstDisplayValue(values) {
  return values.find((value) => stringValue(value)) || "";
}

function buildRouteLabel(pickup = {}, delivery = {}) {
  const pickupAddress = pickup.address || {};
  const deliveryAddress = delivery.address || {};
  return [
    [pickupAddress.city || pickup.city, pickupAddress.state || pickup.state].filter(Boolean).join(", "),
    [deliveryAddress.city || delivery.city, deliveryAddress.state || delivery.state].filter(Boolean).join(", ")
  ].filter(Boolean).join(" -> ");
}

function humanize(value) {
  const text = stringValue(value);
  if (!text) {
    return "";
  }
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
