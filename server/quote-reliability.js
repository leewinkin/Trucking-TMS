const packagingAliases = new Map([
  ["pallet", "pallet"],
  ["pallets", "pallet"],
  ["plt", "pallet"],
  ["托盘", "pallet"],
  ["box", "box"],
  ["boxes", "box"],
  ["carton", "box"],
  ["cartons", "box"],
  ["纸箱", "box"],
  ["crate", "crate"],
  ["crates", "crate"],
  ["木箱", "crate"]
]);

export const providerPackagingMappings = {
  mothership: {
    pallet: "Pallet",
    box: "Box",
    crate: "Crate"
  },
  speedship: {
    pallet: "PLT",
    box: "BOX",
    crate: "CRT"
  },
  priority1: {
    pallet: "Pallet",
    box: "Box",
    crate: "Crate"
  },
  fedexFreight: {
    pallet: "PALLET",
    box: "BOX",
    crate: "CRATE"
  }
};

export const knownCarrierCodeMappings = {
  ABFS: "ABF Freight",
  FWDN: "Forward Air",
  FXFE: "FedEx Freight",
  ODFL: "Old Dominion",
  SAIA: "SAIA",
  SEFL: "Southeastern Freight Lines",
  TFWW: "TForce Freight",
  TFOR: "TForce Freight",
  UPSF: "TForce Freight",
  CNWY: "XPO Logistics",
  XPO: "XPO Logistics",
  XPOL: "Xpress Global Systems",
  XGSI: "Xpress Global Systems"
};

const internalSourceNames = new Set([
  "mothership",
  "mothership sandbox",
  "mothership-demo",
  "speedship",
  "speedship ltl",
  "priority1",
  "priority1 ltl",
  "fedexfreight"
]);

export function normalizePackagingType(value, fieldName = "freight.type") {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  const normalized = packagingAliases.get(key) || packagingAliases.get(raw);
  if (!normalized) {
    const error = new Error(`Unsupported packaging type for ${fieldName}. Use pallet, box, or crate.`);
    error.status = 400;
    error.code = "INVALID_PACKAGING_TYPE";
    throw error;
  }
  return normalized;
}

export function packagingTypeForProvider(value, provider, fieldName = "freight.type") {
  const canonical = normalizePackagingType(value, fieldName);
  const mapping = providerPackagingMappings[provider];
  if (!mapping) {
    const error = new Error(`Unsupported packaging provider: ${provider}`);
    error.status = 500;
    error.code = "INVALID_PACKAGING_PROVIDER";
    throw error;
  }
  return mapping[canonical];
}

export function resolveActualCarrierName(rate = {}, options = {}) {
  const sourcePlatform = String(options.sourcePlatform || rate.carrierSource || rate.sourcePlatform || "").trim();
  const explicitName = firstText([
    rate.actualCarrierName,
    rate.carrierName,
    rate.vendorName,
    rate.providerName,
    rate.primaryVendor?.preferredName,
    rate.primaryVendor?.name,
    rate.carrier?.name,
    rate.vendor?.name,
    rate.timeInTransit?.carrierName,
    rate.timeInTransit?.vendorName
  ]);
  const sourceIsMothership = isMothershipSource(sourcePlatform, rate.provider);

  if (explicitName && !isInternalSourceName(explicitName)) {
    return explicitName;
  }

  const code = firstText([
    rate.scac,
    rate.providerScac,
    rate.carrierCode,
    rate.vendorId,
    rate.provider
  ]).toUpperCase();
  if (code && knownCarrierCodeMappings[code]) {
    return knownCarrierCodeMappings[code];
  }

  if (sourceIsMothership) {
    return "Self-owned Truck";
  }

  return "Contracted Carrier";
}

export function applyActualCarrierNames(rates = [], sourcePlatform = "") {
  return rates.map((rate) => ({
    ...rate,
    actualCarrierName: resolveActualCarrierName(rate, { sourcePlatform }),
    sourcePlatform
  }));
}

export function customerRateAvailability(carrierRuns = [], rates = []) {
  const rateCount = Array.isArray(rates) ? rates.length : 0;
  if (rateCount === 0) {
    return {
      status: "none",
      messageCode: "NO_RATES_AVAILABLE"
    };
  }

  const hasUnavailableSource = carrierRuns.some((run) => {
    const runRates = Array.isArray(run?.rates) ? run.rates : [];
    return runRates.length === 0 || Boolean(String(run?.carrierMessage || "").trim());
  });

  if (hasUnavailableSource) {
    return {
      status: "partial",
      messageCode: "PARTIAL_RATES_UNAVAILABLE"
    };
  }

  return {
    status: "complete",
    messageCode: null
  };
}

export function sanitizeRateForCustomerDisplay(rate = {}, options = {}) {
  return {
    id: rate.id,
    carrierName: resolveActualCarrierName(rate, options),
    service: rate.service,
    sellPrice: rate.sellPrice,
    estimatedPickupDate: rate.estimatedPickupDate || null,
    estimatedDeliveryDate: rate.estimatedDeliveryDate || null,
    transitDays: rate.transitDays || null
  };
}

function firstText(values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function isInternalSourceName(value) {
  return internalSourceNames.has(String(value || "").trim().toLowerCase());
}

function isMothershipSource(sourcePlatform, provider) {
  return [sourcePlatform, provider].some((value) => String(value || "").trim().toLowerCase().includes("mothership"));
}
