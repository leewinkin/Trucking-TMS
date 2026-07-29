import { carrierShipmentUnsupported } from "./carrier-shipment-normalizer.js";

export function priority1HistoricalShipmentsCapability() {
  return carrierShipmentUnsupported(
    "priority1",
    "Priority1 historical shipment list API contract is unavailable; shipment image API remains unsupported until the verified request schema is available."
  );
}

export async function fetchPriority1HistoricalShipments() {
  return {
    provider: "priority1",
    shipments: [],
    capability: priority1HistoricalShipmentsCapability()
  };
}
