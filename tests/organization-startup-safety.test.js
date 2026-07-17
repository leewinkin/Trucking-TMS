import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppStore } from "../store.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tms-org-startup-safety-"));

try {
  const defaultStartupFile = path.join(tempDir, "default-startup.json");
  await writeSeedDb(defaultStartupFile);

  const store = await createAppStore({ dataFile: defaultStartupFile });
  const defaultSummary = await store.getOrganizationMigrationSummary();
  const defaultStartupDb = await readJson(defaultStartupFile);
  assert.equal(defaultSummary.created, 0);
  assert.equal(defaultSummary.updated, 0);
  assert.equal(defaultStartupDb.organizations, undefined, "normal startup should not persist organization backfill data");

  const legacyQuote = await store.createQuote({
    id: "quote_legacy",
    customerId: "cust_a",
    customerName: "Customer A",
    carrierMode: "multiCarrier",
    carrierModes: ["demo"],
    carrier: "demo",
    carrierQuoteId: "carrier_quote_legacy",
    referenceNumber: "LEGACY-1",
    pickup: {},
    delivery: {},
    freight: [],
    pickupReadyDate: {},
    tariffRule: {},
    rates: [],
    status: "quoted",
    createdAt: new Date().toISOString()
  });
  assert.equal(legacyQuote.customerId, "cust_a");
  assert.equal(legacyQuote.customerOrganizationId, null, "legacy quote creation should still work before backfill");

  const startupMigrationFile = path.join(tempDir, "env-startup.json");
  await writeSeedDb(startupMigrationFile);
  const previousStartupFlag = process.env.RUN_ORGANIZATION_MIGRATION_ON_STARTUP;
  process.env.RUN_ORGANIZATION_MIGRATION_ON_STARTUP = "1";
  try {
    const migratedStore = await createAppStore({ dataFile: startupMigrationFile });
    const migratedSummary = await migratedStore.getOrganizationMigrationSummary();
    const migratedDb = await readJson(startupMigrationFile);
    assert.ok(migratedSummary.created > 0, "env-gated startup migration should run");
    assert.equal(migratedDb.organizations.filter((organization) => organization.type === "internal").length, 1);
    assert.equal(migratedDb.quotes.find((quote) => quote.id === "quote_valid").customerOrganizationId, migratedDb.organizations.find((organization) => organization.legacyCustomerId === "cust_a").id);
  } finally {
    if (previousStartupFlag === undefined) {
      delete process.env.RUN_ORGANIZATION_MIGRATION_ON_STARTUP;
    } else {
      process.env.RUN_ORGANIZATION_MIGRATION_ON_STARTUP = previousStartupFlag;
    }
  }

  const cliFile = path.join(tempDir, "cli.json");
  await writeSeedDb(cliFile);
  const firstRun = runMigrationCommand(cliFile);
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.match(firstRun.stdout, /Organization migration summary/);
  const afterFirstRun = await readJson(cliFile);
  assert.equal(afterFirstRun.organizations.filter((organization) => organization.type === "internal").length, 1);
  assert.equal(afterFirstRun.organizations.filter((organization) => organization.type === "customer").length, 1);
  assert.equal(afterFirstRun.organizationUsers.filter((membership) => membership.status === "active").length, 2);

  const secondRun = runMigrationCommand(cliFile);
  assert.equal(secondRun.status, 0, secondRun.stderr);
  const afterSecondRun = await readJson(cliFile);
  assert.equal(afterSecondRun.organizations.filter((organization) => organization.type === "internal").length, 1);
  assert.equal(afterSecondRun.organizations.filter((organization) => organization.type === "customer").length, 1);
  assert.equal(afterSecondRun.organizationUsers.filter((membership) => membership.status === "active").length, 2);

  const invalidFile = path.join(tempDir, "invalid.json");
  await writeFile(invalidFile, "{ invalid json", "utf8");
  const failedRun = runMigrationCommand(invalidFile);
  assert.notEqual(failedRun.status, 0, "migration command should exit nonzero on failure");
  assert.match(failedRun.stderr, /Organization migration failed/);

  console.log("organization startup safety tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function runMigrationCommand(dataFile) {
  return spawnSync("npm", ["run", "migrate:organizations", "--silent"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_LOCAL_JSON_STORE: "1",
      DATA_FILE_PATH: dataFile
    },
    encoding: "utf8"
  });
}

async function writeSeedDb(file) {
  const now = new Date().toISOString();
  await writeFile(
    file,
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
          }
        ],
        tariffRules: [],
        users: [
          userRecord("user_admin", "admin@local.test", "admin", null),
          userRecord("user_customer_a", "customer@local.test", "customer", "cust_a")
        ],
        sessions: [],
        quotes: [{ id: "quote_valid", customerId: "cust_a", customerName: "Customer A" }],
        shipments: [{ id: "ship_valid", customerId: "cust_a", customerName: "Customer A" }],
        invoices: [{ id: "inv_valid", customerId: "cust_a", customerName: "Customer A" }],
        trackingEvents: []
      },
      null,
      2
    )}\n`,
    "utf8"
  );
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
