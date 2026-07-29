import { carrierShipmentUnsupported } from "./carrier-shipment-normalizer.js";

export function mothershipHistoricalShipmentsCapability() {
  return carrierShipmentUnsupported(
    "mothership",
    "Mothership historical shipment list API contract is unavailable; only create, detail-by-id, tracking, documents, and invoice APIs are configured."
  );
}

export async function fetchMothershipHistoricalShipments() {
  return {
    provider: "mothership",
    shipments: [],
    capability: mothershipHistoricalShipmentsCapability()
  };
}
