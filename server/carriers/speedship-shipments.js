import { carrierShipmentUnsupported, normalizeImportedCarrierShipment } from "./carrier-shipment-normalizer.js";

export function speedshipHistoricalShipmentsCapability() {
  return carrierShipmentUnsupported(
    "speedship",
    "SpeedShip historical shipment list API contract is unavailable; documentDownloadFlow supports BOL lookup by verified product transaction ID only."
  );
}

export async function fetchSpeedshipHistoricalShipments(options = {}) {
  if (Array.isArray(options.fixtureRecords)) {
    return {
      provider: "speedship",
      shipments: options.fixtureRecords.map((record) => normalizeImportedCarrierShipment("speedship", record)),
      capability: { provider: "speedship", status: "successful" }
    };
  }
  return {
    provider: "speedship",
    shipments: [],
    capability: speedshipHistoricalShipmentsCapability()
  };
}
