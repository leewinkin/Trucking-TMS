import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tms-api-security-"));
const dataFile = path.join(tempDir, "db.json");
const port = 4100 + Math.floor(Math.random() * 1000);
let serverProcess = null;

try {
  await writeFile(dataFile, `${JSON.stringify(seedDb(), null, 2)}\n`, "utf8");
  serverProcess = await startServer(port, dataFile);

  const customer = createClient(port);
  await customer.login("customer@local.test", "Customer123!");
  const admin = createClient(port);
  await admin.login("admin@local.test", "Admin123!");

  const ownAddresses = await customer.request("/api/address-book");
  assert.equal(ownAddresses.status, 200);
  assert.deepEqual(ownAddresses.body.entries.map((entry) => entry.id), ["addr_a"]);

  const spoofedList = await customer.request("/api/address-book?customerId=cust_b");
  assert.equal(spoofedList.status, 200);
  assert.deepEqual(spoofedList.body.entries.map((entry) => entry.id), ["addr_a"]);

  const patchOther = await customer.request("/api/address-book/addr_b", {
    method: "PATCH",
    body: addressPayload({ companyName: "Spoof Update" })
  });
  assert.equal(patchOther.status, 404);

  const deleteOther = await customer.request("/api/address-book/addr_b", { method: "DELETE" });
  assert.equal(deleteOther.status, 404);

  const spoofedCreate = await customer.request("/api/address-book", {
    method: "POST",
    body: {
      ...addressPayload({ label: "Spoofed Org", companyName: "Customer A Spoofed Org" }),
      customerId: "cust_a",
      customerOrganizationId: "org_b"
    }
  });
  assert.equal(spoofedCreate.status, 201);
  assert.equal(spoofedCreate.body.entry.customerId, "cust_a");
  assert.equal(spoofedCreate.body.entry.customerOrganizationId, "org_a");

  const staffCreate = await admin.request("/api/address-book", {
    method: "POST",
    body: {
      ...addressPayload({ label: "B Staff Address", companyName: "Customer B Staff Address" }),
      customerId: "cust_b",
      customerOrganizationId: "org_a"
    }
  });
  assert.equal(staffCreate.status, 201);
  assert.equal(staffCreate.body.entry.customerId, "cust_b");
  assert.equal(staffCreate.body.entry.customerOrganizationId, "org_b");

  const defaultPickup1 = await admin.request("/api/address-book", {
    method: "POST",
    body: {
      ...addressPayload({ label: "A Default Pickup 1", companyName: "Customer A Pickup 1" }),
      customerId: "cust_a",
      usageType: "pickup",
      isDefaultPickup: true,
      isDefaultDelivery: true
    }
  });
  assert.equal(defaultPickup1.status, 201);
  assert.equal(defaultPickup1.body.entry.isDefaultPickup, true);
  assert.equal(defaultPickup1.body.entry.isDefaultDelivery, false);

  const defaultPickup2 = await admin.request("/api/address-book", {
    method: "POST",
    body: {
      ...addressPayload({ label: "A Default Pickup 2", companyName: "Customer A Pickup 2" }),
      customerId: "cust_a",
      usageType: "both",
      isDefaultPickup: true,
      isDefaultDelivery: true
    }
  });
  assert.equal(defaultPickup2.status, 201);
  const staffAddresses = await admin.request("/api/address-book?customerId=cust_a");
  assert.equal(staffAddresses.status, 200);
  assert.deepEqual(
    staffAddresses.body.entries.filter((entry) => entry.isDefaultPickup).map((entry) => entry.id),
    [defaultPickup2.body.entry.id]
  );
  assert.deepEqual(
    staffAddresses.body.entries.filter((entry) => entry.isDefaultDelivery).map((entry) => entry.id),
    [defaultPickup2.body.entry.id]
  );

  const customerQuotes = await customer.request("/api/quotes");
  assert.equal(customerQuotes.status, 200);
  assert.equal(customerQuotes.body.quotes.length, 2);
  assert.equal(Object.hasOwn(customerQuotes.body.quotes[0], "carrierExclusionAudit"), false);
  assert.equal(Object.hasOwn(customerQuotes.body.quotes[0], "carrierAudit"), false);

  const customerInvoices = await customer.request("/api/invoices");
  assert.equal(customerInvoices.status, 403, "customer users must not access invoice APIs");
  const adminInvoices = await admin.request("/api/invoices");
  assert.equal(adminInvoices.status, 200, "admin users should retain invoice management access");

  const customerShipments = await customer.request("/api/shipments");
  assert.equal(customerShipments.status, 200);
  assert.equal(customerShipments.body.shipments.length, 1);
  assert.equal(Object.hasOwn(customerShipments.body.shipments[0], "carrierCost"), false);
  assert.equal(Object.hasOwn(customerShipments.body.shipments[0], "margin"), false);
  assert.equal(Object.hasOwn(customerShipments.body.shipments[0], "provider"), false);
  assert.equal(Object.hasOwn(customerShipments.body.shipments[0], "carrierShipment"), false);
  assert.equal(Object.hasOwn(customerShipments.body.shipments[0], "rawCarrierResponse"), false);

  const ownShipment = await customer.request("/api/shipments/ship_a");
  assert.equal(ownShipment.status, 200);
  assert.equal(Object.hasOwn(ownShipment.body.shipment, "carrierCost"), false);
  assert.equal(Object.hasOwn(ownShipment.body.shipment, "carrierShipmentId"), false);
  const otherShipment = await customer.request("/api/shipments/ship_b");
  assert.equal(otherShipment.status, 403);

  const customerDocuments = await customer.request("/api/shipments/ship_a/documents");
  assert.equal(customerDocuments.status, 200);
  assert.deepEqual(customerDocuments.body.documents.map((document) => document.documentType), ["bol", "pod"]);
  assert.equal(customerDocuments.body.documents.some((document) => Object.hasOwn(document, "providerReference")), false);
  assert.equal(customerDocuments.body.documents.some((document) => Object.hasOwn(document, "rawMetadata")), false);
  assert.equal(customerDocuments.body.documents.some((document) => document.documentType === "invoice"), false);
  const otherCustomerDocuments = await customer.request("/api/shipments/ship_b/documents");
  assert.equal(otherCustomerDocuments.status, 403);
  const customerCarrierDocumentList = await customer.request("/api/carrier-documents");
  assert.equal(customerCarrierDocumentList.status, 403);

  const adminDocuments = await admin.request("/api/carrier-documents");
  assert.equal(adminDocuments.status, 200);
  assert.equal(adminDocuments.body.documents.length, 4);
  assert.equal(Object.hasOwn(adminDocuments.body.documents[0], "providerReference"), true);
  assert.equal(Object.hasOwn(adminDocuments.body.documents[0], "rawMetadata"), true);

  const booked = await customer.request("/api/shipments", {
    method: "POST",
    body: { quoteId: "quote_bookable", rateId: "rate_bookable", bookWithCarrier: false }
  });
  assert.equal(booked.status, 201);
  assert.equal(Object.hasOwn(booked.body, "invoice"), false);
  assert.equal(Object.hasOwn(booked.body.shipment, "carrierCost"), false);
  assert.equal(Object.hasOwn(booked.body.shipment, "carrierShipment"), false);

  const blockedBooking = await customer.request("/api/shipments", {
    method: "POST",
    body: { quoteId: "quote_blocked", rateId: "rate_blocked", bookWithCarrier: false }
  });
  assert.equal(blockedBooking.status, 403);
  assert.equal(blockedBooking.body.error, "CARRIER_BLOCKED");

  const mismatchedPreferenceDelete = await admin.request("/api/carrier-preferences/pref_b?customerId=cust_a", {
    method: "DELETE"
  });
  assert.equal(mismatchedPreferenceDelete.status, 403);

  const customerPreferenceList = await customer.request("/api/carrier-preferences?customerId=cust_a");
  assert.equal(customerPreferenceList.status, 403);
  const customerPreferenceCreate = await customer.request("/api/carrier-preferences", {
    method: "POST",
    body: { customerId: "cust_a", carrierKey: "SAIA", carrierName: "SAIA", preference: "blocked" }
  });
  assert.equal(customerPreferenceCreate.status, 403);
  const customerPreferenceDelete = await customer.request("/api/carrier-preferences/pref_a?customerId=cust_a", {
    method: "DELETE"
  });
  assert.equal(customerPreferenceDelete.status, 403);

  const storeSource = await readFile(new URL("../store.js", import.meta.url), "utf8");
  assert.match(storeSource, /carrier_exclusion_audit jsonb/, "PostgreSQL schema should persist exclusion audit");
  assert.match(storeSource, /carrierExclusionAudit/, "JSON store should persist exclusion audit");
  assert.match(storeSource, /pg_advisory_xact_lock/, "PostgreSQL writes should serialize default address changes");
  assert.match(storeSource, /clearJsonAddressDefaults/, "JSON store should enforce one default address per usage");

  console.log("api security tests passed");
} finally {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }
  await rm(tempDir, { recursive: true, force: true });
}

