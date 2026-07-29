import { sanitizeProviderReference, stableDocumentKey } from "./document-normalizer.js";

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
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.customerInvoices)
      ? payload.customerInvoices
      : Array.isArray(payload?.invoices)
        ? payload.invoices
        : Array.isArray(payload)
          ? payload
          : [];
  return rows.map((row) => {
    const invoiceNumber = String(row.invoiceNumber || row.customerInvoiceNumber || row.id || "").trim();
    const bolNumber = String(row.bolNumber || row.bol || row.BOL || "").trim();
    const proNumber = String(row.proNumber || row.pro || row.PRO || "").trim();
    const referenceNumber = String(row.referenceNumber || row.purchaseOrderNumber || row.poNumber || "").trim();
    const shipment = shipments.find((item) =>
      [item.carrierShipmentId, item.confirmationNumber, item.referenceNumber].filter(Boolean).some((value) =>
        [proNumber, bolNumber, referenceNumber].includes(String(value).trim())
      )
    ) || null;
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
      carrierShipmentId: proNumber || bolNumber || null,
      carrierEntityId: null,
      rawCarrierResponse: row,
      syncedAt: new Date().toISOString()
    };
  });
}

export function priority1InvoiceDocument(invoice) {
  if (!invoice?.externalInvoiceId) return null;
  return {
    provider: "priority1",
    shipmentId: invoice.shipmentId || null,
    customerId: invoice.customerId || null,
    externalDocumentKey: stableDocumentKey("priority1", ["invoice", invoice.externalInvoiceId]),
    documentType: "invoice",
    label: "Carrier Invoice",
    customerVisible: false,
    status: "available",
    providerReference: sanitizeProviderReference({
      invoiceId: invoice.externalInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      carrierShipmentId: invoice.carrierShipmentId
    }),
    rawMetadata: {},
    fetchedAt: invoice.syncedAt || new Date().toISOString()
  };
}
