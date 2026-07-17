import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppStore } from "../store.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tms-address-book-"));
const dataFile = path.join(tempDir, "db.json");

try {
  const now = new Date().toISOString();
  await writeFile(
    dataFile,
    `${JSON.stringify(
      {
        customers: [
          customer("cust_a", "Customer A"),
          customer("cust_b", "Customer B")
        ],
        tariffRules: [],
        users: [],
        sessions: [],
        organizations: [
          organization("org_a", "cust_a"),
          organization("org_b", "cust_b")
        ],
        organizationUsers: [],
        agentCustomerRelationships: [],
        addressBookEntries: [
          address("addr_a", "cust_a", "org_a", "A Dock"),
          address("addr_b", "cust_b", "org_b", "B Dock")
        ],
        carrierPreferences: [],
        quotes: [],
        shipments: [],
        invoices: [],
        trackingEvents: []
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const store = await createAppStore({ dataFile });
  const customerAEntries = await store.listAddressBookEntries({ customerId: "cust_a" });
  assert.equal(customerAEntries.length, 1, "customer A should only see its own address");
  assert.equal(customerAEntries[0].id, "addr_a");

  const customerBEntries = await store.listAddressBookEntries({ customerId: "cust_b" });
  assert.equal(customerBEntries.length, 1, "customer B should only see its own address");
  assert.equal(customerBEntries[0].id, "addr_b");

  const created = await store.createAddressBookEntry({
    customerId: "cust_a",
    customerOrganizationId: "org_a",
    label: "A Delivery",
    usageType: "delivery",
    companyName: "Customer A Receiver",
    street: "10 Receiver Rd",
    city: "Austin",
    state: "tx",
    zip: "78701",
    country: "US",
    phone: "5125550100",
    email: "receiver@example.com",
    openTime: "0900",
    closeTime: "1700",
    defaultAccessorials: ["appointment", "liftgate"],
    isDefaultPickup: false,
    isDefaultDelivery: true,
    createdByUserId: "user_staff"
  });
  assert.equal(created.customerId, "cust_a");
  assert.equal(created.customerOrganizationId, "org_a");
  assert.equal(created.state, "TX");
  assert.deepEqual(created.defaultAccessorials, ["appointment", "liftgate"]);

  const updated = await store.updateAddressBookEntry(created.id, {
    ...created,
    label: "A Delivery Updated",
    usageType: "both",
    companyName: "Customer A Receiver Updated",
    street: created.street,
    city: created.city,
    state: created.state,
    zip: created.zip,
    country: created.country,
    phone: created.phone,
    email: created.email,
    openTime: created.openTime,
    closeTime: created.closeTime,
    defaultAccessorials: ["appointment"],
    isDefaultPickup: true,
    isDefaultDelivery: true
  });
  assert.equal(updated.label, "A Delivery Updated");
  assert.equal(updated.usageType, "both");
  assert.equal(updated.isDefaultPickup, true);
  assert.deepEqual(updated.defaultAccessorials, ["appointment"]);

  await store.deleteAddressBookEntry(created.id);
  const afterDelete = await store.listAddressBookEntries({ customerId: "cust_a" });
  assert.equal(afterDelete.some((entry) => entry.id === created.id), false, "deleted entries should not list");

  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /data-save-address/, "address save should require an explicit save control");
  assert.match(app, /data-update-address/, "address update should require an explicit update control");
  assert.doesNotMatch(app, /autosaveAddress|autoSaveAddress/, "address book must not autosave");

  const preference = await store.createCarrierPreference({
    customerId: "cust_a",
    customerOrganizationId: "org_a",
    carrierKey: "XPOL",
    carrierName: "XPO Logistics",
    preference: "blocked",
    reason: "Customer requested block",
    createdByUserId: "user_staff"
  });
  assert.equal(preference.customerId, "cust_a");
  assert.equal(preference.preference, "blocked");
  const preferencesA = await store.listCarrierPreferences({ customerId: "cust_a" });
  const preferencesB = await store.listCarrierPreferences({ customerId: "cust_b" });
  assert.equal(preferencesA.length, 1);
  assert.equal(preferencesB.length, 0);
  await store.deleteCarrierPreference(preference.id);
  assert.equal((await store.listCarrierPreferences({ customerId: "cust_a" })).length, 0);

  console.log("address book tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function customer(id, companyName) {
  return {
    id,
    companyName,
    billingEmail: `${id}@example.com`,
    paymentTerms: "Net 15",
    allowedCarrierModes: ["demo"],
    allowedBooking: true,
    allowedBookingCarrierModes: ["demo"],
    status: "active",
    createdAt: new Date().toISOString()
  };
}

function organization(id, legacyCustomerId) {
  return {
    id,
    type: "customer",
    name: legacyCustomerId,
    status: "active",
    legacyCustomerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function address(id, customerId, customerOrganizationId, label) {
  return {
    id,
    customerId,
    customerOrganizationId,
    label,
    usageType: "both",
    companyName: label,
    street: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: "US",
    phone: "5125550100",
    openTime: "0900",
    closeTime: "1700",
    defaultAccessorials: ["appointment"],
    isDefaultPickup: false,
    isDefaultDelivery: false,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
