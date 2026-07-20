import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canEnableBookingMode,
  carrierModeMatrixRows,
  customerActivityCounts,
  customerConfigurationFlags,
  customerExplicitBookingModes,
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
for (const query of ["Y", "YI", "YIH", "YIHE"]) {
  assert.equal(customerMatchesSearch(customers[0], query), true, `continuous multi-character search should match ${query}`);
}

assert.equal(customerMatchesStatusFilter(customers[0], "active"), true);
assert.equal(customerMatchesStatusFilter(customers[1], "disabled"), true);
assert.equal(customerMatchesConfigurationFilter(customers[1], tariffs, "missingTariff"), false, "disabled customers should not be counted as incomplete");
assert.equal(customerMatchesConfigurationFilter(customers[2], tariffs, "onlineBookingDisabled"), true);
assert.equal(customerMatchesConfigurationFilter(customers[2], tariffs, "portalNotConfigured"), false);
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
assert.equal(flags.portalNotConfigured, false);
assert.equal(flags.configurationComplete, true, "quote-only customer without portal should be configuration complete");

assert.equal(customerConfigurationFlags({ ...customers[2], portalAccessExpected: true }, tariffs).portalNotConfigured, true, "portal filter should require a reliable portalAccessExpected signal");
assert.equal(customerConfigurationFlags(customer("cust_missing_tariff", "Missing Tariff", "active", { allowedCarrierModes: ["speedshipLtl"] }), tariffs).configurationComplete, false, "missing tariff should be incomplete");
assert.equal(customerConfigurationFlags(customer("cust_no_modes", "No Modes", "active"), [{ customerId: "cust_no_modes", ruleType: "fixed", fixedAmount: 25 }]).configurationComplete, false, "no quote modes should be incomplete");
assert.equal(customerConfigurationFlags(customer("cust_bad_booking", "Bad Booking", "active", { allowedCarrierModes: ["speedshipLtl"], allowedBookingCarrierModes: ["priority1Ltl"] }), [{ customerId: "cust_bad_booking", ruleType: "fixed", fixedAmount: 25 }]).configurationComplete, false, "mismatched booking mode should be incomplete");

const viewModel = customerManagementViewModel({ customers, tariffs, quotes, shipments, now });
assert.equal(viewModel.metrics.totalCustomers, 3);
assert.equal(viewModel.metrics.configurationIncomplete, 0);
assert.equal(viewModel.metrics.onlineBookingEnabled, 1);
assert.deepEqual(customerManagementViewModel({ customers, tariffs, quotes, shipments, sort: "company", now }).rows.map((row) => row.customer.id), ["cust_b", "cust_c", "cust_a"]);
assert.equal(sortCustomerManagementRows(viewModel.rows, "recent")[0].customer.id, "cust_a", "recent sort should use reliable updatedAt then createdAt");

const activity = customerActivityCounts(customers[0], quotes, shipments, now);
assert.deepEqual(activity, { quotesLast30: 2, shipmentsLast30: 2 }, "activity counts should use customerId or quoteId links without guessing names");

