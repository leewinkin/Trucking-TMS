import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const invoiceFunctions = [
  extractFunction("renderInvoices"),
  extractFunction("invoiceGroupHtml"),
  extractFunction("resolveInvoiceTab")
].join("\n\n");

const allInvoices = [
  invoice("ms_1", "mothership", "open", true),
  invoice("ms_2", "mothership", "draft", true),
  invoice("local_1", "local", "open", true),
  invoice("local_2", "manual", "draft", true),
  invoice("local_3", "priority1", "paid", true),
  invoice("old_ms", "mothership", "open", false),
  invoice("old_local", "local", "open", false)
];

let rendered = renderStaffInvoices({
  invoices: allInvoices.filter((item) => item.inRange),
  invoiceTab: "mothership"
});
assert.match(rendered.html, /Imported from Mothership[\s\S]*?<span class="tab-count">2<\/span>/, "Mothership tab count should reflect filtered Mothership invoices");
assert.match(rendered.html, /Other invoices[\s\S]*?<span class="tab-count">3<\/span>/, "Other invoices tab count should reflect filtered non-Mothership invoices");
assert.equal(rendered.error, null, "staff invoice rendering should not throw a ReferenceError");

rendered = renderStaffInvoices({
  invoices: allInvoices,
  invoiceTab: "mothership",
  activeRange: "current"
});
assert.match(rendered.html, /Imported from Mothership[\s\S]*?<span class="tab-count">2<\/span>/, "Mothership tab count should use date-filtered invoices");
assert.match(rendered.html, /Other invoices[\s\S]*?<span class="tab-count">3<\/span>/, "Other invoices tab count should use date-filtered invoices");

rendered = renderStaffInvoices({
  invoices: allInvoices,
  invoiceTab: "local",
  activeRange: "current"
});
assert.match(rendered.html, /invoice-tab active" type="button" data-invoice-tab="local"/, "switching to the Other invoices tab should remain supported");
assert.match(rendered.html, /Other invoices[\s\S]*?<span class="pill">3<\/span>/, "Other invoices panel should render the filtered non-Mothership rows");

rendered = renderStaffInvoices({
  invoices: allInvoices,
  invoiceTab: "mothership",
  activeFilter: "open",
  activeRange: "current"
});
assert.match(rendered.html, /Imported from Mothership[\s\S]*?<span class="tab-count">1<\/span>/, "Mothership tab count should use status-filtered invoices");
assert.match(rendered.html, /Other invoices[\s\S]*?<span class="tab-count">1<\/span>/, "Other invoices tab count should use status-filtered invoices");

rendered = renderCustomerInvoices({
  invoices: [invoice("customer_open", "local", "open", true)]
});
assert.equal(rendered.error, null, "customer invoice rendering should remain unchanged");
assert.doesNotMatch(rendered.html, /invoice-tabs-shell|data-invoice-tab/, "customer invoice rendering should not show staff invoice tabs");

assert.doesNotMatch(app, /\$\{otherInvoices\.length\}/, "renderInvoices should not reference an undefined otherInvoices tab count");
assert.match(app, /resolveInvoiceTab\(mothershipInvoices, visibleOtherInvoices\)/, "resolveInvoiceTab should use the same filtered other-invoice collection");
assert.match(app, /const visibleInvoices = activeTab === "mothership" \? mothershipInvoices : visibleOtherInvoices;/, "visibleInvoices should use the same filtered other-invoice collection");
assert.match(app, /const hiddenInvoices = activeTab === "mothership" \? visibleOtherInvoices : mothershipInvoices;/, "hiddenInvoices should use the same filtered other-invoice collection");
assert.match(app, /Other invoices[\s\S]*\$\{visibleOtherInvoices\.length\}/, "Other invoices tab count should use the same filtered other-invoice collection");

console.log("invoice tab tests passed");

function renderStaffInvoices({ invoices, invoiceTab = "mothership", activeFilter = "all", activeRange = "all" }) {
  return renderInvoicesWithContext({
    isCustomer: false,
    state: {
      invoices,
      invoiceTab,
      staffFilters: { invoices: activeFilter },
      staffFilterRanges: { invoices: activeRange },
      customerFilters: { invoices: "all" }
    }
  });
}

function renderCustomerInvoices({ invoices }) {
  return renderInvoicesWithContext({
    isCustomer: true,
    state: {
      invoices,
      invoiceTab: "mothership",
      staffFilters: { invoices: "all" },
      staffFilterRanges: { invoices: "all" },
      customerFilters: { invoices: "all" }
    }
  });
}

function renderInvoicesWithContext({ isCustomer, state }) {
  const list = { innerHTML: "" };
  const context = {
    state,
    document: { getElementById: (id) => (id === "invoiceList" ? list : null) },
    isCustomerUser: () => isCustomer,
    customerInvoiceMatchesFilter: (invoice, filter) => filter === "all" || invoice.status === filter,
    adminInvoiceMatchesFilter: (invoice, filter) => filter === "all" || invoice.status === filter,
    adminRecordMatchesDateRange: (invoice, range) => range === "all" || invoice.inRange,
    customerFilterBarHtml: () => "<div data-customer-filter></div>",
    staffFilterBarHtml: () => "<div data-staff-filter></div>",
    invoiceRow: (invoice) => `<article data-invoice-id="${invoice.id}">${invoice.id}</article>`,
    t: (value) => value,
    escapeHtml: (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  };
  try {
    const api = vm.runInNewContext(`${invoiceFunctions}\n({ renderInvoices });`, context);
    api.renderInvoices();
    return { html: list.innerHTML, error: null };
  } catch (error) {
    return { html: list.innerHTML, error };
  }
}

function invoice(id, source, status, inRange) {
  return { id, source, status, inRange };
}

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in public/app.js`);
  const bodyStart = app.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return app.slice(start, index + 1);
      }
    }
  }
  throw new Error(`${name} function body was not closed`);
}