function createClient(portNumber) {
  let cookie = "";
  return {
    async login(email, password) {
      const response = await this.request("/api/login", {
        method: "POST",
        body: { email, password }
      });
      assert.equal(response.status, 200, `login failed for ${email}: ${JSON.stringify(response.body)}`);
      return response;
    },
    async request(pathname, options = {}) {
      const headers = {};
      if (options.body) {
        headers["Content-Type"] = "application/json";
      }
      if (cookie) {
        headers.Cookie = cookie;
      }
      const response = await fetch(`http://127.0.0.1:${portNumber}${pathname}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        cookie = setCookie.split(";")[0];
      }
      let body = {};
      try {
        body = await response.json();
      } catch {
        body = {};
      }
      return { status: response.status, body };
    }
  };
}

async function startServer(portNumber, dbPath) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(portNumber),
      FORCE_LOCAL_JSON_STORE: "1",
      DATA_FILE_PATH: dbPath,
      APP_SECRET: "api-security-test-secret"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for test server")), 10000);
    child.once("exit", (code) => reject(new Error(`Test server exited early with ${code}`)));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Trucking TMS prototype running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return child;
}

function seedDb() {
  const now = new Date().toISOString();
  return {
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
    carrierPreferences: [
      preference("pref_a", "cust_a", "org_a", "XPOL", "XPO Logistics"),
      preference("pref_b", "cust_b", "org_b", "SAIA", "SAIA")
    ],
    quotes: [
      {
        id: "quote_blocked",
        customerId: "cust_a",
        customerName: "Customer A",
        carrierMode: "demo",
        carrierModes: ["demo"],
        carrier: "demo",
        carrierQuoteId: "quote_blocked",
        referenceNumber: "REF-BLOCKED",
        pickup: {},
        delivery: {},
        freight: [],
        pickupReadyDate: {},
        tariffRule: {},
        rates: [
          {
            id: "rate_blocked",
            carrierSource: "demo",
            providerScac: "XPOL",
            carrierName: "XPO Logistics",
            service: "Standard",
            carrierCost: 100,
            sellPrice: 125,
            margin: 25
          }
        ],
        status: "quoted",
        carrierMessage: "",
        carrierAudit: [{ provider: "demo", status: "ok" }],
        rawCarrierResponse: {},
        rateAvailability: { status: "partial", messageCode: "PARTIAL_RATES_UNAVAILABLE" },
        carrierExclusionAudit: [{ carrierName: "XPO Logistics", reason: "Blocked" }],
        customerOrganizationId: "org_a",
        createdAt: now
      },
      {
        id: "quote_bookable",
        customerId: "cust_a",
        customerName: "Customer A",
        carrierMode: "demo",
        carrierModes: ["demo"],
        carrier: "demo",
        carrierQuoteId: "quote_bookable",
        referenceNumber: "REF-BOOK",
        pickup: lane("Austin", "TX"),
        delivery: lane("Dallas", "TX"),
        freight: [],
        pickupReadyDate: { date: "2026-07-30", time: "1000" },
        tariffRule: {},
        rates: [
          {
            id: "rate_bookable",
            carrierSource: "demo",
            providerScac: "SAIA",
            carrierName: "SAIA",
            service: "Standard",
            carrierCost: 100,
            sellPrice: 125,
            margin: 25
          }
        ],
        status: "quoted",
        carrierMessage: "",
        carrierAudit: [{ provider: "demo", status: "ok" }],
        rawCarrierResponse: {},
        rateAvailability: { status: "complete", messageCode: null },
        carrierExclusionAudit: [],
        customerOrganizationId: "org_a",
        createdAt: now
      }
    ],
    shipments: [
      shipment("ship_a", "cust_a", "org_a", "Customer A"),
      shipment("ship_b", "cust_b", "org_b", "Customer B")
    ],
    invoices: [
      {
        id: "inv_a",
        shipmentId: "ship_a",
        customerId: "cust_a",
        customerName: "Customer A",
        invoiceNumber: "INV-A",
        amount: 125,
        status: "draft",
        createdAt: now
      }
    ],
    carrierDocuments: [
      carrierDocument("doc_bol_a", "ship_a", "cust_a", "mothership", "bol", true),
      carrierDocument("doc_pod_a", "ship_a", "cust_a", "mothership", "pod", true),
      carrierDocument("doc_invoice_a", "ship_a", "cust_a", "mothership", "invoice", false),
      carrierDocument("doc_bol_b", "ship_b", "cust_b", "mothership", "bol", true)
    ],
    trackingEvents: []
  };
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
    defaultAccessorials: [],
    isDefaultPickup: false,
    isDefaultDelivery: false,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function preference(id, customerId, customerOrganizationId, carrierKey, carrierName) {
  return {
    id,
    customerId,
    customerOrganizationId,
    carrierKey,
    carrierName,
    preference: "blocked",
    reason: "Customer blocked",
    status: "active",
    createdByUserId: "user_admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function shipment(id, customerId, customerOrganizationId, customerName) {
  return {
    id,
    customerId,
    customerOrganizationId,
    customerName,
    quoteId: "",
    carrier: "mothership",
    carrierShipmentId: `carrier-${id}`,
    carrierEntityId: `entity-${id}`,
    confirmationNumber: `CN-${id}`,
    referenceNumber: `REF-${id}`,
    pickup: lane("Austin", "TX"),
    delivery: lane("Dallas", "TX"),
    freight: [],
    carrierCost: 100,
    sellPrice: 125,
    margin: 25,
    provider: "mothership",
    carrierName: "TForce Freight",
    service: "Standard",
    status: "booked_with_carrier",
    pickupDate: { date: "2026-07-30", time: "1000" },
    carrierShipment: { request: { secret: "hidden" }, response: { raw: true } },
    rawCarrierResponse: { secret: "hidden" },
    createdAt: new Date().toISOString()
  };
}

function lane(city, state) {
  return {
    name: "Dock",
    address: {
      street: "100 Test St",
      city,
      state,
      zip: "78701",
      country: "US"
    }
  };
}

function carrierDocument(id, shipmentId, customerId, provider, type, customerVisible) {
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
    providerReference: { url: "https://carrier.example.test/document.pdf", providerDocumentId: id },
    rawMetadata: { raw: true, upstreamMessage: "internal only" },
    fetchedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function addressPayload(overrides = {}) {
  return {
    label: "Saved Address",
    usageType: "both",
    companyName: "Saved Company",
    street: "100 Test St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: "US",
    phone: "5125550100",
    email: "test@example.com",
    openTime: "0900",
    closeTime: "1700",
    defaultAccessorials: [],
    isDefaultPickup: false,
    isDefaultDelivery: false,
    ...overrides
  };
}
