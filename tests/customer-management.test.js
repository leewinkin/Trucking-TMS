import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canEnableBookingMode,
  carrierModeMatrixRows,
  customerActivityCounts,
  customerConfigurationFlags,
  customerManagementViewModel,
  customerMatchesConfigurationFilter,
  customerMatchesSearch,
  customerMatchesStatusFilter,
  customerPricingSummary,
  customerStatusLabelKey,
  normalizeCustomerAccountStatus,
  sortCustomerManagementRows,
  updateCarrierModeSelection
} from "../public/customer-management.js";

const now = new Date("2026-07-20T12:00:00Z");
const customers = [
  customer("cust_a", "YIHE", "active", {
    billingEmail: "billing@yihe.test",
    portalEmail: "yihe-portal",
    companyPhone: "(555) 100-1000",
    companyStreet: "123 Main St",
    companyCity: "Ontario",
    companyState: "CA",
    companyZip: "91761",
    allowedCarrierModes: ["speedshipLtl", "demo"],
    allowedBookingCarrierModes: ["speedshipLtl"],
    updatedAt: "2026-07-20T10:00:00Z"
  }),
  customer("cust_b", "Beta Foods", "disabled", {
    billingEmail: "ap@beta.test",
    portalEmail: "",
    companyCity: "Dallas",
    companyZip: "75201",
    allowedCarrierModes: [],
    allowedBookingCarrierModes: [],
    updatedAt: "2026-07-18T10:00:00Z"
  }),
  customer("cust_c", "Cargo Panda", "active", {
    billingEmail: "ops@panda.test",
    portalEmail: "",
    companyPhone: "555-333-3333",
    companyCity: "Seattle",
    companyZip: "98101",
    allowedCarrierModes: ["priority1Ltl"],
    allowedBookingCarrierModes: [],
    createdAt: "2026-07-19T10:00:00Z"
  })
];
const tariffs = [
  { customerId: "cust_a", ruleType: "percentage", markupPercentage: 10, fixedAmount: 50 },
  { customerId: "cust_c", ruleType: "fixed", fixedAmount: 75, markupPercentage: 20 }
];
const quotes = [
  { id: "q1", customerId: "cust_a", createdAt: "2026-07-19T10:00:00Z" },
  { id: "q2", customerId: "cust_a", createdAt: "2026-07-18T10:00:00Z" },
  { id: "q_old", customerId: "cust_a", createdAt: "2026-05-01T10:00:00Z" },
  { id: "q3", customerId: "cust_c", createdAt: "2026-07-18T10:00:00Z" }
];
const shipments = [
  { id: "s1", customerId: "cust_a", createdAt: "2026-07-19T10:00:00Z" },
  { id: "s2", quoteId: "q2", createdAt: "2026-07-18T10:00:00Z" },
  { id: "s_wrong", quoteId: "q3", createdAt: "2026-07-18T10:00:00Z" },
  { id: "s_guess", customerName: "YIHE", createdAt: "2026-07-18T10:00:00Z" }
];

assert.equal(normalizeCustomerAccountStatus("disabled"), "disabled");
assert.equal(normalizeCustomerAccountStatus("active"), "active");
assert.equal(customerStatusLabelKey(customers[0]), "account.status.active");
assert.equal(customerStatusLabelKey(customers[1]), "account.status.disabled");

assert.equal(customerMatchesSearch(customers[0], " yihe "), true, "search should trim and match company");
assert.equal(customerMatchesSearch(customers[0], "BILLING@YIHE"), true, "search should match email case-insensitively");
assert.equal(customerMatchesSearch(customers[0], "yihe-portal"), true, "search should match portal username");
assert.equal(customerMatchesSearch(customers[0], "555"), true, "search should match phone");
assert.equal(customerMatchesSearch(customers[0], "ontario"), true, "search should match city");
assert.equal(customerMatchesSearch(customers[0], "91761"), true, "search should match ZIP");
assert.equal(customerMatchesSearch(customers[0], "不存在"), false, "search should be safe for Chinese text");

assert.equal(customerMatchesStatusFilter(customers[0], "active"), true);
assert.equal(customerMatchesStatusFilter(customers[1], "disabled"), true);
assert.equal(customerMatchesConfigurationFilter(customers[1], tariffs, "missingTariff"), false, "disabled customers should not be counted as incomplete");
assert.equal(customerMatchesConfigurationFilter(customers[2], tariffs, "onlineBookingDisabled"), true);
assert.equal(customerMatchesConfigurationFilter(customers[2], tariffs, "portalNotConfigured"), true);
assert.equal(customerMatchesConfigurationFilter(customers[0], tariffs, "configurationComplete"), true);