assert.equal(canEnableBookingMode("speedshipLtl", ["speedshipLtl"]), true);
assert.equal(canEnableBookingMode("priority1Ltl", ["speedshipLtl"]), false);
assert.deepEqual(customerExplicitBookingModes(customers[0]), ["speedshipLtl"], "explicit booking modes should be displayed when valid");
assert.deepEqual(customerExplicitBookingModes({ ...customers[0], allowedBookingCarrierModes: undefined }), [], "legacy missing booking modes should not fall back to all quote modes");
assert.equal(customerManagementViewModel({ customers: [{ ...customers[0], allowedBookingCarrierModes: undefined }], tariffs, now }).metrics.onlineBookingEnabled, 0, "card and metric booking states should agree on explicit modes");
const cleared = updateCarrierModeSelection({ allowedCarrierModes: ["speedshipLtl"], allowedBookingCarrierModes: ["speedshipLtl"] }, "speedshipLtl", false);
assert.deepEqual(cleared, { allowedCarrierModes: [], allowedBookingCarrierModes: [] }, "disabling quote access should clear booking access");
assert.equal(carrierModeMatrixRows({}, { showDemo: true }).find((row) => row.key === "demo").quotingEnabled, false, "Demo Rates should not be selected for new customers");
assert.equal(carrierModeMatrixRows(customers[0], { showDemo: false }).some((row) => row.key === "demo"), true, "existing Demo Rates assignment should be preserved and visible");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
assert.match(app, /customerManagementViewModel/, "Customer Management rendering should use the pure view model");
assert.match(app, /function renderCustomerManagementControls/, "Customer Management controls should be rendered independently");
assert.match(app, /function renderCustomerManagementList/, "Customer Management list should be rendered independently");
assert.match(app, /data-customer-management-query[\s\S]*renderCustomerManagementList\(\);/, "typing YIHE should update the list without replacing the search input controls");
assert.match(app, /if \(options\.forceControls \|\| !filters\.hasChildNodes\(\)\)/, "search controls should remain mounted during continuous typing unless intentionally rebuilt");
assert.doesNotMatch(app.match(/const customerSearch[\s\S]*?return;\n    \}/)?.[0] || "", /renderCustomers\(/, "search input handler must not rerender the full customer workspace");
assert.match(app, /data-customer-management-add/, "Add Customer drawer action should exist");
assert.match(app, /state\.customerManagement\.selectedCustomerId = createdId;/, "creating Customer A should select Customer A after refresh");
assert.match(app, /customerId: customer\.id/, "tariff and blocked-carrier saves should use the selected customer ID");
assert.match(app, /portalPassword: form\.get\("portalPassword"\)/, "Customer PATCH payload should preserve portalPassword field shape when provided");
assert.match(app, /allowedCarrierModes,\n\s+allowedBooking:\s+allowedBookingCarrierModes\.length > 0,\n\s+allowedBookingCarrierModes/, "Tariff POST payload should preserve carrier mode fields");
assert.match(app, /draft:\s*\{\n\s+basic:\s*\{\}/, "customer management should keep explicit drawer draft state");
assert.match(app, /captureCustomerManagementDraft\(\);\n\s+renderCustomerManagementDrawer\(\);/, "pricing rule type switches should capture draft before re-rendering");
assert.match(app, /fixedAmount: form\.get\("ruleType"\) === "fixed" \? form\.get\("fixedAmount"\) : "0"/, "inactive fixed pricing field should submit as zero");
assert.match(app, /markupPercentage: form\.get\("ruleType"\) === "percentage" \? form\.get\("markupPercentage"\) : "0"/, "inactive percentage pricing field should submit as zero");
assert.match(app, /cryptoApi\.getRandomValues\(values\)/, "temporary password generation should use crypto.getRandomValues");
assert.doesNotMatch(app, /Math\.random/, "temporary password generation must not use Math.random");
assert.match(app, /Copy failed\. Select and copy the temporary password manually\./, "clipboard failure should show a generic copy-failure message");
assert.doesNotMatch(app, /catch \{\n\s+showToast\(password\)/, "clipboard failure must not render the password in a toast");
assert.match(app, /state\.customerManagement\.draft\.portal\.portalPassword = password;[\s\S]*input\.value = password;/, "password generation should update draft and existing input without full drawer re-render");
assert.match(app, /isView \? "" : `<div class="modal-actions[\s\S]*Save basic information/, "View Details should not render basic submit controls");
assert.match(app, /isView \? "" : `<div class="modal-actions[\s\S]*Save pricing/, "View Details should not render pricing submit controls");
assert.match(app, /isView \? "" : `\n    <form id="customerBlockedCarrierForm"/, "View Details should not render blocked-carrier add form");
assert.match(app, /isView \? "" : `<div class="modal-actions span-2">[\s\S]*Generate temporary password/, "View Details should not render generated password controls");
assert.match(app, /data-customer-management-edit/, "View Details should provide an Edit action");
assert.match(app, /state\.customerManagement\.saving = "blocked";\n\s+renderCustomerManagementDrawer\(\);/, "blocked-carrier save should disable the button before the API request");
assert.match(app, /state\.customerManagement\.draft\.blocked = \{ carrierKey: "", carrierName: "", reason: "" \};/, "blocked-carrier form should clear only after success");
assert.match(app, /Opening time must be earlier than closing time\./, "company-hours validation should use company-specific wording");
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
