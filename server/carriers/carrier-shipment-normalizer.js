export const carrierShipmentProviders = new Set(["mothership", "priority1", "speedship"]);
export const carrierShipmentImportSources = new Set(["tms_created", "provider_import", "manual_import"]);
export const carrierShipmentBookingChannels = new Set(["tms_api", "provider_portal", "external_api", "unknown"]);
export const carrierShipmentMatchingStatuses = new Set(["matched", "manual", "unmatched", "conflict"]);

export function carrierShipmentUnsupported(provider, missingContract) {
  return {
    provider,
    status: "unsupported",
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 1,
    matched: 0,
    unmatched: 0,
    conflicts: 0,
    failed: 0,
    message: missingContract
  };
}

export function normalizeCarrierShipmentValue(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

export function normalizeImportedCarrierShipment(provider, raw = {}, overrides = {}) {
  const normalizedProvider = normalizeCarrierShipmentValue(provider || raw.provider, carrierShipmentProviders, "");
  const externalShipmentId = normalizeCarrierShipmentIdentifier(
    overrides.externalShipmentId ||
    readShipmentString(raw, [["externalShipmentId"], ["external_shipment_id"], ["shipmentId"], ["shipment_id"], ["id"]])
  );
  return {
    provider: normalizedProvider,
    importSource: normalizeCarrierShipmentValue(overrides.importSource || raw.importSource, carrierShipmentImportSources, "provider_import"),
    bookingChannel: normalizeCarrierShipmentValue(overrides.bookingChannel || raw.bookingChannel, carrierShipmentBookingChannels, "unknown"),
    bookingChannelEvidence: sanitizeCarrierShipmentPayload(overrides.bookingChannelEvidence || raw.bookingChannelEvidence || {}),
    linkedShipmentId: overrides.linkedShipmentId || raw.linkedShipmentId || null,
    customerId: overrides.customerId || raw.customerId || null,
    matchingStatus: normalizeCarrierShipmentValue(overrides.matchingStatus || raw.matchingStatus, carrierShipmentMatchingStatuses, "unmatched"),
    externalShipmentId,
    entityId: normalizeCarrierShipmentIdentifier(overrides.entityId || readShipmentString(raw, [["entityId"], ["entityID"], ["entity_id"], ["entity", "id"]])),
    transactionId: normalizeCarrierShipmentIdentifier(overrides.transactionId || readShipmentString(raw, [["transactionId"], ["transaction_id"], ["productTransactionId"], ["product_transaction_id"]])),
    confirmationNumber: String(overrides.confirmationNumber || readShipmentString(raw, [["confirmationNumber"], ["confirmation_number"], ["confirmation"], ["number"]]) || "").trim(),
    referenceNumber: String(overrides.referenceNumber || readShipmentString(raw, [["referenceNumber"], ["reference_number"], ["poNumber"], ["po"], ["customerReference"]]) || "").trim(),
    proNumber: String(overrides.proNumber || readShipmentString(raw, [["proNumber"], ["pro_number"], ["pro"]]) || "").trim(),
    bolNumber: String(overrides.bolNumber || readShipmentString(raw, [["bolNumber"], ["bol_number"], ["bol"]]) || "").trim(),
    origin: normalizeCarrierShipmentStop(overrides.origin || raw.origin || raw.pickup || raw.shipper || {}),
    destination: normalizeCarrierShipmentStop(overrides.destination || raw.destination || raw.delivery || raw.consignee || {}),
    carrierName: String(overrides.carrierName || readShipmentString(raw, [["carrierName"], ["carrier_name"], ["carrier", "name"], ["vendor", "name"]]) || "").trim(),
    service: String(overrides.service || readShipmentString(raw, [["service"], ["serviceLevel"], ["service_level"]]) || "").trim(),
    status: String(overrides.status || readShipmentString(raw, [["status"], ["state"], ["shipmentStatus"]]) || "").trim(),
    carrierCost: Number(overrides.carrierCost ?? raw.carrierCost ?? raw.carrier_cost ?? 0) || 0,
    rawProviderRecord: sanitizeCarrierShipmentPayload(overrides.rawProviderRecord || raw),
    lastProviderUpdate: overrides.lastProviderUpdate || readShipmentString(raw, [["updatedAt"], ["updated_at"], ["modifiedAt"], ["modified_at"]]) || null
  };
}

export function stableCarrierShipmentKey(provider, parts) {
  return [provider, ...parts.map((part) => String(part || "").trim()).filter(Boolean)].join(":");
}

export function readShipmentString(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const segment of path) {
      current = current?.[segment];
      if (current === undefined || current === null) break;
    }
    if (current !== undefined && current !== null && String(current).trim()) {
      return String(current).trim();
    }
  }
  return "";
}

