import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppStore } from "../store.js";
import {
  normalizePriority1InvoiceRecords,
  priority1DocumentCapabilitySummary
} from "../server/carriers/priority1-documents.js";
import { speedshipCapabilitySummary } from "../server/carriers/speedship-documents.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tms-carrier-documents-"));
const dataFile = path.join(tempDir, "db.json");

try {
  const store = await createAppStore({ dataFile, dbUrl: "" });
  const first = await store.upsertCarrierDocuments([
    documentRecord("doc_bol", "ship_1", "cust_1", "mothership", "bol", true),
    documentRecord("doc_invoice", "ship_1", "cust_1", "priority1", "invoice", false)
  ]);
  assert.deepEqual(first, { created: 2, updated: 0, skipped: 0 }, "JSON store should create carrier documents");

  const second = await store.upsertCarrierDocuments([
    { ...documentRecord("doc_bol_changed", "ship_1", "cust_1", "mothership", "bol", true), label: "Updated BOL" }
  ]);
  assert.deepEqual(second, { created: 0, updated: 1, skipped: 0 }, "upsert should be idempotent by provider and external key");

  const shipmentDocuments = await store.listDocumentsForShipment("ship_1", { customerVisible: true, customerId: "cust_1" });
  assert.deepEqual(shipmentDocuments.map((document) => document.documentType), ["bol"], "customer document filters should return only visible documents");
  assert.equal(shipmentDocuments[0].label, "Updated BOL", "upsert should update existing records");

  const allDocuments = await store.listCarrierDocuments({ provider: "mothership" });
  assert.equal(allDocuments.length, 1, "internal document list should support provider filters");
  assert.equal(Object.hasOwn(allDocuments[0], "providerReference"), true, "internal records retain provider references");
  assert.equal(Object.hasOwn(allDocuments[0], "rawMetadata"), true, "internal records retain raw metadata for troubleshooting");

  const syncError = await store.markCarrierDocumentSyncError({
    provider: "speedship",
    shipmentId: "ship_1",
    customerId: "cust_1",
    message: "contract unavailable"
  });
  assert.equal(syncError.created, 1, "sync errors should persist as document audit records");
  const failed = await store.listCarrierDocuments({ status: "error" });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].provider, "speedship");

  const priority1Invoices = normalizePriority1InvoiceRecords({
    invoices: [
      { invoiceNumber: "P1-1", proNumber: "PRO123", documentUrl: "https://example.test/invoice.pdf" }
    ]
  }, [
    { id: "ship_p1", customerId: "cust_1", carrierShipmentId: "PRO123" }
  ]);
  assert.equal(priority1Invoices.length, 1, "Priority1 invoice records should match shipments by carrier references");
  assert.equal(priority1Invoices[0].shipmentId, "ship_p1");

  assert.equal(priority1DocumentCapabilitySummary().skipped, 1);
  assert.match(priority1DocumentCapabilitySummary().message, /schema unavailable/);
  assert.equal(speedshipCapabilitySummary().skipped, 1);
  assert.match(speedshipCapabilitySummary().message, /contract unavailable/);

  const storeSource = await readFile(new URL("../store.js", import.meta.url), "utf8");
  assert.match(storeSource, /CREATE TABLE IF NOT EXISTS carrier_documents/, "PostgreSQL schema should add carrier_documents");
  assert.match(storeSource, /CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_documents_provider_key/, "PostgreSQL schema should make document upsert idempotent");
  assert.match(storeSource, /carrierDocuments: \[\]/, "JSON seed should include carrierDocuments");

  console.log("carrier document tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function documentRecord(id, shipmentId, customerId, provider, type, customerVisible) {
  return {
    id,
    shipmentId,
    customerId,
    provider,
    externalDocumentKey: `${provider}:${shipmentId}:${type}`,
    documentType: type,
    label: type.toUpperCase(),
    filename: `${type}.pdf`,
    contentType: "application/pdf",
    customerVisible,
    status: "available",
    providerReference: { url: "https://example.test/document.pdf" },
    rawMetadata: { raw: true },
    fetchedAt: "2026-07-29T00:00:00.000Z",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z"
  };
}
