import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPublicUser } from "../server/auth/public-user.js";
import { createAppStore } from "../store.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tms-org-migration-"));
const dataFile = path.join(tempDir, "db.json");

try {
  const now = new Date().toISOString();
  await writeFile(
    dataFile,
    `${JSON.stringify(
      {
        customers: [
          {
            id: "cust_a",
            companyName: "Customer A",
            billingEmail: "a@example.com",
            paymentTerms: "Net 15",
            allowedCarrierModes: ["demo"],
            allowedBooking: true,
            allowedBookingCarrierModes: ["demo"],
            status: "active",
            createdAt: now
          },
          {
            id: "cust_b",
            companyName: "Customer B",
            billingEmail: "b@example.com",
            paymentTerms: "Net 15",
            allowedCarrierModes: ["demo"],
            allowedBooking: true,
            allowedBookingCarrierModes: ["demo"],
            status: "active",
            createdAt: now
          }
        ],
        tariffRules: [],
        users: [
          userRecord("user_admin", "admin@local.test", "admin", null),
          userRecord("user_customer_a", "customer@local.test", "customer", "cust_a"),
          userRecord("user_orphan", "orphan@example.com", "customer", "missing_customer")
        ],
        sessions: [],
        quotes: [
          { id: "quote_valid", customerId: "cust_a", customerName: "Customer A" },
          { id: "quote_missing", customerId: "missing_customer", customerName: "Missing Customer" }
        ],
        shipments: [
          { id: "ship_valid", customerId: "cust_a", customerName: "Customer A" },
          { id: "ship_missing", customerId: "missing_customer", customerName: "Missing Customer" }
        ],
        invoices: [
          { id: "inv_valid", customerId: "cust_a", customerName: "Customer A" },
          { id: "inv_missing", customerId: "missing_customer", customerName: "Missing Customer" }
        ],
        trackingEvents: []
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const store = await createAppStore({ dataFile });
  const firstSummary = await store.getOrganizationMigrationSummary();
  const migrated = await readJson(dataFile);

  assert.equal(migrated.organizations.filter((organization) => organization.type === "internal").length, 1);
  assert.equal(migrated.organizations.filter((organization) => organization.type === "customer").length, 2);
  assert.equal(new Set(migrated.organizations.filter((organization) => organization.type === "customer").map((organization) => organization.legacyCustomerId)).size, 2);
  assert.ok(firstSummary.created >= 5, "initial migration should create orgs and memberships");
  assert.ok(firstSummary.unresolved >= 3, "missing customer ownership should be reported");

  const internalContext = await store.getOrganizationContextForUser(migrated.users.find((user) => user.id === "user_admin"));
  assert.equal(internalContext.organizationType, "internal");
  assert.equal(internalContext.role, "admin");
  assert.equal(internalContext.source, "membership");

  const customerContext = await store.getOrganizationContextForUser(migrated.users.find((user) => user.id === "user_customer_a"));
  assert.equal(customerContext.organizationType, "customer");
  assert.equal(customerContext.role, "customer_admin");
  assert.equal(customerContext.customerOrganizationId, customerContext.organizationId);
  assert.equal(customerContext.source, "membership");

  assert.ok(migrated.quotes.find((quote) => quote.id === "quote_valid").customerOrganizationId);
  assert.equal(migrated.quotes.find((quote) => quote.id === "quote_missing").customerOrganizationId, undefined);
  assert.ok(migrated.shipments.find((shipment) => shipment.id === "ship_valid").customerOrganizationId);
  assert.equal(migrated.shipments.find((shipment) => shipment.id === "ship_missing").customerOrganizationId, undefined);
  assert.ok(migrated.invoices.find((invoice) => invoice.id === "inv_valid").customerOrganizationId);
  assert.equal(migrated.invoices.find((invoice) => invoice.id === "inv_missing").customerOrganizationId, undefined);

  await createAppStore({ dataFile });
  const migratedAgain = await readJson(dataFile);
  assert.equal(migratedAgain.organizations.filter((organization) => organization.type === "internal").length, 1);
  assert.equal(migratedAgain.organizations.filter((organization) => organization.type === "customer").length, 2);
  assert.equal(migratedAgain.organizationUsers.filter((membership) => membership.status === "active").length, 2);

  const createdQuote = await store.createQuote({
    id: "quote_new",
    customerId: "cust_a",
    customerName: "Customer A",
    carrierMode: "multiCarrier",
    carrierModes: ["demo"],
    carrier: "demo",
    carrierQuoteId: "carrier_quote_new",
    referenceNumber: "PO-1",
    pickup: {},
    delivery: {},
    freight: [],
    pickupReadyDate: {},
    tariffRule: {},
    rates: [],
    status: "quoted",
    createdByUserId: "user_customer_a",
    createdByOrganizationId: customerContext.organizationId,
    createdAt: now
  });
  assert.equal(createdQuote.customerId, "cust_a");
  assert.equal(createdQuote.customerOrganizationId, customerContext.organizationId);
  assert.equal(createdQuote.createdByUserId, "user_customer_a");

  const shipmentResult = await store.createShipment({
    quoteId: "quote_new",
    shipment: {
      id: "ship_new",
      customerId: "cust_a",
      customerName: "Customer A",
      carrier: "demo",
      carrierName: "Demo",
      carrierShipmentId: "demo_ship",
      confirmationNumber: "LOCAL-1",
      referenceNumber: "PO-1",
      pickup: {},
      delivery: {},
      freight: [],
      carrierCost: 100,
      sellPrice: 125,
      margin: 25,
      provider: "demo",
      service: "Demo",
      status: "local_booking",
      pickupDate: {},
      carrierShipment: null,
      createdByUserId: "user_customer_a",
      createdByOrganizationId: customerContext.organizationId,
      createdAt: now
    },
    invoice: {
      referenceNumber: "PO-1",
      amount: 125,
      status: "draft",
      issuedAt: null,
      dueAt: null,
      createdAt: now
    }
  });
  assert.equal(shipmentResult.shipment.customerOrganizationId, customerContext.organizationId);
  assert.equal(shipmentResult.invoice.customerOrganizationId, customerContext.organizationId);

  const finalDb = await readJson(dataFile);
  assert.equal(finalDb.organizations.filter((organization) => organization.type === "agent").length, 0, "Phase 1 should not grant agent access");
  assert.equal(finalDb.agentCustomerRelationships.length, 0, "Phase 1 should not assign agent customers");

  const mePayload = buildPublicUser(migrated.users.find((user) => user.id === "user_customer_a"), customerContext);
  assert.equal(mePayload.id, "user_customer_a");
  assert.equal(mePayload.role, "customer");
  assert.equal(mePayload.customerId, "cust_a");
  assert.equal(mePayload.organizationContext.organizationId, customerContext.organizationId);
  assert.equal(mePayload.organizationContext.organizationType, "customer");

  console.log("organization migration tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function userRecord(id, email, role, customerId) {
  return {
    id,
    email,
    role,
    customerId,
    status: "active",
    passwordSalt: "test",
    passwordHash: "test",
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
