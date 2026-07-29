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