export function summarizeCarrierShipmentSync(provider, documents = [], storeSummary = {}) {
  return {
    provider,
    status: "successful",
    fetched: documents.length,
    created: storeSummary.created || 0,
    updated: storeSummary.updated || 0,
    skipped: storeSummary.skipped || 0,
    matched: documents.filter((item) => item.matchingStatus === "matched" || item.matchingStatus === "manual").length,
    unmatched: documents.filter((item) => item.matchingStatus === "unmatched").length,
    conflicts: documents.filter((item) => item.matchingStatus === "conflict").length,
    failed: 0
  };
}

export function mergeCarrierShipmentForProviderSync(existing, incoming) {
  if (!existing) return incoming;
  const preserveManualMatch = existing.matchingStatus === "manual";
  const preserveManualBooking = hasManualBookingConfirmation(existing.bookingChannelEvidence);
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    importedAt: existing.importedAt || incoming.importedAt,
    linkedShipmentId: preserveManualMatch ? existing.linkedShipmentId || null : incoming.linkedShipmentId || null,
    customerId: preserveManualMatch ? existing.customerId || null : incoming.customerId || null,
    matchingStatus: preserveManualMatch ? "manual" : incoming.matchingStatus,
    bookingChannel: preserveManualBooking ? existing.bookingChannel : incoming.bookingChannel,
    bookingChannelEvidence: preserveManualBooking ? existing.bookingChannelEvidence : incoming.bookingChannelEvidence
  };
}

export function hasManualBookingConfirmation(evidence = {}) {
  if (!evidence || typeof evidence !== "object") return false;
  return evidence.source === "manual_admin_confirmation" ||
    evidence.manualAction === "confirm-provider-portal" ||
    evidence.manualConfirmation === true;
}

export function matchImportedCarrierShipment(imported, localShipments = []) {
  if (!imported) return automaticMatchResult(null, "unmatched");
  const provider = normalizeCarrierShipmentValue(imported.provider, carrierShipmentProviders, "");
  const stages = [
    ["externalShipmentId", imported.externalShipmentId, (shipment) => sameProvider(provider, shipment) && sameText(shipment.carrierShipmentId, imported.externalShipmentId)],
    ["entityId", imported.entityId, (shipment) => sameProvider(provider, shipment) && sameText(shipment.carrierEntityId, imported.entityId)],
    ["transactionId", imported.transactionId, (shipment) => sameProvider(provider, shipment) && sameText(localShipmentTransactionId(shipment), imported.transactionId)],
    ["confirmationNumber", imported.confirmationNumber, (shipment) => sameProvider(provider, shipment) && sameText(shipment.confirmationNumber, imported.confirmationNumber)],
    ["proNumber", imported.proNumber, (shipment) => sameProvider(provider, shipment) && sameText(localShipmentProNumber(shipment), imported.proNumber)],
    ["bolNumber", imported.bolNumber, (shipment) => sameProvider(provider, shipment) && sameText(localShipmentBolNumber(shipment), imported.bolNumber)],
    ["referenceNumber", imported.referenceNumber, (shipment) => sameProvider(provider, shipment) && sameText(shipment.referenceNumber, imported.referenceNumber)]
  ];
  for (const [field, value, predicate] of stages) {
    if (!String(value || "").trim()) continue;
    const candidates = localShipments.filter(predicate);
    if (candidates.length === 1) {
      return automaticMatchResult(candidates[0], "matched", field);
    }
    if (candidates.length > 1) {
      return automaticMatchResult(null, "conflict", field);
    }
  }
  return automaticMatchResult(null, "unmatched");
}

export function applyAutomaticShipmentMatch(imported, localShipments = []) {
  if (imported?.matchingStatus === "manual") {
    return imported;
  }
  const match = matchImportedCarrierShipment(imported, localShipments);
  const booking = classifyCarrierShipmentBookingChannel(imported, match.shipment);
  return {
    ...imported,
    linkedShipmentId: match.shipment?.id || null,
    customerId: match.shipment?.customerId || null,
    matchingStatus: match.status,
    bookingChannel: booking.bookingChannel,
    bookingChannelEvidence: booking.bookingChannelEvidence
  };
}

export function classifyCarrierShipmentBookingChannel(imported, localShipment = null) {
  if (imported?.bookingChannel === "provider_portal" && hasManualBookingConfirmation(imported.bookingChannelEvidence)) {
    return {
      bookingChannel: "provider_portal",
      bookingChannelEvidence: imported.bookingChannelEvidence
    };
  }
  if (imported?.bookingChannel === "provider_portal" && hasVerifiedProviderPortalEvidence(imported.bookingChannelEvidence)) {
    return {
      bookingChannel: "provider_portal",
      bookingChannelEvidence: imported.bookingChannelEvidence
    };
  }
  const matchingIdentifier = localShipment ? exactTmsBookingIdentifierMatch(imported, localShipment) : "";
  if (matchingIdentifier && hasVerifiedTmsBookingRequest(localShipment)) {
    return {
      bookingChannel: "tms_api",
      bookingChannelEvidence: {
        source: "verified_tms_booking_request",
        matchedIdentifier: matchingIdentifier
      }
    };
  }
  return {
    bookingChannel: "unknown",
    bookingChannelEvidence: {}
  };
}

