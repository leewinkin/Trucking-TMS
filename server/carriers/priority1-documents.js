import { readNestedString, sanitizeProviderReference, stableDocumentKey, stableUrlReference } from "./document-normalizer.js";

export function priority1DocumentCapabilitySummary(reason = "Priority1 shipment image request schema unavailable.") {
  return {
    provider: "priority1",
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 1,
    unmatched: 0,
    failed: 0,
    message: reason
  };
}

export function normalizePriority1InvoiceRecords(payload, shipments = []) {
  const rows = priority1InvoiceRows(payload);
  return rows.map((row) => {
    const invoiceNumber = readNestedString(row, [["invoiceNumber"], ["customerInvoiceNumber"], ["id"]]);
    const bolNumber = readNestedString(row, [["bolNumber"], ["bol"], ["BOL"]]);
    const proNumber = readNestedString(row, [["proNumber"], ["pro"], ["PRO"]]);
    const providerShipmentId = readNestedString(row, [["providerShipmentId"], ["shipmentId"], ["shipment", "id"]]);
    const referenceNumber = readNestedString(row, [["referenceNumber"], ["purchaseOrderNumber"], ["poNumber"]]);
    const shipment = matchPriority1Shipment({ providerShipmentId, proNumber, bolNumber, referenceNumber }, shipments);
    return {
      shipmentId: shipment?.id || null,
      customerId: shipment?.customerId || null,
      customerName: shipment?.customerName || "Imported from Priority1",
      invoiceNumber: invoiceNumber || stableDocumentKey("priority1", ["invoice", bolNumber, proNumber, referenceNumber]),
      referenceNumber,
      amount: Number(row.invoiceAmount || row.amount || row.totalAmount || 0),
      status: String(row.status || "open").trim().toLowerCase(),
      issuedAt: row.invoiceDate || row.createdDate || null,
      dueAt: row.dueDate || null,
      createdAt: row.invoiceDate || new Date().toISOString(),
      source: "priority1",
      externalInvoiceId: stableDocumentKey("priority1", ["invoice", invoiceNumber || bolNumber || proNumber || referenceNumber]),
      carrierName: "Priority1",
      carrierShipmentId: providerShipmentId || proNumber || bolNumber || null,
      carrierEntityId: null,
      rawCarrierResponse: row,
      syncedAt: new Date().toISOString()
    };
  });
}

export function priority1InvoiceRows(payload) {
  return Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.customerInvoices)
      ? payload.customerInvoices
      : Array.isArray(payload?.invoices)
        ? payload.invoices
        : Array.isArray(payload)
          ? payload
          : [];
}

export function priority1NextPageToken(payload) {
  return readNestedString(payload, [
    ["nextPage"],
    ["nextPageToken"],
    ["nextCursor"],
    ["cursor", "next"],
    ["pagination", "nextPage"],
    ["pagination", "nextCursor"],
    ["meta", "nextCursor"]
  ]);
}

function matchPriority1Shipment({ providerShipmentId, proNumber, bolNumber, referenceNumber }, shipments) {
  return shipments.find((item) =>
    exact(item.providerShipmentId || item.carrierShipmentId, providerShipmentId) ||
    exact(item.proNumber || item.pro || item.carrierProNumber, proNumber) ||
    exact(item.bolNumber || item.bol || item.carrierBolNumber, bolNumber) ||
    exact(item.referenceNumber, referenceNumber)
  ) || null;
}

function exact(left, right) {
  return Boolean(left && right && String(left).trim() === String(right).trim());
}

export function priority1InvoiceDocument(invoice) {
  if (!invoice?.externalInvoiceId) return null;
  const source = invoice.rawCarrierResponse || {};
  const documentId = readNestedString(source, [
    ["documentId"],
    ["invoiceDocumentId"],
    ["document", "id"],
    ["invoice", "documentId"]
  ]);
  const documentUrl = readNestedString(source, [
    ["documentUrl"],
    ["invoiceDocumentUrl"],
    ["invoiceUrl"],
    ["document", "url"],
    ["invoice", "documentUrl"]
  ]);
  const stableKey = documentId || (documentUrl ? stableUrlReference(documentUrl) : invoice.externalInvoiceId);
  return {
    provider: "priority1",
    shipmentId: invoice.shipmentId || null,
    customerId: invoice.customerId || null,
    externalDocumentKey: stableDocumentKey("priority1", ["invoice", stableKey]),
    documentType: "invoice",
    label: "Carrier Invoice",
    customerVisible: false,
    status: documentUrl ? "available" : "pending",
    providerReference: sanitizeProviderReference({
      documentId,
      url: documentUrl,
      invoiceId: invoice.externalInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      carrierShipmentId: invoice.carrierShipmentId
    }),
    rawMetadata: {},
    fetchedAt: invoice.syncedAt || new Date().toISOString()
  };
}
