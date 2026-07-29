import { carrierShipmentUnsupported, normalizeImportedCarrierShipment } from "./carrier-shipment-normalizer.js";

export function mothershipHistoricalShipmentsCapability() {
  return carrierShipmentUnsupported(
    "mothership",
    "Mothership historical shipment list API contract is unavailable; only create, detail-by-id, tracking, documents, and invoice APIs are configured."
  );
}

export async function fetchMothershipHistoricalShipments(options = {}) {
  if (Array.isArray(options.fixtureRecords)) {
    return {
      provider: "mothership",
      shipments: options.fixtureRecords.map((record) => normalizeImportedCarrierShipment("mothership", record)),
      capability: { provider: "mothership", status: "successful" }
    };
  }
  return {
    provider: "mothership",
    shipments: [],
    capability: mothershipHistoricalShipmentsCapability()
  };
}
