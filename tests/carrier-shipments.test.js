import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppStore } from "../store.js";
import { fetchMothershipHistoricalShipments } from "../server/carriers/mothership-shipments.js";
import { fetchPriority1HistoricalShipments } from "../server/carriers/priority1-shipments.js";
import { fetchSpeedshipHistoricalShipments } from "../server/carriers/speedship-shipments.js";

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

  const unsupported = await Promise.all([
    fetchMothershipHistoricalShipments({}),
    fetchPriority1HistoricalShipments({}),
    fetchSpeedshipHistoricalShipments({})
  ]);
  assert.deepEqual(unsupported.map((result) => result.capability.status), ["unsupported", "unsupported", "unsupported"]);
  assert.match(unsupported[0].capability.message, /Mothership historical shipment list API contract is unavailable/);
  assert.match(unsupported[1].capability.message, /Priority1 historical shipment list API contract is unavailable/);
  assert.match(unsupported[2].capability.message, /SpeedShip historical shipment list API contract is unavailable/);

  const storeSource = await readFile(new URL("../store.js", import.meta.url), "utf8");
  assert.match(storeSource, /CREATE TABLE IF NOT EXISTS carrier_shipments/, "PostgreSQL schema should add shared carrier_shipments table");
  assert.match(storeSource, /provider text NOT NULL CHECK \(provider IN \('mothership', 'priority1', 'speedship'\)\)/, "schema should constrain allowed providers");
  assert.match(storeSource, /import_source text NOT NULL DEFAULT 'provider_import'/, "schema should store import_source separately from provider");
  assert.match(storeSource, /booking_channel text NOT NULL DEFAULT 'unknown'/, "schema should not infer booking channel");
  assert.match(storeSource, /booking_channel_evidence jsonb NOT NULL DEFAULT '\{\}'::jsonb/, "schema should store booking channel evidence");
  assert.match(storeSource, /linked_shipment_id text REFERENCES shipments\(id\)/, "schema should link to local shipments without creating fake shipments");
  assert.match(storeSource, /customer_id text REFERENCES customers\(id\)/, "schema should link to real customers only");
  assert.match(storeSource, /matching_status text NOT NULL DEFAULT 'unmatched'/, "schema should track explicit matching status");

  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.match(serverSource, /url\.pathname === "\/api\/carrier-shipments"/, "server should expose manager-only imported shipment listing");
  assert.match(serverSource, /url\.pathname === "\/api\/carrier-shipments\/sync"/, "server should expose manager-only historical sync");
  assert.match(serverSource, /requireManager\(currentUser\);[\s\S]*api\/carrier-shipments/, "carrier shipment management APIs should require manager access");
  assert.doesNotMatch(serverSource, /customer name|date proximity|reference-number similarity/i, "booking channel should not be inferred from fuzzy fields");

  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(appSource, /All Providers/, "UI should include provider filter");
  assert.match(appSource, /Booked via TMS/, "UI should include booking source filter");
  assert.match(appSource, /data-sync-carrier-shipments/, "UI should include historical sync action");
  assert.match(appSource, /data-carrier-shipment-action="confirm-provider-portal"/, "UI should include provider portal confirmation action");
  assert.match(appSource, /if \(!canManageCarrierInvoices\(\)\) \{\s*return "";\s*\}/, "carrier shipment panel should not render for staff/customer users");

  console.log("carrier shipment tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
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
