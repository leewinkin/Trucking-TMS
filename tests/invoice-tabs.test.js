import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const invoiceFunctions = [
  extractFunction("renderInvoices"),
  extractFunction("invoiceGroupHtml"),
  extractFunction("invoiceGroups"),
  extractFunction("invoiceGroupKey"),
  extractFunction("resolveInvoiceTab"),
  extractFunction("invoiceDocumentAvailability"),
  extractFunction("carrierInvoiceDocumentMatches"),
  extractFunction("normalizeProviderKey"),
  extractFunction("nonEmptyEqual")
].join("\n\n");

const allInvoices = [
  invoice("ms_1", "mothership", "open", true, "ship_ms"),
  invoice("ms_2", "mothership", "draft", true, "ship_ms_2"),
  invoice("p1_1", "priority1", "paid", true, "ship_p1"),
  invoice("ss_1", "speedship", "open", true, "ship_ss"),
  invoice("local_1", "local", "open", true, "ship_local"),
  invoice("unmatched_p1", "priority1", "open", true, null),
  invoice("old_ms", "mothership", "open", false),
  invoice("old_local", "local", "open", false)
];

let rendered = renderStaffInvoices({
  invoices: allInvoices.filter((item) => item.inRange),
  invoiceTab: "mothership"
});
assert.match(rendered.html, /Mothership[\s\S]*?<span class="tab-count">2<\/span>/, "Mothership tab count should reflect filtered Mothership invoices");
assert.match(rendered.html, /Priority1[\s\S]*?<span class="tab-count">1<\/span>/, "Priority1 tab count should not be grouped as Local");
assert.match(rendered.html, /SpeedShip[\s\S]*?<span class="tab-count">1<\/span>/, "SpeedShip tab count should be visible");
assert.match(rendered.html, /Local[\s\S]*?<span class="tab-count">1<\/span>/, "Local tab count should include local invoices only");
assert.match(rendered.html, /Unmatched[\s\S]*?<span class="tab-count">1<\/span>/, "Unmatched tab count should include external invoices without shipmentId");
assert.equal(rendered.error, null, "staff invoice rendering should not throw a ReferenceError");

rendered = renderStaffInvoices({
  invoices: allInvoices,
  invoiceTab: "mothership",
  activeRange: "current"
});
assert.match(rendered.html, /Mothership[\s\S]*?<span class="tab-count">2<\/span>/, "Mothership tab count should use date-filtered invoices");
assert.match(rendered.html, /Priority1[\s\S]*?<span class="tab-count">1<\/span>/, "Priority1 tab count should use date-filtered invoices");

rendered = renderStaffInvoices({
  invoices: allInvoices,
  invoiceTab: "local",
  activeRange: "current"
});
assert.match(rendered.html, /invoice-tab active" type="button" data-invoice-tab="local"/, "switching to the Other invoices tab should remain supported");
assert.match(rendered.html, /Local[\s\S]*?<span class="pill">1<\/span>/, "Local panel should render only local invoices");

rendered = renderStaffInvoices({
  invoices: allInvoices,
  invoiceTab: "mothership",
  activeFilter: "open",
  activeRange: "current"
});
assert.match(rendered.html, /Mothership[\s\S]*?<span class="tab-count">1<\/span>/, "Mothership tab count should use status-filtered invoices");
assert.match(rendered.html, /Priority1[\s\S]*?<span class="tab-count">0<\/span>/, "Priority1 tab count should use status-filtered invoices");

rendered = renderCustomerInvoices({
  invoices: [invoice("customer_open", "local", "open", true)]
});
assert.equal(rendered.error, null, "customer invoice rendering should not throw");
assert.equal(rendered.html, "", "customer invoice rendering should not expose invoice UI");
assert.doesNotMatch(rendered.html, /invoice-tabs-shell|data-invoice-tab/, "customer invoice rendering should not show staff invoice tabs");

assert.doesNotMatch(app, /\$\{otherInvoices\.length\}/, "renderInvoices should not reference an undefined otherInvoices tab count");
assert.match(app, /body: \{ providers: \["mothership", "priority1", "speedship"\] \}/, "Sync All Invoices should explicitly request all carrier providers");
const renderInvoicesSource = app.slice(app.indexOf("function renderInvoices"), app.indexOf("function invoiceGroupHtml"));
assert.doesNotMatch(renderInvoicesSource, /Imported from Mothership|Other invoices|visibleOtherInvoices/, "legacy two-tab invoice labels should not remain in render logic");

const matchApi = invoiceMatchApi([
  carrierDocument("doc_ms", "mothership", "INV-1", "ms_ext", "ship_ms"),
  carrierDocument("doc_p1", "priority1", "INV-1", "p1_ext", "ship_p1"),
  carrierDocument("doc_missing", "mothership", "", "", "")
]);
assert.equal(matchApi.availability(invoice("invoice_ms", "mothership", "open", true, "ship_ms", "INV-1", "ms_ext")).url, "/ms.pdf", "Mothership invoice should match same-provider document");
assert.equal(matchApi.availability(invoice("invoice_p1", "priority1", "open", true, "ship_p1", "INV-1", "p1_ext")).url, "/p1.pdf", "Priority1 invoice should match same-provider document with same invoice number");
assert.equal(matchApi.availability(invoice("invoice_p1_cross", "priority1", "open", true, "ship_x", "INV-1", "missing")).url, "/p1.pdf", "same-provider invoice number match should win over cross-provider same number");
assert.equal(matchApi.availability(invoice("invoice_missing", "mothership", "open", true, "", "", "")).url, "", "missing invoice IDs should not match each other");
assert.equal(matchApi.availability(invoice("invoice_ship_fallback", "priority1", "open", true, "ship_p1", "", "")).url, "/p1.pdf", "linked shipment fallback should work within the same provider");

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
    canManageCarrierInvoices: () => !isCustomer,
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

function invoice(id, source, status, inRange, shipmentId = "", invoiceNumber = id, externalInvoiceId = "") {
  return { id, source, status, inRange, shipmentId, invoiceNumber, externalInvoiceId };
}

function carrierDocument(id, provider, invoiceNumber, invoiceId, shipmentId) {
  return {
    id,
    provider,
    shipmentId,
    documentType: "invoice",
    status: "available",
    url: provider === "mothership" ? "/ms.pdf" : "/p1.pdf",
    providerReference: { invoiceNumber, invoiceId }
  };
}

function invoiceMatchApi(carrierDocuments) {
  const context = { state: { carrierDocuments } };
  return vm.runInNewContext(`${invoiceFunctions}\n({ availability: invoiceDocumentAvailability, matches: carrierInvoiceDocumentMatches });`, context);
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