assert.deepEqual(customerPricingSummary(customers[2], tariffs), {
  labelKey: "Fixed markup",
  value: 75,
  displayValue: "fixedAmount",
  ruleType: "fixed",
  hasRule: true
}, "fixed pricing summary should expose only the fixed amount");
assert.equal(customerPricingSummary(customers[0], tariffs).displayValue, "markupPercentage", "percentage pricing summary should expose only percentage");

const flags = customerConfigurationFlags(customers[2], tariffs);
assert.equal(flags.missingTariff, false);
assert.equal(flags.noCarrierModes, false);
assert.equal(flags.onlineBookingDisabled, true);
assert.equal(flags.portalNotConfigured, true);

const viewModel = customerManagementViewModel({ customers, tariffs, quotes, shipments, now });
assert.equal(viewModel.metrics.totalCustomers, 3);
assert.equal(viewModel.metrics.configurationIncomplete, 1);
assert.equal(viewModel.metrics.onlineBookingEnabled, 1);
assert.deepEqual(customerManagementViewModel({ customers, tariffs, quotes, shipments, sort: "company", now }).rows.map((row) => row.customer.id), ["cust_b", "cust_c", "cust_a"]);
assert.equal(sortCustomerManagementRows(viewModel.rows, "recent")[0].customer.id, "cust_a", "recent sort should use reliable updatedAt then createdAt");

const activity = customerActivityCounts(customers[0], quotes, shipments, now);
assert.deepEqual(activity, { quotesLast30: 2, shipmentsLast30: 2 }, "activity counts should use customerId or quoteId links without guessing names");

assert.equal(canEnableBookingMode("speedshipLtl", ["speedshipLtl"]), true);
assert.equal(canEnableBookingMode("priority1Ltl", ["speedshipLtl"]), false);
const cleared = updateCarrierModeSelection({ allowedCarrierModes: ["speedshipLtl"], allowedBookingCarrierModes: ["speedshipLtl"] }, "speedshipLtl", false);
assert.deepEqual(cleared, { allowedCarrierModes: [], allowedBookingCarrierModes: [] }, "disabling quote access should clear booking access");
assert.equal(carrierModeMatrixRows({}, { showDemo: true }).find((row) => row.key === "demo").quotingEnabled, false, "Demo Rates should not be selected for new customers");
assert.equal(carrierModeMatrixRows(customers[0], { showDemo: false }).some((row) => row.key === "demo"), true, "existing Demo Rates assignment should be preserved and visible");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
assert.match(app, /customerManagementViewModel/, "Customer Management rendering should use the pure view model");
assert.match(app, /data-customer-management-add/, "Add Customer drawer action should exist");
assert.match(app, /state\.customerManagement\.selectedCustomerId = createdId;/, "creating Customer A should select Customer A after refresh");
assert.match(app, /customerId: customer\.id/, "tariff and blocked-carrier saves should use the selected customer ID");
assert.match(app, /portalPassword: form\.get\("portalPassword"\)/, "Customer PATCH payload should preserve portalPassword field shape when provided");
assert.match(app, /allowedCarrierModes,\n\s+allowedBooking:\s+allowedBookingCarrierModes\.length > 0,\n\s+allowedBookingCarrierModes/, "Tariff POST payload should preserve carrier mode fields");
assert.doesNotMatch(app, /portalPassword[^<]*(customer-management-card|data-customer-card)/, "customer card should not render portal passwords");
assert.match(app, /window\.prompt\(t\("Type \{name\} to confirm deletion\."/ , "delete confirmation should require exact company-name prompt");
assert.match(app, /if \(!isStaffUser\(\)\) \{\n\s+list\.innerHTML = "";/, "customer users should not receive customer-management content");
assert.match(app, /t\("Edit"\)/, "Edit action should use translations");
assert.match(app, /t\(statusAction\)/, "Enable and Disable actions should use translations");
assert.match(app, /t\("Delete Customer"\)/, "Delete action should use translations");

console.log("customer management tests passed");

function customer(id, companyName, status, overrides = {}) {
  return {
    id,
    companyName,
    status,
    createdAt: "2026-07-01T10:00:00Z",
    ...overrides
  };
}
