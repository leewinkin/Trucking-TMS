import { carrierShipmentUnsupported, normalizeImportedCarrierShipment } from "./carrier-shipment-normalizer.js";

export function priority1HistoricalShipmentsCapability() {
  return carrierShipmentUnsupported(
    "priority1",
    "Priority1 historical shipment list API contract is unavailable; shipment image API remains unsupported until the verified request schema is available."
  );
}

export async function fetchPriority1HistoricalShipments(options = {}) {
  if (Array.isArray(options.fixtureRecords)) {
    return {
      provider: "priority1",
      shipments: options.fixtureRecords.map((record) => normalizeImportedCarrierShipment("priority1", record)),
      capability: { provider: "priority1", status: "successful" }
    };
  }
  return {
    provider: "priority1",
    shipments: [],
    capability: priority1HistoricalShipmentsCapability()
  };
}
