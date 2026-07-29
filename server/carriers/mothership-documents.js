import { collectUrlDocuments, documentCustomerVisible, normalizeDocumentType, readNestedString, sanitizeProviderReference, stableDocumentKey, stableUrlReference, urlHasSensitiveQuery } from "./document-normalizer.js";

export function normalizeMothershipDocuments(payload, shipment = {}) {
  const explicit = mothershipDocumentRecords(payload);
  const records = explicit.length ? explicit : collectUrlDocuments(payload, "mothership", "other");
  return records.map((record) => {
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

export function mothershipDocumentRecords(payload) {
  const collections = [
    payload?.documents,
    payload?.data?.documents,
    payload?.shipmentDocuments,
    payload?.data?.shipmentDocuments
  ].filter(Array.isArray);
  return collections.flatMap((items) =>
    items.map((item) => {
      const type = normalizeDocumentType(readNestedString(item, [["documentType"], ["type"], ["name"], ["label"]]));
      const url = readNestedString(item, [["documentUrl"], ["downloadUrl"], ["url"], ["href"]]);
      if (!url || !/^https:\/\//i.test(url)) return null;
      const id = readNestedString(item, [["documentId"], ["id"], ["key"]]) || stableUrlReference(url);
      return {
        provider: "mothership",
        externalDocumentKey: stableDocumentKey("mothership", [type, id]),
        documentType: type,
        label: type === "bol" ? "Bill of Lading" : type === "pod" ? "Proof of Delivery" : "Document",
        filename: readNestedString(item, [["filename"], ["fileName"]]) || null,
        contentType: readNestedString(item, [["contentType"], ["mimeType"]]) || null,
        status: urlHasSensitiveQuery(url) ? "pending" : "available",
        providerReference: sanitizeProviderReference({ id, url }),
        rawMetadata: {},
        fetchedAt: new Date().toISOString()
      };
    }).filter(Boolean)
  );
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
  const source = invoice?.rawCarrierResponse || {};
  const documentId = readNestedString(source, [
    ["documentId"],
    ["documentID"],
    ["invoiceDocumentId"],
    ["invoice_document_id"],
    ["pdfDocumentId"],
    ["document", "id"],
    ["invoice", "documentId"]
  ]);
  const documentUrl = readNestedString(source, [
    ["documentUrl"],
    ["document_url"],
    ["invoiceUrl"],
    ["invoice_url"],
    ["pdfUrl"],
    ["pdf_url"],
    ["document", "url"],
    ["invoice", "documentUrl"]
  ]);
  const stableKey = documentId || (documentUrl ? stableUrlReference(documentUrl) : key);
  const available = Boolean(documentUrl) && !urlHasSensitiveQuery(documentUrl);
  return {
    provider: "mothership",
    shipmentId: invoice.shipmentId || null,
    customerId: invoice.customerId || null,
    externalDocumentKey: stableDocumentKey("mothership", ["invoice", stableKey]),
    documentType: "invoice",
    label: "Carrier Invoice",
    customerVisible: false,
    status: available ? "available" : "pending",
    providerReference: sanitizeProviderReference({
      documentId,
      url: documentUrl,
      invoiceId: invoice.externalInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      carrierShipmentId: invoice.carrierShipmentId,
      carrierEntityId: invoice.carrierEntityId
    }),
    rawMetadata: {},
    fetchedAt: invoice.syncedAt || new Date().toISOString()
  };
}