export function hasVerifiedProviderPortalEvidence(evidence = {}) {
  if (!evidence || typeof evidence !== "object") return false;
  return evidence.source === "verified_provider_contract" &&
    Boolean(String(evidence.providerField || "").trim());
}

export function sanitizeCarrierShipmentPayload(value, depth = 0) {
  if (!value || depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCarrierShipmentPayload(item, depth + 1));
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return stableUrlWithoutSensitiveQuery(value);
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveCarrierShipmentKey(key))
      .map(([key, child]) => [key, sanitizeCarrierShipmentPayload(child, depth + 1)])
  );
}

export function normalizeCarrierShipmentIdentifier(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) && urlHasSensitiveQuery(text)) {
    return "";
  }
  if (/^https?:\/\//i.test(text)) {
    return stableUrlWithoutSensitiveQuery(text);
  }
  return text;
}

function normalizeCarrierShipmentStop(stop = {}) {
  return {
    name: String(stop.name || stop.companyName || stop.company_name || "").trim(),
    address: String(stop.address || stop.street || stop.address1 || stop.line1 || "").trim(),
    city: String(stop.city || "").trim(),
    state: String(stop.state || stop.stateCode || stop.state_code || "").trim(),
    zip: String(stop.zip || stop.postalCode || stop.postal_code || "").trim()
  };
}

function automaticMatchResult(shipment, status, matchedBy = "") {
  return { shipment: shipment || null, status, matchedBy };
}

function sameProvider(provider, shipment) {
  return provider && normalizeShipmentProvider(shipment) === provider;
}

function normalizeShipmentProvider(shipment) {
  const value = String(shipment?.carrier || shipment?.provider || "").trim().toLowerCase();
  if (value.includes("mothership")) return "mothership";
  if (value.includes("priority1")) return "priority1";
  if (value.includes("speedship")) return "speedship";
  return normalizeCarrierShipmentValue(value, carrierShipmentProviders, value);
}

function sameText(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  return Boolean(a && b && a === b);
}

function localShipmentTransactionId(shipment) {
  return readShipmentString(shipment, [
    ["transactionId"],
    ["carrierShipment", "transactionId"],
    ["carrierShipment", "productTransactionId"],
    ["carrierShipment", "response", "transactionId"],
    ["carrierShipment", "response", "productTransactionId"]
  ]);
}

function localShipmentProNumber(shipment) {
  return readShipmentString(shipment, [
    ["proNumber"],
    ["pro_number"],
    ["carrierShipment", "proNumber"],
    ["carrierShipment", "pro_number"],
    ["carrierShipment", "response", "proNumber"],
    ["carrierShipment", "response", "pro_number"]
  ]);
}

function localShipmentBolNumber(shipment) {
  return readShipmentString(shipment, [
    ["bolNumber"],
    ["bol_number"],
    ["carrierShipment", "bolNumber"],
    ["carrierShipment", "bol_number"],
    ["carrierShipment", "response", "bolNumber"],
    ["carrierShipment", "response", "bol_number"]
  ]);
}

function exactTmsBookingIdentifierMatch(imported, localShipment) {
  if (sameText(localShipment.carrierShipmentId, imported.externalShipmentId)) return "externalShipmentId";
  if (sameText(localShipment.carrierEntityId, imported.entityId)) return "entityId";
  if (sameText(localShipmentTransactionId(localShipment), imported.transactionId)) return "transactionId";
  return "";
}

function hasVerifiedTmsBookingRequest(shipment) {
  return Boolean(
    shipment?.carrierShipment?.request &&
    shipment?.carrierShipment?.response &&
    shipment.status === "booked_with_carrier"
  );
}

function stableUrlWithoutSensitiveQuery(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return String(value || "").split("?")[0].split("#")[0].trim();
  }
}

function urlHasSensitiveQuery(value) {
  try {
    const parsed = new URL(String(value || ""));
    return Array.from(parsed.searchParams.keys()).some(isSensitiveCarrierShipmentKey);
  } catch {
    return /[?&][^=]*(authorization|bearer|token|access.?token|api.?key|cookie|set.?cookie|password|secret|signature|sig|x.?amz.?signature|x.?amz.?credential|x.?amz.?security.?token)[^=]*=/i.test(String(value || ""));
  }
}

function isSensitiveCarrierShipmentKey(key) {
  return new Set([
    "authorization",
    "authorizationheader",
    "bearer",
    "token",
    "authtoken",
    "accesstoken",
    "apikey",
    "cookie",
    "setcookie",
    "password",
    "secret",
    "clientsecret",
    "signature",
    "sig",
    "xamzsignature",
    "xamzcredential",
    "xamzsecuritytoken"
  ]).has(canonicalSensitiveKey(key));
}

function canonicalSensitiveKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
