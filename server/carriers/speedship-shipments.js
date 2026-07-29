import { carrierShipmentUnsupported } from "./carrier-shipment-normalizer.js";

export function speedshipHistoricalShipmentsCapability() {
  return carrierShipmentUnsupported(
    "speedship",
    "SpeedShip historical shipment list API contract is unavailable; documentDownloadFlow supports BOL lookup by verified product transaction ID only."
  );
}

export async function fetchSpeedshipHistoricalShipments() {
  return {
    provider: "speedship",
    shipments: [],
    capability: speedshipHistoricalShipmentsCapability()
  };
}
