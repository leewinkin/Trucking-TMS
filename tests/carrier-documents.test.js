import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppStore } from "../store.js";
import {
  normalizePriority1InvoiceRecords,
  priority1DocumentCapabilitySummary,
  priority1InvoiceDocument,
  priority1PaginationState,
  priority1NextPageToken
} from "../server/carriers/priority1-documents.js";
import { normalizeMothershipInvoiceDocument } from "../server/carriers/mothership-documents.js";
import { normalizeSpeedshipDocuments, speedshipCapabilitySummary } from "../server/carriers/speedship-documents.js";
import { collectUrlDocuments, sanitizeProviderReference } from "../server/carriers/document-normalizer.js";
import { buildAllowedDocumentHosts, fetchSecureDocument, validateDocumentDownloadUrl } from "../server/document-download-security.js";

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
    { id: "ship_p1", customerId: "cust_1", proNumber: "PRO123" }
  ]);
  assert.equal(priority1Invoices.length, 1, "Priority1 invoice records should match shipments by carrier references");
  assert.equal(priority1Invoices[0].shipmentId, "ship_p1");

  const collisionInvoices = normalizePriority1InvoiceRecords({
    invoices: [
      { invoiceNumber: "P1-COLLISION", referenceNumber: "PRO-COLLISION" }
    ]
  }, [
    { id: "ship_collision", customerId: "cust_1", proNumber: "PRO-COLLISION", referenceNumber: "REF-REAL" }
  ]);
  assert.equal(collisionInvoices[0].shipmentId, null, "Priority1 reference number must not match a shipment PRO number");
  assert.equal(priority1NextPageToken({ pagination: { nextCursor: "cursor_2" } }), "cursor_2", "Priority1 pagination cursor should be recognized");
  assert.deepEqual(priority1PaginationState({ pagination: { currentPage: 1, totalPages: 2 } }), { type: "page", page: 2 }, "Priority1 page-number pagination should be explicit");
  assert.equal(priority1PaginationState({ nextPage: 2 }).type, "unsupported", "generic nextPage should not be treated as verified pagination");

  const p1MetadataOnly = priority1InvoiceDocument({ externalInvoiceId: "p1:invoice:1", invoiceNumber: "P1-1", rawCarrierResponse: {} });
  assert.equal(p1MetadataOnly.status, "pending", "Priority1 invoice metadata alone should not create an available document");
  assert.equal(Object.hasOwn(p1MetadataOnly.providerReference, "url"), false, "Priority1 metadata-only document should not fabricate a PDF URL");
  const p1WithUrl = priority1InvoiceDocument({
    externalInvoiceId: "p1:invoice:2",
    invoiceNumber: "P1-2",
    rawCarrierResponse: { documentUrl: "https://priority.example.test/invoice.pdf" }
  });
  assert.equal(p1WithUrl.status, "available", "Priority1 invoice document URL should be available when supplied by fixture");
  const p1WithSignedUrlAndId = priority1InvoiceDocument({
    externalInvoiceId: "p1:invoice:3",
    invoiceNumber: "P1-3",
    rawCarrierResponse: { documentId: "DOC-3", documentUrl: "https://priority.example.test/invoice.pdf?X-Amz-Signature=secret" }
  });
  assert.equal(p1WithSignedUrlAndId.status, "pending", "signed URL with document ID but no refresh contract should remain pending");

  const mothershipMetadataOnly = normalizeMothershipInvoiceDocument({ externalInvoiceId: "ms_1", invoiceNumber: "MS-1", rawCarrierResponse: {} });
  assert.equal(mothershipMetadataOnly.status, "pending", "Mothership invoice metadata alone should not create an available document");

  const speedshipDocs = normalizeSpeedshipDocuments(
    {
      documents: [
        { documentUrl: "https://speedship.example.test/bol.pdf", documentId: "BOL-1", documentType: "BILL_OF_LADING" },
        { documentUrl: "https://speedship.example.test/track", documentId: "TRACK-1", documentType: "TRACKING" },
        { url: "https://speedship.example.test/self", type: "self" },
        { url: "https://speedship.example.test/support", type: "support" }
      ]
    },
    { id: "ship_ss", customerId: "cust_1", status: "local_booking" },
    "PRODUCT-123"
  );
  assert.equal(speedshipDocs.length, 1, "SpeedShip local_booking shipment with valid product transaction ID can reach the document adapter");
  assert.equal(speedshipDocs[0].documentType, "bol", "only verified SpeedShip BOL documents should be normalized");
  assert.equal(speedshipDocs[0].customerVisible, true, "verified SpeedShip BOL should be customer-visible");
  assert.equal(speedshipDocs[0].providerReference.productTransactionId, "PRODUCT-123");
  assert.equal(/^LOCAL-|^demo/i.test("LOCAL-123"), true, "test fixture sanity check for fake references");

  const signed = collectUrlDocuments({
    documentUrl: "https://docs.example.test/bol.pdf?X-Amz-Signature=secret&token=hidden",
    authorization: "Bearer secret",
    nested: { access_token: "hidden", keep: "safe" }
  }, "mothership", "bol")[0];
  assert.equal(signed.status, "pending", "signed URL-only documents should be review-only instead of permanently available");
  assert.equal(signed.externalDocumentKey.includes("X-Amz-Signature"), false, "signed URL query should not be stored in document key");
  assert.equal(JSON.stringify(signed.rawMetadata).includes("hidden"), false, "sensitive metadata should be redacted");
  assert.equal(Object.hasOwn(sanitizeProviderReference({ authorization: "Bearer secret", documentId: "DOC-1" }), "authorization"), false);
  for (const key of ["authorization", "token", "access_token", "api_key", "signature", "sig", "x-amz-signature", "x-amz-credential", "x-amz-security-token"]) {
    assert.equal(Object.hasOwn(sanitizeProviderReference({ [key]: "secret", documentId: "DOC-1" }), key), false, `${key} should be redacted from provider references`);
  }
  const unsigned = collectUrlDocuments({ documentUrl: "https://docs.example.test/bol.pdf" }, "mothership", "bol")[0];
  assert.equal(unsigned.status, "available", "unsigned stable HTTPS URL should be available");

  assert.equal(priority1DocumentCapabilitySummary().skipped, 1);
  assert.match(priority1DocumentCapabilitySummary().message, /schema unavailable/);
  assert.equal(speedshipCapabilitySummary().skipped, 1);
  assert.match(speedshipCapabilitySummary().message, /contract unavailable/);

  const storeSource = await readFile(new URL("../store.js", import.meta.url), "utf8");
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.match(storeSource, /CREATE TABLE IF NOT EXISTS carrier_documents/, "PostgreSQL schema should add carrier_documents");
  assert.match(storeSource, /CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_documents_provider_key/, "PostgreSQL schema should make document upsert idempotent");
  assert.match(storeSource, /ON CONFLICT \(provider, external_document_key\)/, "PostgreSQL carrier document upsert should be atomic");
  assert.match(storeSource, /carrierDocuments: \[\]/, "JSON seed should include carrierDocuments");
  const syncFunctionSource = serverSource.slice(serverSource.indexOf("async function syncCarrierDocumentsForShipment"), serverSource.indexOf("async function downloadCarrierDocument"));
  assert.doesNotMatch(syncFunctionSource, /booked_with_carrier/, "SpeedShip document sync should not require booked_with_carrier status");
  assert.match(serverSource, /!\/\^LOCAL-/i, "fake LOCAL provider references should be rejected");
  assert.match(serverSource, /!\/\^demo/i, "demo provider references should be rejected");

  await assertDocumentSecurity();

  console.log("carrier document tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function assertDocumentSecurity() {
  const allowedHosts = buildAllowedDocumentHosts("https://docs.example.test");
  for (const blocked of [
    "https://127.0.0.1/file.pdf",
    "https://localhost/file.pdf",
    "https://10.0.0.1/file.pdf",
    "https://169.254.169.254/latest/meta-data",
    "http://docs.example.test/file.pdf"
  ]) {
    assert.equal(validateDocumentDownloadUrl(blocked, allowedHosts).ok, false, `${blocked} should be rejected`);
  }
  assert.equal(validateDocumentDownloadUrl("https://docs.example.test/file.pdf", allowedHosts).ok, true, "allowed HTTPS document host should be accepted");
  assert.equal(validateDocumentDownloadUrl("https://user:pass@docs.example.test/file.pdf", allowedHosts).ok, false, "URL credentials should be rejected");
  const privateResolutions = [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "fd00::1"
  ];
  for (const address of privateResolutions) {
    const result = await fetchSecureDocument("https://docs.example.test/file.pdf", {
      allowedHosts,
      resolveHost: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
      requestImpl: async () => response("SHOULD_NOT_FETCH")
    });
    assert.equal(result.ok, false, `allowed hostname resolving to ${address} should be rejected`);
  }
  let requestCount = 0;
  let resolveCount = 0;
  const publicResult = await fetchSecureDocument("https://docs.example.test/file.pdf", {
    allowedHosts,
    resolveHost: async () => {
      resolveCount += 1;
      return [{ address: "93.184.216.34", family: 4 }];
    },
    requestImpl: async (url, addresses) => {
      requestCount += 1;
      assert.equal(addresses[0].address, "93.184.216.34", "request should receive the pinned DNS result");
      return response("PDF", { headers: { "content-type": "application/pdf" } });
    }
  });
  assert.equal(publicResult.ok, true, "allowed hostname resolving to public IP should be allowed");
  assert.equal(resolveCount, 1, "DNS should be resolved once before the pinned request");
  assert.equal(requestCount, 1, "transport should not perform a second test-visible lookup");
  const redirect = await fetchSecureDocument("https://docs.example.test/start", {
    allowedHosts,
    resolveHost: async (hostname) => [{ address: hostname === "docs.example.test" ? "93.184.216.34" : "10.0.0.1", family: 4 }],
    requestImpl: async () => response("", {
      status: 302,
      headers: { location: "https://10.0.0.1/private.pdf" }
    })
  });
  assert.equal(redirect.ok, false, "redirects to private hosts should be rejected");
  let redirectStep = 0;
  const allowedRedirect = await fetchSecureDocument("https://docs.example.test/start", {
    allowedHosts,
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    requestImpl: async () => {
      redirectStep += 1;
      return redirectStep === 1
        ? response("", { status: 302, headers: { location: "https://docs.example.test/file.pdf" } })
        : response("PDF", { headers: { "content-type": "application/pdf" } });
    }
  });
  assert.equal(allowedRedirect.ok, true, "redirect to same allowed public host should work");
  const downloaded = await fetchSecureDocument("https://docs.example.test/file.pdf", {
    allowedHosts,
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    requestImpl: async () => response("PDF", {
      headers: { "content-type": "application/pdf", "content-length": "3" }
    })
  });
  assert.equal(downloaded.ok, true, "available safe document should download");
  assert.equal(downloaded.contentType, "application/pdf");
}

function response(body, options = {}) {
  const headers = new Map(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: !options.status || (options.status >= 200 && options.status < 300),
    status: options.status || 200,
    headers: { get: (key) => headers.get(String(key).toLowerCase()) || null },
    async arrayBuffer() {
      return Buffer.from(body).buffer.slice(Buffer.from(body).byteOffset, Buffer.from(body).byteOffset + Buffer.from(body).byteLength);
    }
  };
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
