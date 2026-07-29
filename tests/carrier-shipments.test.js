import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppStore } from "../store.js";
import { fetchMothershipHistoricalShipments } from "../server/carriers/mothership-shipments.js";
import { fetchPriority1HistoricalShipments } from "../server/carriers/priority1-shipments.js";
import { fetchSpeedshipHistoricalShipments } from "../server/carriers/speedship-shipments.js";
import {
  applyAutomaticShipmentMatch,
  classifyCarrierShipmentBookingChannel,
  matchImportedCarrierShipment,
  sanitizeCarrierShipmentPayload
} from "../server/carriers/carrier-shipment-normalizer.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tms-carrier-shipments-"));
const dataFile = path.join(tempDir, "db.json");

try {
  const store = await createAppStore({ dataFile, dbUrl: "" });
  const first = await store.upsertCarrierShipments([
    carrierShipmentRecord({ provider: "mothership", externalShipmentId: "MS-1", carrierName: "TForce Freight" }),
    carrierShipmentRecord({ provider: "priority1", externalShipmentId: "P1-1", carrierName: "Old Dominion" }),
    carrierShipmentRecord({ provider: "speedship", externalShipmentId: "SS-1", carrierName: "SAIA" })
  ]);
  assert.deepEqual(first, { created: 3, updated: 0, skipped: 0 }, "shared JSON store should create all provider records");

  const second = await store.upsertCarrierShipments([
    carrierShipmentRecord({ provider: "mothership", externalShipmentId: "MS-1", carrierName: "Updated Carrier", bookingChannel: "provider_portal" })
  ]);
  assert.deepEqual(second, { created: 0, updated: 1, skipped: 0 }, "upsert should be idempotent by provider and external shipment ID");

  const all = await store.listCarrierShipments();
  assert.equal(all.length, 3);
  const mothership = all.find((shipment) => shipment.provider === "mothership");
  assert.equal(mothership.carrierName, "Updated Carrier");
  assert.equal(mothership.importSource, "provider_import");
  assert.equal(mothership.bookingChannel, "provider_portal");
  assert.equal(mothership.matchingStatus, "unmatched");

  const filtered = await store.listCarrierShipments({ provider: "priority1" });
  assert.deepEqual(filtered.map((shipment) => shipment.externalShipmentId), ["P1-1"], "provider filter should use shared carrier shipment records");

  const linked = await store.updateCarrierShipment(mothership.id, {
    linkedShipmentId: "ship_local_1",
    customerId: "cust_1",
    matchingStatus: "manual"
  });
  assert.equal(linked.linkedShipmentId, "ship_local_1");
  assert.equal(linked.customerId, "cust_1");
  assert.equal(linked.matchingStatus, "manual");
  await store.updateCarrierShipment(mothership.id, {
    bookingChannel: "provider_portal",
    bookingChannelEvidence: { source: "manual_admin_confirmation", confirmedByUserId: "admin_1" }
  });
  await store.upsertCarrierShipments([
    carrierShipmentRecord({
      provider: "mothership",
      externalShipmentId: "MS-1",
      carrierName: "Provider Updated",
      linkedShipmentId: "auto_ship",
      customerId: "auto_customer",
      matchingStatus: "matched",
      bookingChannel: "unknown",
      bookingChannelEvidence: {}
    })
  ]);
  const preserved = await store.getCarrierShipment(mothership.id);
  assert.equal(preserved.linkedShipmentId, "ship_local_1", "manual link survives repeated sync");
  assert.equal(preserved.customerId, "cust_1", "manual customer assignment survives repeated sync");
  assert.equal(preserved.matchingStatus, "manual", "manual matching status survives repeated sync");
  assert.equal(preserved.bookingChannel, "provider_portal", "manual provider portal confirmation survives repeated sync");
  assert.equal(preserved.bookingChannelEvidence.source, "manual_admin_confirmation");
  assert.equal(preserved.carrierName, "Provider Updated", "provider facts still update during sync");

  const unlinked = await store.updateCarrierShipment(mothership.id, {
    linkedShipmentId: null,
    customerId: null,
    matchingStatus: "manual",
    bookingChannelEvidence: { source: "manual_admin_unlink" }
  });
  assert.equal(unlinked.linkedShipmentId, null, "explicit unlink clears local shipment");
  assert.equal(unlinked.customerId, null, "explicit unlink clears customer");
  assert.equal(unlinked.matchingStatus, "manual", "explicit unlink remains a manual administrator decision");

  const unsupported = await Promise.all([
    fetchMothershipHistoricalShipments({}),
    fetchPriority1HistoricalShipments({}),
    fetchSpeedshipHistoricalShipments({})
  ]);
  assert.deepEqual(unsupported.map((result) => result.capability.status), ["unsupported", "unsupported", "unsupported"]);
  assert.match(unsupported[0].capability.message, /Mothership historical shipment list API contract is unavailable/);
  assert.match(unsupported[1].capability.message, /Priority1 historical shipment list API contract is unavailable/);
  assert.match(unsupported[2].capability.message, /SpeedShip historical shipment list API contract is unavailable/);
  assert.equal(unsupported[0].shipments.length, 0, "unsupported adapters import zero records");

  const fixture = await fetchMothershipHistoricalShipments({
    fixtureRecords: [
      {
        shipmentId: "MS-FIXTURE-1",
        entityId: "ENT-FIXTURE-1",
        confirmationNumber: "CONF-FIXTURE-1",
        carrierName: "Forward Air",
        origin: { city: "Ontario", state: "CA" },
        destination: { city: "Dallas", state: "TX" },
        authorization: "Bearer hidden"
      }
    ]
  });
  assert.equal(fixture.capability.status, "successful", "fixture adapter can import normalized records without inventing endpoints");
  assert.equal(fixture.shipments[0].externalShipmentId, "MS-FIXTURE-1");
  assert.equal(fixture.shipments[0].carrierName, "Forward Air");
  assert.equal(Object.hasOwn(fixture.shipments[0].rawProviderRecord, "authorization"), false, "fixture adapter redacts raw provider payload");

  assertExactMatchingAndBookingClassification();
  assertRawPayloadRedaction();

  const storeSource = await readFile(new URL("../store.js", import.meta.url), "utf8");
  assert.match(storeSource, /CREATE TABLE IF NOT EXISTS carrier_shipments/, "PostgreSQL schema should add shared carrier_shipments table");
  assert.match(storeSource, /provider text NOT NULL CHECK \(provider IN \('mothership', 'priority1', 'speedship'\)\)/, "schema should constrain allowed providers");
  assert.match(storeSource, /import_source text NOT NULL DEFAULT 'provider_import'/, "schema should store import_source separately from provider");
  assert.match(storeSource, /booking_channel text NOT NULL DEFAULT 'unknown'/, "schema should not infer booking channel");
  assert.match(storeSource, /booking_channel_evidence jsonb NOT NULL DEFAULT '\{\}'::jsonb/, "schema should store booking channel evidence");
  assert.match(storeSource, /linked_shipment_id text REFERENCES shipments\(id\)/, "schema should link to local shipments without creating fake shipments");
  assert.match(storeSource, /customer_id text REFERENCES customers\(id\)/, "schema should link to real customers only");
  assert.match(storeSource, /matching_status text NOT NULL DEFAULT 'unmatched'/, "schema should track explicit matching status");
  for (const indexField of ["entity_id", "transaction_id", "confirmation_number", "reference_number", "pro_number", "bol_number", "customer_id", "matching_status", "last_provider_update"]) {
    assert.match(storeSource, new RegExp(`carrier_shipments_${indexField}|${indexField} ON carrier_shipments`), `${indexField} should have an idempotent index`);
  }

  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.match(serverSource, /url\.pathname === "\/api\/carrier-shipments"/, "server should expose manager-only imported shipment listing");
  assert.match(serverSource, /url\.pathname === "\/api\/carrier-shipments\/sync"/, "server should expose manager-only historical sync");
  assert.match(serverSource, /requireManager\(currentUser\);[\s\S]*api\/carrier-shipments/, "carrier shipment management APIs should require manager access");
  assert.doesNotMatch(serverSource, /customer name|date proximity|reference-number similarity/i, "booking channel should not be inferred from fuzzy fields");
  assert.match(serverSource, /syncImportedCarrierShipmentDocuments/, "syncDocuments should use imported carrier shipment records");
  assert.match(serverSource, /normalizeImportedShipmentDocuments/, "imported document sync should normalize unmatched/customer-visible behavior");
  assert.match(serverSource, /customerVisible: linked && \["bol", "pod"\]\.includes\(document\.documentType\)/, "linked BOL/POD may be visible but unmatched and invoices remain internal");

  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(appSource, /All Providers/, "UI should include provider filter");
  assert.match(appSource, /Booked via TMS/, "UI should include booking source filter");
  assert.match(appSource, /data-sync-carrier-shipments/, "UI should include historical sync action");
  assert.match(appSource, /data-carrier-shipment-action="confirm-provider-portal"/, "UI should include provider portal confirmation action");
  assert.match(appSource, /if \(!canManageCarrierInvoices\(\)\) \{\s*return "";\s*\}/, "carrier shipment panel should not render for staff/customer users");
  assert.match(appSource, /function openCarrierShipmentLinkModal/, "linking should use a searchable modal");
  assert.match(appSource, /data-carrier-shipment-link-search/, "link modal should be searchable");
  assert.doesNotMatch(appSource, /window\.prompt\(t\("Enter local shipment ID to link\."\)\)/, "linking should not prompt for a raw shipment ID");

  console.log("carrier shipment tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function assertExactMatchingAndBookingClassification() {
  const localShipments = [
    localShipment({
      id: "ship_external",
      carrier: "mothership",
      carrierShipmentId: "MS-EXACT",
      carrierEntityId: "ENT-EXACT",
      confirmationNumber: "CONF-EXACT",
      referenceNumber: "REF-EXACT",
      carrierShipment: { request: { quoteId: "q", rateId: "r" }, response: { id: "MS-EXACT" } },
      status: "booked_with_carrier"
    }),
    localShipment({ id: "ship_pro", proNumber: "PRO-EXACT", carrierShipment: { response: { proNumber: "PRO-EXACT" } } }),
    localShipment({ id: "ship_ref_a", referenceNumber: "DUP-REF" }),
    localShipment({ id: "ship_ref_b", referenceNumber: "DUP-REF" })
  ];

  const externalMatch = matchImportedCarrierShipment(carrierShipmentRecord({ provider: "mothership", externalShipmentId: "MS-EXACT" }), localShipments);
  assert.equal(externalMatch.status, "matched");
  assert.equal(externalMatch.shipment.id, "ship_external");

  const proMatch = matchImportedCarrierShipment(carrierShipmentRecord({ externalShipmentId: "NOPE", entityId: "", transactionId: "", confirmationNumber: "", proNumber: "PRO-EXACT" }), localShipments);
  assert.equal(proMatch.status, "matched", "exact PRO should match only the same PRO field");
  assert.equal(proMatch.shipment.id, "ship_pro");

  const conflict = matchImportedCarrierShipment(carrierShipmentRecord({ externalShipmentId: "NOPE", entityId: "", transactionId: "", confirmationNumber: "", proNumber: "", bolNumber: "", referenceNumber: "DUP-REF" }), localShipments);
  assert.equal(conflict.status, "conflict", "duplicate exact reference should become conflict");

  const crossField = matchImportedCarrierShipment(carrierShipmentRecord({ externalShipmentId: "NOPE", entityId: "", transactionId: "", confirmationNumber: "", proNumber: "CONF-EXACT", bolNumber: "", referenceNumber: "" }), localShipments);
  assert.equal(crossField.status, "unmatched", "cross-field values must not match");

  const localBooking = localShipment({ id: "local_only", carrier: "mothership", carrierShipmentId: "MS-LOCAL", status: "local_booking" });
  assert.equal(classifyCarrierShipmentBookingChannel(carrierShipmentRecord({ externalShipmentId: "MS-LOCAL" }), localBooking).bookingChannel, "unknown", "local_booking is not tms_api");
  assert.equal(classifyCarrierShipmentBookingChannel(carrierShipmentRecord({ externalShipmentId: "MS-EXACT" }), localShipments[0]).bookingChannel, "tms_api", "verified booking response exact ID is tms_api");

  const applied = applyAutomaticShipmentMatch(carrierShipmentRecord({ provider: "mothership", externalShipmentId: "MS-EXACT" }), localShipments);
  assert.equal(applied.linkedShipmentId, "ship_external");
  assert.equal(applied.customerId, "cust_1");
  assert.equal(applied.matchingStatus, "matched");
  assert.equal(applied.bookingChannel, "tms_api");
}

function assertRawPayloadRedaction() {
  const redacted = sanitizeCarrierShipmentPayload({
    authorization: "Bearer abc",
    bearer: "abc",
    token: "abc",
    access_token: "abc",
    api_key: "abc",
    cookie: "abc",
    "set-cookie": "abc",
    password: "abc",
    secret: "abc",
    signature: "abc",
    sig: "abc",
    "x-amz-signature": "abc",
    nested: {
      url: "https://docs.example.test/file.pdf?X-Amz-Signature=hidden&safe=1",
      keep: "ok"
    }
  });
  const serialized = JSON.stringify(redacted);
  for (const forbidden of ["authorization", "bearer", "token", "access_token", "api_key", "cookie", "set-cookie", "password", "secret", "signature", "sig", "x-amz-signature", "hidden"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} should be redacted`);
  }
  assert.equal(redacted.nested.url, "https://docs.example.test/file.pdf", "signed URL query parameters should be stripped");
  assert.equal(redacted.nested.keep, "ok");
}

function localShipment(overrides = {}) {
  return {
    id: "ship_1",
    customerId: "cust_1",
    carrier: "mothership",
    carrierShipmentId: "MS-1",
    carrierEntityId: "ENT-1",
    confirmationNumber: "CONF-1",
    referenceNumber: "REF-1",
    status: "booked_with_carrier",
    carrierShipment: {},
    ...overrides
  };
}

function carrierShipmentRecord(overrides = {}) {
  return {
    provider: "mothership",
    importSource: "provider_import",
    bookingChannel: "unknown",
    bookingChannelEvidence: {},
    matchingStatus: "unmatched",
    externalShipmentId: "EXT-1",
    entityId: "ENT-1",
    transactionId: "TX-1",
    confirmationNumber: "CONF-1",
    referenceNumber: "REF-1",
    proNumber: "PRO-1",
    bolNumber: "BOL-1",
    origin: { city: "Ontario", state: "CA", zip: "91761" },
    destination: { city: "Dallas", state: "TX", zip: "75001" },
    carrierName: "Contracted Carrier",
    service: "LTL",
    status: "created",
    carrierCost: 125,
    rawProviderRecord: { id: "raw-1" },
    lastProviderUpdate: "2026-07-20T12:00:00.000Z",
    ...overrides
  };
}
