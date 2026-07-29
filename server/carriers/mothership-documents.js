import { collectUrlDocuments, documentCustomerVisible, normalizeDocumentType, sanitizeProviderReference, stableDocumentKey } from "./document-normalizer.js";

export function normalizeMothershipDocuments(payload, shipment = {}) {
  return collectUrlDocuments(payload, "mothership", "other").map((record) => {
    const type = normalizeDocumentType(record.documentType || record.label);
    return {
      ...record,
      provider: "mothership",
      shipmentId: shipment.id || null,
      customerId: shipment.customerId || null,
      documentType: type,
      customerVisible: documentCustomerVisible(type),
      providerReference: sanitizeProviderReference({
        ...record.providerReference,
        carrierShipmentId: shipment.carrierShipmentId,
        carrierEntityId: shipment.carrierEntityId
      })
    };
  });
}

export function mothershipMissingReferenceSummary(shipment) {
  return {
    provider: "mothership",
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: shipment ? 1 : 0,
    unmatched: 0,
    failed: 0,
    message: "provider reference missing"
  };
}

export function normalizeMothershipInvoiceDocument(invoice) {
  const key = invoice?.externalInvoiceId || invoice?.invoiceNumber || "";
  if (!key) return null;
  return {
    provider: "mothership",
    shipmentId: invoice.shipmentId || null,
    customerId: invoice.customerId || null,
    externalDocumentKey: stableDocumentKey("mothership", ["invoice", key]),
    documentType: "invoice",
    label: "Carrier Invoice",
    customerVisible: false,
    status: "available",
    providerReference: sanitizeProviderReference({
      invoiceId: invoice.externalInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      carrierShipmentId: invoice.carrierShipmentId,
      carrierEntityId: invoice.carrierEntityId
    }),
    rawMetadata: {},
    fetchedAt: invoice.syncedAt || new Date().toISOString()
  };
}
