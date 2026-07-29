import { collectUrlDocuments, documentCustomerVisible, normalizeDocumentType, sanitizeProviderReference } from "./document-normalizer.js";

export function normalizeSpeedshipDocuments(payload, shipment = {}, productTransactionId = "") {
  return collectUrlDocuments(payload, "speedship", "bol").map((record) => {
    const type = normalizeDocumentType(record.documentType || "bol");
    return {
      ...record,
      provider: "speedship",
      shipmentId: shipment.id || null,
      customerId: shipment.customerId || null,
      documentType: type,
      customerVisible: documentCustomerVisible(type),
      providerReference: sanitizeProviderReference({
        ...record.providerReference,
        productTransactionId
      })
    };
  });
}

export function speedshipCapabilitySummary(reason = "SpeedShip invoice API contract unavailable.") {
  return {
    provider: "speedship",
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 1,
    unmatched: 0,
    failed: 0,
    message: reason
  };
}
