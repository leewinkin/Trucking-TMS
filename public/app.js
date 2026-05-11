const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const state = {
  health: null,
  user: null,
  customers: [],
  tariffs: [],
  quotes: [],
  shipments: [],
  invoices: [],
  currentQuote: null,
  carrierModeTouched: false,
  modal: null
};

const viewMeta = {
  dashboard: () =>
    ["Dashboard", isStaffUser() ? "Watch quote activity, shipment status, and invoice drafts." : "Track your quotes, shipments, and invoices."],
  customers: ["Customers", "Manage customer accounts and tariff rules."],
  quote: ["New Quote", "Create a shipment quote and apply customer-specific markup."],
  shipments: ["Shipments", "Review local bookings and carrier shipment references."],
  invoices: ["Invoices", "See draft invoices created from booked shipments."]
};

document.addEventListener("DOMContentLoaded", async () => {
  wireNavigation();
  wireForms();
  wireAuth();
  wireModal();
  setDefaultPickupDate();
  await bootApp();
});

function wireNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll("[data-modal]").forEach((button) => {
    button.addEventListener("click", () => openDashboardModal(button.dataset.modal));
  });

  document.getElementById("refreshButton").addEventListener("click", refreshAll);
  document.getElementById("logoutButton").addEventListener("click", logout);

  document.addEventListener("click", (event) => {
    const trackButton = event.target.closest("[data-track-shipment]");
    if (trackButton) {
      openShipmentTracking(trackButton.dataset.trackShipment);
      return;
    }

    const quoteButton = event.target.closest("[data-view-quote]");
    if (quoteButton) {
      openQuoteDetails(quoteButton.dataset.viewQuote);
      return;
    }

    const invoiceButton = event.target.closest("[data-view-invoice]");
    if (invoiceButton) {
      openInvoiceDetails(invoiceButton.dataset.viewInvoice);
      return;
    }

    const shipmentButton = event.target.closest("[data-view-shipment]");
    if (shipmentButton) {
      openShipmentDetails(shipmentButton.dataset.viewShipment);
      return;
    }

    const bolButton = event.target.closest("[data-view-bol]");
    if (bolButton) {
      openShipmentDocuments(bolButton.dataset.viewBol);
    }
  });
}

function wireAuth() {
  const loginError = document.getElementById("loginError");
  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loginError) {
      loginError.textContent = "";
    }
    const form = new FormData(event.currentTarget);
    try {
      const response = await api("/api/login", {
        method: "POST",
        body: {
          email: form.get("email"),
          password: form.get("password")
        }
      });
      state.user = response.user;
      showApp();
      applyPermissions();
      showToast(`Signed in as ${state.user.email}.`);
      await refreshAll();
    } catch (error) {
      if (loginError) {
        loginError.textContent = error.message || "Email or password is incorrect.";
      }
    }
  });
}

function wireForms() {
  decorateRequiredQuoteLabels();
  populateTimeSelects();
  wireAccessorialDropdowns();

  const carrierModeSelect = document.querySelector("[name='carrierMode']");
  carrierModeSelect.addEventListener("change", () => {
    state.carrierModeTouched = true;
    syncCarrierControls();
  });

  document.getElementById("customerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/customers", {
      method: "POST",
      body: {
        companyName: form.get("companyName"),
        billingEmail: form.get("billingEmail"),
        paymentTerms: form.get("paymentTerms"),
        portalEmail: form.get("portalEmail"),
        portalPassword: form.get("portalPassword")
      }
    });
    event.currentTarget.reset();
    showToast("Customer added.");
    await refreshAll();
  });

  document.getElementById("tariffForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/tariffs", {
      method: "POST",
      body: {
        customerId: form.get("customerId"),
        ruleType: form.get("ruleType"),
        fixedAmount: form.get("fixedAmount"),
        markupPercentage: form.get("markupPercentage")
      }
    });
    showToast("Tariff saved.");
    await refreshAll();
  });

  const quoteForm = document.getElementById("quoteForm");
  quoteForm.addEventListener("input", () => clearQuoteFormErrors(quoteForm));
  quoteForm.addEventListener("change", () => clearQuoteFormErrors(quoteForm));
  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateQuoteForm(quoteForm)) {
      return;
    }

    const body = quotePayload(new FormData(event.currentTarget));
    const response = await api("/api/quotes", {
      method: "POST",
      body
    });
    state.currentQuote = response.quote;
    showToast("Quote created.");
    renderQuoteResults(response.quote);
    await refreshAll({ keepQuoteResults: true });
  });

  syncCarrierControls();
}

async function bootApp() {
  state.health = await api("/api/health", { public: true });
  renderHealth();

  try {
    const response = await api("/api/me", { public: true });
    state.user = response.user;
    showApp();
    applyPermissions();
    await refreshAll();
  } catch (error) {
    if (error.status !== 401) {
      showToast(error.message, true);
    }
    state.user = null;
    showLogin();
    applyPermissions();
  }
}

async function refreshAll(options = {}) {
  try {
    const [health, customers, tariffs, quotes, shipments, invoices] = await Promise.all([
      api("/api/health"),
      api("/api/customers"),
      api("/api/tariffs"),
      api("/api/quotes"),
      api("/api/shipments"),
      api("/api/invoices")
    ]);

    state.health = health;
    state.customers = customers.customers;
    state.tariffs = tariffs.tariffRules;
    state.quotes = quotes.quotes;
    state.shipments = shipments.shipments;
    state.invoices = invoices.invoices;

    renderHealth();
    renderUserChip();
    renderCustomerOptions();
    renderCustomers();
    renderDashboard();
    renderShipments();
    renderInvoices();
    renderModal();
    syncCarrierControls();

    if (!options.keepQuoteResults && !state.currentQuote) {
      document.getElementById("quoteResults").textContent = "Submit a quote to see available rates.";
    }
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      showLogin();
      applyPermissions();
      return;
    }
    showToast(error.message, true);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin"
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.message || "Request failed.");
    error.status = response.status;
    error.code = payload.error;
    throw error;
  }

  return payload;
}

function setView(name) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${name}View`);
  });

  const meta = viewMeta[name] || viewMeta.dashboard;
  const [title, subtitle] = typeof meta === "function" ? meta() : meta;
  document.getElementById("viewTitle").textContent = title;
  document.getElementById("viewSubtitle").textContent = subtitle;
}

function showLogin() {
  closeModal();
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
  const loginError = document.getElementById("loginError");
  if (loginError) {
    loginError.textContent = "";
  }
}

function showApp() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
}

function applyPermissions() {
  const isStaff = isStaffUser();
  const isCustomer = isCustomerUser();
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isStaff);
  });
  document.getElementById("customersNavButton").classList.toggle("hidden", !isStaff);
  const customersMetricButton = document.getElementById("customersMetricButton");
  if (customersMetricButton) {
    customersMetricButton.classList.toggle("hidden", !isStaff);
  }
  const customerMetricLabel = document.getElementById("customerMetricLabel");
  const quoteMetricLabel = document.getElementById("quoteMetricLabel");
  const shipmentMetricLabel = document.getElementById("shipmentMetricLabel");
  const invoiceMetricLabel = document.getElementById("invoiceMetricLabel");
  if (customerMetricLabel) {
    customerMetricLabel.textContent = isStaff ? "Customers" : "Your Account";
  }
  if (quoteMetricLabel) {
    quoteMetricLabel.textContent = isStaff ? "Quotes" : "My Quotes";
  }
  if (shipmentMetricLabel) {
    shipmentMetricLabel.textContent = isStaff ? "Shipments" : "My Shipments";
  }
  if (invoiceMetricLabel) {
    invoiceMetricLabel.textContent = isStaff ? "Draft invoices" : "My Invoices";
  }
  const quoteCustomerField = document.getElementById("quoteCustomerField");
  if (quoteCustomerField) {
    quoteCustomerField.classList.toggle("hidden", isCustomer);
  }
  const quoteCustomerSelect = document.getElementById("quoteCustomerSelect");
  if (quoteCustomerSelect && isCustomer) {
    quoteCustomerSelect.value = state.user?.customerId || quoteCustomerSelect.value;
  }
  if (!isStaff && document.querySelector(".nav-button.active")?.dataset.view === "customers") {
    setView("dashboard");
  }
  renderUserChip();
  renderDashboardSupportPanel();
}

function isStaffUser() {
  return ["admin", "operations"].includes(state.user?.role);
}

function isCustomerUser() {
  return state.user?.role === "customer";
}

function customerPriceLabel() {
  return isCustomerUser() ? "Cost" : "Sell price";
}

function renderHealth() {
  const dot = document.getElementById("statusDot");
  const healthText = document.getElementById("healthText");
  const loginDot = document.getElementById("loginStatusDot");
  const loginHealthText = document.getElementById("loginHealthText");

  if (dot) {
    dot.classList.toggle("ready", Boolean(state.health?.ok));
  }
  if (loginDot) {
    loginDot.classList.toggle("ready", Boolean(state.health?.ok));
  }

  const configuredCarriers = [];
  if (state.health?.speedshipConfigured) {
    configuredCarriers.push("SpeedShip LTL");
  }
  if (state.health?.mothershipConfigured) {
    configuredCarriers.push("Mothership");
  }

  const message =
    configuredCarriers.length > 0
      ? `Server ready, ${configuredCarriers.join(" and ")} configured`
      : "Server ready, demo mode";
  if (healthText) {
    healthText.textContent = state.user
      ? message
      : "Sign in to access the local TMS";
  }
  if (loginHealthText) {
    loginHealthText.textContent = message;
  }
}

function renderUserChip() {
  const chip = document.getElementById("userChip");
  if (!chip) {
    return;
  }

  if (!state.user) {
    chip.textContent = "";
    return;
  }

  chip.textContent = `${state.user.email} · ${state.user.role}`;
}

async function logout() {
  await api("/api/logout", {
    method: "POST"
  });
  state.user = null;
  state.currentQuote = null;
  closeModal();
  showLogin();
  renderUserChip();
  renderHealth();
}

function wireModal() {
  document.getElementById("modalCloseButton").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (event) => {
    if (event.target.id === "modalOverlay") {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function openModal(title, bodyHtml) {
  state.modal = { type: "static", title, bodyHtml };
  paintModal(title, bodyHtml);
}

function paintModal(title, bodyHtml) {
  const overlay = document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  document.getElementById("modalBody").innerHTML = "";
  state.modal = null;
}

function renderModal() {
  if (!state.modal) {
    return;
  }

  if (state.modal.type === "summary") {
    const kind = state.modal.kind;
    const modals = {
      customers: { title: "Customers", body: customerSummaryHtml() },
      quotes: { title: "Quotes", body: quoteSummaryHtml() },
      shipments: { title: "Shipments", body: shipmentSummaryHtml() },
      invoices: { title: "Draft invoices", body: invoiceSummaryHtml() }
    };
    const modal = modals[kind];
    if (modal) {
      paintModal(modal.title, modal.body);
    }
    return;
  }

  paintModal(state.modal.title, state.modal.bodyHtml);
}

function openDashboardModal(kind) {
  if (!["customers", "quotes", "shipments", "invoices"].includes(kind)) {
    return;
  }
  state.modal = { type: "summary", kind };
  renderModal();
}

async function openShipmentTracking(shipmentId) {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    return;
  }

  const title = `Tracking ${shipment.confirmationNumber}`;
  openModal(title, `<div class="empty-state">Loading tracking details...</div>`);
  try {
    const response = await api(`/api/shipments/${shipmentId}/tracking`);
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `
      ${shipmentDetailsHtml(shipment, response.events || [])}
    `);
  } catch (error) {
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `<div class="empty-state">${escapeHtml(error.message || "Tracking lookup failed.")}</div>`);
  }
}

async function openShipmentDetails(shipmentId) {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    return;
  }

  await openShipmentTracking(shipmentId);
}

async function openShipmentDocuments(shipmentId) {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    return;
  }

  const title = `Bill of Lading ${shipment.confirmationNumber}`;
  openModal(title, `<div class="empty-state">Loading bill of lading...</div>`);
  try {
    const response = await api(`/api/shipments/${shipmentId}/documents`);
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, shipmentDocumentsHtml(shipment, response.documents || [], response.message || ""));
  } catch (error) {
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `<div class="empty-state">${escapeHtml(error.message || "BOL lookup failed.")}</div>`);
  }
}

async function openQuoteDetails(quoteId) {
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  openModal(`Quote ${quote.carrierQuoteId}`, quoteDetailsHtml(quote));
}

async function openInvoiceDetails(invoiceId) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return;
  }

  const shipment = state.shipments.find((item) => item.id === invoice.shipmentId) || null;
  openModal(`Invoice ${invoice.invoiceNumber}`, invoiceDetailsHtml(invoice, shipment));
}

function openCustomerEditor(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  const tariff = state.tariffs.find((rule) => rule.customerId === customerId) || {
    ruleType: "percentage",
    fixedAmount: 0,
    markupPercentage: 0
  };

  if (!customer) {
    return;
  }

  openModal(
    `Edit ${customer.companyName}`,
    `
      <form id="customerEditForm" class="modal-grid">
        <label>
          Company name
          <input name="companyName" required value="${escapeHtml(customer.companyName)}">
        </label>
        <label>
          Billing email
          <input name="billingEmail" value="${escapeHtml(customer.billingEmail || "")}">
        </label>
        <label>
          Payment terms
          <input name="paymentTerms" value="${escapeHtml(customer.paymentTerms || "Net 15")}">
        </label>
        <label>
          Portal username
          <input name="portalEmail" value="${escapeHtml(customer.portalEmail || "")}">
        </label>
        <label>
          Portal password
          <input name="portalPassword" type="password" placeholder="Leave blank to keep current password">
        </label>
        <label>
          Account status
          <select name="status">
            <option value="active" ${customer.status === "active" ? "selected" : ""}>Active</option>
            <option value="disabled" ${customer.status === "disabled" ? "selected" : ""}>Disabled</option>
          </select>
        </label>
        <label>
          Tariff rule
          <select name="ruleType">
            <option value="fixed" ${tariff.ruleType === "fixed" ? "selected" : ""}>Fixed markup</option>
            <option value="percentage" ${tariff.ruleType === "percentage" ? "selected" : ""}>Percentage markup</option>
          </select>
        </label>
        <label>
          Fixed amount
          <input name="fixedAmount" type="number" min="0" step="0.01" value="${escapeHtml(String(tariff.fixedAmount ?? 0))}">
        </label>
        <label>
          Markup percent
          <input name="markupPercentage" type="number" min="0" step="0.1" value="${escapeHtml(String(tariff.markupPercentage ?? 0))}">
        </label>
        <div class="modal-actions">
          <button class="primary-action" type="submit">Save Changes</button>
        </div>
      </form>
    `
  );

  document.getElementById("customerEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/customers/${customer.id}`, {
      method: "PATCH",
      body: {
        companyName: form.get("companyName"),
        billingEmail: form.get("billingEmail"),
        paymentTerms: form.get("paymentTerms"),
        portalEmail: form.get("portalEmail"),
        portalPassword: form.get("portalPassword"),
        status: form.get("status"),
        ruleType: form.get("ruleType"),
        fixedAmount: form.get("fixedAmount"),
        markupPercentage: form.get("markupPercentage")
      }
    });
    closeModal();
    showToast("Customer updated.");
    await refreshAll();
  });
}

async function toggleCustomerStatus(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  const nextStatus = customer.status === "disabled" ? "active" : "disabled";
  await api(`/api/customers/${customerId}`, {
    method: "PATCH",
    body: { status: nextStatus }
  });
  showToast(`Customer ${nextStatus}.`);
  await refreshAll();
}

async function deleteCustomerAccount(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  if (!window.confirm(`Delete ${customer.companyName}? This removes the customer and related data.`)) {
    return;
  }

  await api(`/api/customers/${customerId}`, {
    method: "DELETE"
  });
  showToast("Customer deleted.");
  await refreshAll();
}

function customerSummaryHtml() {
  if (state.customers.length === 0) {
    return `<div class="empty-state">No customers yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.customers
        .map((customer) => {
          const tariff = state.tariffs.find((rule) => rule.customerId === customer.id);
          return `
            <article class="row-item">
              <div>
                <strong>${escapeHtml(customer.companyName)}</strong>
                <small>${escapeHtml(customer.billingEmail || "No billing email")} · ${escapeHtml(customer.paymentTerms)}</small>
                <div class="meta-line">
                  <span class="pill">${escapeHtml(customer.portalEmail || "No portal user")}</span>
                  <span class="pill">${escapeHtml(customer.status)}</span>
                  <span class="pill">${escapeHtml(tariff?.ruleType || "no tariff")}</span>
                  <span class="pill">${money.format(Number(tariff?.fixedAmount || 0))} fixed</span>
                  <span class="pill">${Number(tariff?.markupPercentage || 0)}% markup</span>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function quoteSummaryHtml() {
  if (state.quotes.length === 0) {
    return `<div class="empty-state">No quotes yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.quotes
        .slice(0, 50)
        .map((quote) => quoteRow(quote))
        .join("")}
    </div>
  `;
}

function shipmentSummaryHtml() {
  if (state.shipments.length === 0) {
    return `<div class="empty-state">No shipments yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.shipments
        .slice(0, 50)
        .map((shipment) => shipmentRow(shipment))
        .join("")}
    </div>
  `;
}

function invoiceSummaryHtml() {
  if (state.invoices.length === 0) {
    return `<div class="empty-state">No invoices yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.invoices
        .slice(0, 50)
        .map((invoice) => invoiceRow(invoice))
        .join("")}
    </div>
  `;
}

function renderDashboardSupportPanel() {
  const heading = document.getElementById("dashboardSupportHeading");
  const body = document.getElementById("dashboardSupportBody");
  if (!heading || !body) {
    return;
  }

  if (isStaffUser()) {
    heading.textContent = "Next Setup Steps";
    body.innerHTML = `
      <ul class="check-list">
        <li>Add real customers.</li>
        <li>Set customer markup rules.</li>
        <li>Add your Mothership sandbox token to backend env.</li>
        <li>Run one sandbox quote before enabling carrier booking.</li>
      </ul>
    `;
    return;
  }

  heading.textContent = "My Portal";
  const recentQuotes = state.quotes.slice(0, 3);
  const recentInvoices = state.invoices.slice(0, 3);
  body.innerHTML = `
    <div class="portal-grid">
      <section class="portal-card">
        <div class="panel-heading compact">
          <h3>Recent Quotes</h3>
        </div>
        <div class="portal-stack">
          ${recentQuotes.length ? recentQuotes.map((quote) => quoteRow(quote, { showActions: true })).join("") : `<div class="empty-state">No quotes yet.</div>`}
        </div>
      </section>
      <section class="portal-card">
        <div class="panel-heading compact">
          <h3>Recent Invoices</h3>
        </div>
        <div class="portal-stack">
          ${recentInvoices.length ? recentInvoices.map((invoice) => invoiceRow(invoice, { showActions: true })).join("") : `<div class="empty-state">No invoices yet.</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderQuotePreview() {
  return;
  const preview = document.getElementById("quotePreview");
  const form = document.getElementById("quoteForm");
  if (!preview || !form) {
    return;
  }

  const values = new FormData(form);
  const customerId = String(values.get("customerId") || state.user?.customerId || "");
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const customerLabel = customer?.companyName || (isCustomerUser() ? "Your account" : "Select a customer");
  const carrierMode = values.get("carrierMode") === "mothershipSandbox" ? "Mothership sandbox" : "Demo rates";
  const booking = values.get("bookWithCarrier") ? "Book after quote" : "Quote only";
  const pickup = locationSummary(values, "pickup");
  const delivery = locationSummary(values, "delivery");
  const freight = freightSummary(values);
  const pickupAccessorials = splitAccessorials(values.get("pickupAccessorials"));
  const deliveryAccessorials = splitAccessorials(values.get("deliveryAccessorials"));
  const accessorials = [...pickupAccessorials, ...deliveryAccessorials];

  preview.classList.remove("empty-state");
  preview.innerHTML = `
    <div class="quote-preview-grid">
      ${previewItem("Customer", customerLabel)}
      ${previewItem("Carrier mode", carrierMode)}
      ${previewItem("Booking", booking)}
      ${previewItem("Pickup", pickup)}
      ${previewItem("Delivery", delivery)}
      ${previewItem("Freight", freight)}
      ${previewItem("Accessorials", accessorials.length ? accessorials.join(", ") : "None")}
    </div>
  `;
}

function previewItem(label, value) {
  return `
    <article class="quote-preview-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "—")}</strong>
    </article>
  `;
}

function locationSummary(values, prefix) {
  const city = String(values.get(`${prefix}City`) || "").trim();
  const stateValue = String(values.get(`${prefix}State`) || "").trim();
  const street = String(values.get(`${prefix}Street`) || "").trim();
  if (!city && !stateValue && !street) {
    return "Enter location details";
  }
  const cityState = [city, stateValue].filter(Boolean).join(", ");
  return [street, cityState].filter(Boolean).join(" · ") || "Enter location details";
}

function freightSummary(values) {
  const quantity = Number(values.get("quantity") || 0);
  const freightType = String(values.get("freightType") || "").trim();
  const freightClass = String(values.get("freightClass") || "").trim();
  const weight = Number(values.get("weight") || 0);
  const length = Number(values.get("length") || 0);
  const width = Number(values.get("width") || 0);
  const height = Number(values.get("height") || 0);
  const totalWeight = quantity && weight ? quantity * weight : 0;

  const pieces = `${quantity || "0"} ${freightType.toLowerCase() || "piece"}${quantity === 1 ? "" : "s"}`;
  const classText = freightClass ? `Class ${freightClass}` : "Set class";
  const weightText = weight ? `${weight} lbs each${totalWeight ? ` (${totalWeight} lbs total)` : ""}` : "Set weight";
  const sizeText = length && width && height ? `${length} x ${width} x ${height} in` : "Set dimensions";
  return `${pieces} · ${classText} · ${weightText} · ${sizeText}`;
}

function quoteRow(quote, options = {}) {
  const showActions = options.showActions !== false;
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(quote.customerName)}</strong>
        <small>${escapeHtml(quote.carrier)} · ${escapeHtml(quote.status)}</small>
        <div class="meta-line">
          <span class="pill">${escapeHtml(quote.carrierQuoteId)}</span>
          <span class="pill">${formatDate(quote.createdAt)}</span>
          <span class="pill">${escapeHtml(quote.pickup?.address?.city || "")} → ${escapeHtml(quote.delivery?.address?.city || "")}</span>
        </div>
      </div>
      ${showActions ? `
        <div class="row-actions">
          <button class="secondary-action" type="button" data-view-quote="${escapeHtml(quote.id)}">View Quote</button>
        </div>
      ` : ""}
    </article>
  `;
}

function shipmentRow(shipment, options = {}) {
  const showActions = options.showActions !== false;
  const priceLabel = customerPriceLabel();
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(shipment.confirmationNumber)}</strong>
        <small>${escapeHtml(shipment.customerName)} · ${escapeHtml(shipment.pickup.address.city)}, ${escapeHtml(shipment.pickup.address.state)} to ${escapeHtml(shipment.delivery.address.city)}, ${escapeHtml(shipment.delivery.address.state)}</small>
        <div class="meta-line">
          <span class="pill">${escapeHtml(shipment.status)}</span>
          <span class="pill">${escapeHtml(shipment.provider)}</span>
          ${shipment.referenceNumber ? `<span class="pill">PO ${escapeHtml(shipment.referenceNumber)}</span>` : ""}
          <span class="pill">${formatDate(shipment.createdAt)}</span>
          <span class="pill">${priceLabel} ${money.format(shipment.sellPrice)}</span>
        </div>
      </div>
      ${showActions ? `
        <div class="row-actions">
          <button class="secondary-action" type="button" data-view-shipment="${escapeHtml(shipment.id)}">View Shipment</button>
          <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">Track</button>
          <button class="secondary-action" type="button" data-view-bol="${escapeHtml(shipment.id)}">BOL</button>
        </div>
      ` : ""}
    </article>
  `;
}

function invoiceRow(invoice, options = {}) {
  const showActions = options.showActions !== false;
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(invoice.invoiceNumber)}</strong>
        <small>${escapeHtml(invoice.customerName)} · Shipment ${escapeHtml(invoice.shipmentId)}</small>
        <div class="meta-line">
          <span class="pill">${escapeHtml(invoice.status)}</span>
          ${invoice.referenceNumber ? `<span class="pill">PO ${escapeHtml(invoice.referenceNumber)}</span>` : ""}
          <span class="pill">${formatDate(invoice.createdAt)}</span>
        </div>
      </div>
      <div class="price-block">
        <strong>${money.format(invoice.amount)}</strong>
        ${showActions ? `<button class="secondary-action" type="button" data-view-invoice="${escapeHtml(invoice.id)}">View Invoice</button>` : ""}
      </div>
    </article>
  `;
}

function detailSection(title, contentHtml) {
  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <div>${contentHtml}</div>
    </section>
  `;
}

function trackingTimelineHtml(events) {
  if (!events.length) {
    return `<div class="empty-state">No tracking events yet.</div>`;
  }

  return `
    <div class="timeline">
      ${events
        .map(
          (event) => `
            <article class="timeline-item">
              <div class="timeline-dot"></div>
              <div>
                <strong>${escapeHtml(event.status)}</strong>
                <small>${formatDateTime(event.eventTime)}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</small>
                ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function quoteDetailsHtml(quote) {
  const customerView = isCustomerUser();
  const rateCards = Array.isArray(quote.rates) && quote.rates.length
    ? quote.rates
        .map(
          (rate) => `
            <article class="rate-item compact-rate quote-rate-card">
              <div class="rate-main">
                <div class="rate-title-row">
                  <strong>${escapeHtml(carrierDisplayName(rate.provider, quote.carrierMode))} · ${escapeHtml(formatRateService(rate.service))}</strong>
                  <span class="carrier-badge">${escapeHtml(carrierDisplayName(rate.provider, quote.carrierMode))}</span>
                </div>
                <div class="rate-meta-row">
                  <span class="pill">${escapeHtml(rate.providerScac || "No SCAC")}</span>
                  <span class="pill">Offer ${escapeHtml(rate.carrierRateId || rate.id || "")}</span>
                  ${rate.transitDays ? `<span class="pill">Transit ${escapeHtml(formatTransitDays(rate.transitDays))}</span>` : ""}
                  ${rate.estimatedDeliveryDate ? `<span class="pill">ETA ${escapeHtml(formatDate(rate.estimatedDeliveryDate))}</span>` : ""}
                  ${customerView
                    ? `<span class="pill">Cost ${money.format(rate.sellPrice)}</span>`
                    : `
                      <span class="pill">Cost ${money.format(rate.carrierCost)}</span>
                      <span class="pill">Markup ${money.format(rate.markup)}</span>
                      <span class="pill">Sell ${money.format(rate.sellPrice)}</span>
                    `}
                </div>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No rate details.</div>`;
  const carrierNotice = quote.carrierMessage
    ? `
      <div class="quote-status notice-state success-state">
        <strong>Carrier response</strong>
        <p>${escapeHtml(quote.carrierMessage)}</p>
      </div>
    `
    : "";
  const totalWeight = Number(quote.freight?.[0]?.quantity || 0) * Number(quote.freight?.[0]?.weight || 0);
  const freightSize = [quote.freight?.[0]?.length, quote.freight?.[0]?.width, quote.freight?.[0]?.height].filter(Boolean).join(" x ");

  return `
    <div class="detail-grid">
      ${detailSection(
        "Quote Summary",
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(quote.carrierMode)}</span>
            <span class="pill">${escapeHtml(quote.status)}</span>
            <span class="pill">${escapeHtml(quote.carrierQuoteId)}</span>
          </div>
          ${carrierNotice}
          <p><strong>Reference / PO:</strong> ${escapeHtml(quote.referenceNumber || "")}</p>
          ${customerView ? "" : `<p><strong>Tariff:</strong> ${escapeHtml(quote.tariffRule?.ruleType || "n/a")} ${quote.tariffRule?.ruleType === "fixed" ? `· ${money.format(Number(quote.tariffRule?.fixedAmount || 0))}` : `· ${Number(quote.tariffRule?.markupPercentage || 0)}%`}</p>`}
          <p><strong>Pickup:</strong> ${escapeHtml(quote.pickup?.name || "")}, ${escapeHtml(quote.pickup?.address?.street || "")}, ${escapeHtml(quote.pickup?.address?.city || "")}, ${escapeHtml(quote.pickup?.address?.state || "")}</p>
          <p><strong>Delivery:</strong> ${escapeHtml(quote.delivery?.name || "")}, ${escapeHtml(quote.delivery?.address?.street || "")}, ${escapeHtml(quote.delivery?.address?.city || "")}, ${escapeHtml(quote.delivery?.address?.state || "")}</p>
          <p><strong>Freight:</strong> ${escapeHtml(quote.freight?.[0]?.quantity || "")} ${escapeHtml(quote.freight?.[0]?.type || "")} · Class ${escapeHtml(quote.freight?.[0]?.freightClass || "")} · ${escapeHtml(quote.freight?.[0]?.weight || "")} lbs each${totalWeight ? ` (${escapeHtml(totalWeight)} lbs total)` : ""}${freightSize ? ` · ${escapeHtml(freightSize)} in` : ""}</p>
        `
      )}
      ${detailSection("Rates", rateCards)}
    </div>
  `;
}

function shipmentDetailsHtml(shipment, events = []) {
  const priceLabel = customerPriceLabel();
  const latestEvent = Array.isArray(events) && events.length ? events[events.length - 1] : null;
  const trackingSummary = trackingSummaryHtml(shipment, latestEvent, events.length);
  const totalWeight = Number(shipment.freight?.[0]?.quantity || 0) * Number(shipment.freight?.[0]?.weight || 0);
  const freightSize = [shipment.freight?.[0]?.length, shipment.freight?.[0]?.width, shipment.freight?.[0]?.height].filter(Boolean).join(" x ");
  return `
    <div class="detail-grid">
      ${detailSection(
        "Tracking Snapshot",
        trackingSummary
      )}
      ${detailSection(
        "Shipment Summary",
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(shipment.status)}</span>
            <span class="pill">${escapeHtml(shipment.provider)}</span>
            <span class="pill">${escapeHtml(shipment.confirmationNumber)}</span>
          </div>
          <p><strong>Reference / PO:</strong> ${escapeHtml(shipment.referenceNumber || "")}</p>
          <p><strong>Pickup:</strong> ${escapeHtml(shipment.pickup?.name || "")}, ${escapeHtml(shipment.pickup?.address?.city || "")}, ${escapeHtml(shipment.pickup?.address?.state || "")}</p>
          <p><strong>Delivery:</strong> ${escapeHtml(shipment.delivery?.name || "")}, ${escapeHtml(shipment.delivery?.address?.city || "")}, ${escapeHtml(shipment.delivery?.address?.state || "")}</p>
          <p><strong>Freight:</strong> ${escapeHtml(shipment.freight?.[0]?.quantity || "")} ${escapeHtml(shipment.freight?.[0]?.type || "")} · Class ${escapeHtml(shipment.freight?.[0]?.freightClass || "")} · ${escapeHtml(shipment.freight?.[0]?.weight || "")} lbs each${totalWeight ? ` (${escapeHtml(totalWeight)} lbs total)` : ""}${freightSize ? ` · ${escapeHtml(freightSize)} in` : ""}</p>
          <p><strong>${escapeHtml(priceLabel)}:</strong> ${money.format(shipment.sellPrice)}</p>
          <div class="modal-actions">
            <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">Refresh Tracking</button>
          </div>
        `
      )}
      ${detailSection("Tracking Timeline", trackingTimelineHtml(events))}
    </div>
  `;
}

function trackingSummaryHtml(shipment, latestEvent, eventCount) {
  const latestLabel = latestEvent ? `${formatDateTime(latestEvent.eventTime)}${latestEvent.location ? ` · ${escapeHtml(latestEvent.location)}` : ""}` : "No tracking updates yet";
  const latestDescription = latestEvent?.description || "Tracking will appear here when the carrier sends updates.";

  return `
    <div class="tracking-summary">
      <div class="meta-line">
        <span class="pill">${escapeHtml(shipment.status)}</span>
        <span class="pill">${escapeHtml(shipment.provider)}</span>
        <span class="pill">${escapeHtml(shipment.confirmationNumber)}</span>
      </div>
      <p><strong>Reference / PO:</strong> ${escapeHtml(shipment.referenceNumber || "")}</p>
      <p><strong>Last update:</strong> ${latestLabel}</p>
      <p>${escapeHtml(latestDescription)}</p>
      <p><strong>Events:</strong> ${eventCount || 0}</p>
      <div class="modal-actions">
        <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">Refresh Tracking</button>
        <button class="secondary-action" type="button" data-view-bol="${escapeHtml(shipment.id)}">View BOL</button>
      </div>
    </div>
  `;
}

function shipmentDocumentsHtml(shipment, documents = [], notice = "") {
  const heading = shipment.status === "booked_with_carrier" ? "Carrier Documents" : "Documents";
  const documentCards = documents.length
    ? documents
        .map(
          (document) => `
            <article class="row-item document-row">
              <div>
                <strong>${escapeHtml(document.label || "Document")}</strong>
                <small>${escapeHtml(document.type || "Document")} · ${escapeHtml(document.source || shipment.provider || "")}</small>
                <div class="meta-line">
                  <span class="pill">${escapeHtml(document.id || "")}</span>
                </div>
              </div>
              <div class="row-actions">
                <a class="primary-action document-link" href="${escapeHtml(document.url)}" target="_blank" rel="noopener noreferrer">Open</a>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">${escapeHtml(notice || "No bill of lading was returned for this shipment yet.")}</div>`;

  return `
    <div class="detail-grid">
      ${detailSection(
        heading,
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(shipment.provider)}</span>
            <span class="pill">${escapeHtml(shipment.confirmationNumber)}</span>
            <span class="pill">${escapeHtml(shipment.referenceNumber || "")}</span>
          </div>
          ${documentCards}
        `
      )}
    </div>
  `;
}

function invoiceDetailsHtml(invoice, shipment) {
  return `
    <div class="detail-grid">
      ${detailSection(
        "Invoice Summary",
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(invoice.status)}</span>
            <span class="pill">${escapeHtml(invoice.invoiceNumber)}</span>
            ${shipment ? `<span class="pill">Shipment ${escapeHtml(shipment.confirmationNumber)}</span>` : ""}
          </div>
          <p><strong>Reference / PO:</strong> ${escapeHtml(invoice.referenceNumber || "")}</p>
          <p><strong>Amount:</strong> ${money.format(invoice.amount)}</p>
          <p><strong>Issued:</strong> ${formatDateTime(invoice.issuedAt || invoice.createdAt)}</p>
          <p><strong>Due:</strong> ${formatDateTime(invoice.dueAt || null) || "Not set"}</p>
          ${shipment ? `
            <div class="modal-actions">
              <button class="secondary-action" type="button" data-view-shipment="${escapeHtml(shipment.id)}">View Shipment</button>
              <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">Track Shipment</button>
            </div>
          ` : ""}
        `
      )}
    </div>
  `;
}

function carrierDisplayName(provider, carrierMode = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  const mode = String(carrierMode || "").trim().toLowerCase();
  if (normalized.includes("speedship") || mode === "speedshipltl") {
    return "SpeedShip";
  }
  if (normalized.includes("mothership")) {
    return "Mothership";
  }
  if (!provider) {
    return "Carrier";
  }
  return String(provider)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRateService(service) {
  const text = String(service || "").trim();
  if (!text) {
    return "Service";
  }
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function decorateRequiredQuoteLabels() {
  document.querySelectorAll("#quoteForm label").forEach((label) => {
    if (label.querySelector(".field-label")) {
      return;
    }

    const control = label.querySelector("input, select, textarea");
    if (!control || !control.required) {
      return;
    }

    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) {
      return;
    }

    const fieldLabel = document.createElement("span");
    fieldLabel.className = "field-label";
    fieldLabel.textContent = textNode.textContent.trim();

    const requiredMark = document.createElement("span");
    requiredMark.className = "required-mark";
    requiredMark.setAttribute("aria-hidden", "true");
    requiredMark.textContent = "*";

    fieldLabel.appendChild(requiredMark);
    textNode.parentNode.insertBefore(fieldLabel, textNode);
    textNode.remove();
  });
}

function validateQuoteForm(form) {
  const error = document.getElementById("quoteFormError");
  clearQuoteFormErrors(form);

  const requiredControls = Array.from(form.querySelectorAll("[required]"));
  const invalidControls = requiredControls.filter((control) => !control.checkValidity());

  if (invalidControls.length === 0) {
    if (error) {
      error.textContent = "";
    }
    return true;
  }

  invalidControls.forEach((control) => {
    control.classList.add("field-invalid");
    control.setAttribute("aria-invalid", "true");
    const label = control.closest("label");
    if (label) {
      label.classList.add("field-invalid");
    }
  });

  if (error) {
    error.textContent = "Please fill in the highlighted required fields before getting rates.";
  }

  invalidControls[0].focus();
  showToast("Please fill in the required fields.", true);
  return false;
}

function clearQuoteFormErrors(form) {
  form.querySelectorAll(".field-invalid").forEach((element) => {
    element.classList.remove("field-invalid");
  });
  form.querySelectorAll("[aria-invalid='true']").forEach((element) => {
    element.removeAttribute("aria-invalid");
  });

  const error = document.getElementById("quoteFormError");
  if (error) {
    error.textContent = "";
  }
}

function syncCarrierControls() {
  const carrierModeSelect = document.querySelector("[name='carrierMode']");
  const hint = document.getElementById("carrierModeHint");
  if (!carrierModeSelect || !hint) {
    return;
  }

  if (
    state.health?.speedshipConfigured &&
    !state.carrierModeTouched &&
    !state.currentQuote &&
    carrierModeSelect.value === "demo"
  ) {
    carrierModeSelect.value = "speedshipLtl";
  } else if (
    state.health?.mothershipConfigured &&
    !state.health?.speedshipConfigured &&
    !state.carrierModeTouched &&
    !state.currentQuote &&
    carrierModeSelect.value === "demo"
  ) {
    carrierModeSelect.value = "mothershipSandbox";
  }

  const speedshipEnabled = carrierModeSelect.value === "speedshipLtl";
  const sandboxEnabled = carrierModeSelect.value === "mothershipSandbox";
  hint.textContent = speedshipEnabled
    ? "SpeedShip LTL is selected. Click a rate below to create the shipment."
    : sandboxEnabled
      ? "Mothership sandbox is selected. Click a rate below to purchase it in sandbox."
      : "Demo rates create local test bookings. Click a rate below to create the shipment.";
}

function renderCustomerOptions() {
  const options = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.companyName)}</option>`)
    .join("");

  const tariffSelect = document.getElementById("tariffCustomerSelect");
  const quoteSelect = document.getElementById("quoteCustomerSelect");
  if (tariffSelect) {
    tariffSelect.innerHTML = options;
  }
  if (quoteSelect) {
    quoteSelect.innerHTML = options;
    if (isCustomerUser()) {
      quoteSelect.value = state.user?.customerId || state.customers[0]?.id || "";
    }
  }
}

function renderCustomers() {
  const list = document.getElementById("customerList");

  if (state.customers.length === 0) {
    list.innerHTML = `<div class="empty-state">No customers yet.</div>`;
    return;
  }

  list.innerHTML = state.customers
    .map((customer) => {
      const tariff = state.tariffs.find((rule) => rule.customerId === customer.id);
      return `
        <article class="row-item" data-customer-id="${escapeHtml(customer.id)}">
          <div>
            <strong>${escapeHtml(customer.companyName)}</strong>
            <small>${escapeHtml(customer.billingEmail || "No billing email")} · ${escapeHtml(customer.paymentTerms)}</small>
            <div class="meta-line">
              <span class="pill">${escapeHtml(tariff?.ruleType || "no tariff")}</span>
              <span class="pill">${Number(tariff?.markupPercentage || 0)}% markup</span>
              <span class="pill">${money.format(Number(tariff?.fixedAmount || 0))} fixed</span>
            </div>
          </div>
          <span class="pill">${escapeHtml(customer.status)}</span>
        </article>
      `;
    })
    .join("");

  decorateCustomerRows(list);
}

function decorateCustomerRows(list) {
  const isStaff = ["admin", "operations"].includes(state.user?.role);
  if (!isStaff) {
    return;
  }

  list.querySelectorAll("[data-customer-id]").forEach((row) => {
    if (row.querySelector(".customer-row-actions")) {
      return;
    }

    const customerId = row.dataset.customerId;
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) {
      return;
    }

    const statusAction = customer.status === "disabled" ? "Enable" : "Disable";
    const actions = document.createElement("div");
    actions.className = "customer-row-actions";
    actions.innerHTML = `
      <button class="secondary-action" type="button" data-edit-customer="${escapeHtml(customer.id)}">Edit</button>
      <button class="secondary-action" type="button" data-toggle-customer-status="${escapeHtml(customer.id)}">${statusAction}</button>
      <button class="danger-action" type="button" data-delete-customer="${escapeHtml(customer.id)}">Delete</button>
    `;
    row.appendChild(actions);
  });

  list.querySelectorAll("[data-edit-customer]").forEach((button) => {
    button.addEventListener("click", () => openCustomerEditor(button.dataset.editCustomer));
  });
  list.querySelectorAll("[data-toggle-customer-status]").forEach((button) => {
    button.addEventListener("click", () => toggleCustomerStatus(button.dataset.toggleCustomerStatus));
  });
  list.querySelectorAll("[data-delete-customer]").forEach((button) => {
    button.addEventListener("click", () => deleteCustomerAccount(button.dataset.deleteCustomer));
  });
}

function renderDashboard() {
  document.getElementById("customerCount").textContent = state.customers.length;
  document.getElementById("quoteCount").textContent = state.quotes.length;
  document.getElementById("shipmentCount").textContent = state.shipments.length;
  document.getElementById("invoiceCount").textContent = state.invoices.filter((invoice) => invoice.status === "draft").length;

  const recent = document.getElementById("recentShipments");
  recent.innerHTML = state.shipments.length
    ? state.shipments.slice(0, 5).map(shipmentRow).join("")
    : `<div class="empty-state">No shipments booked yet.</div>`;

  renderDashboardSupportPanel();
}

function renderQuoteResults(quote) {
  const list = document.getElementById("quoteResults");
  list.classList.remove("empty-state");
  list.classList.toggle("compare-grid", Array.isArray(quote.rates) && quote.rates.length > 1);
  const customerView = isCustomerUser();
  const priceLabel = customerPriceLabel();
  if (!Array.isArray(quote.rates) || quote.rates.length === 0) {
    const notice = quote.carrierMode === "speedshipLtl"
      ? quote.carrierMessage || "SpeedShip sandbox connection succeeded, but this lane returned no matching rates."
      : "No rates were returned for this quote.";
    list.innerHTML = `
      <div class="quote-status notice-state success-state">
        <strong>SpeedShip connection succeeded</strong>
        <p>${escapeHtml(notice)}</p>
        ${quote.carrierQuoteId ? `<span class="pill">${escapeHtml(quote.carrierQuoteId)}</span>` : ""}
      </div>
    `;
    return;
  }
  list.innerHTML = quote.rates
    .map((rate) => `
      <article class="rate-item quote-rate-card">
        <div class="rate-main">
          <div class="rate-title-row">
            <strong>${escapeHtml(carrierDisplayName(rate.provider, quote.carrierMode))} · ${escapeHtml(formatRateService(rate.service))}</strong>
            <span class="carrier-badge">${escapeHtml(carrierDisplayName(rate.provider, quote.carrierMode))}</span>
          </div>
          <div class="rate-meta-row">
            <span class="pill">Quote ${escapeHtml(quote.carrierQuoteId)}</span>
            <span class="pill">Rate ${escapeHtml(rate.carrierRateId || rate.id)}</span>
            <span class="pill">${escapeHtml(rate.providerScac || "No SCAC")}</span>
            ${rate.transitDays ? `<span class="pill">Transit ${escapeHtml(formatTransitDays(rate.transitDays))}</span>` : ""}
            ${rate.estimatedDeliveryDate ? `<span class="pill">ETA ${escapeHtml(formatDate(rate.estimatedDeliveryDate))}</span>` : ""}
            ${customerView
              ? `<span class="pill">Cost ${money.format(rate.sellPrice)}</span>`
              : `
                <span class="pill">Cost ${money.format(rate.carrierCost)}</span>
                <span class="pill">Markup ${money.format(rate.markup)}</span>
              `}
          </div>
          ${Array.isArray(rate.warnings) && rate.warnings.length > 0 ? `
            <div class="rate-warning-row">
              ${rate.warnings.map((warning) => `<span class="pill warning-pill">${escapeHtml(warning)}</span>`).join("")}
            </div>
          ` : ""}
        </div>
        <div class="rate-aside">
          <small>${escapeHtml(priceLabel)}</small>
          <strong>${money.format(rate.sellPrice)}</strong>
          <button class="primary-action rate-book-action" type="button" data-book-rate="${escapeHtml(rate.id)}">Book Shipment</button>
        </div>
      </article>
    `)
    .join("");

  list.querySelectorAll("[data-book-rate]").forEach((button) => {
    button.addEventListener("click", () => bookRate(quote.id, button.dataset.bookRate));
  });
}

async function bookRate(quoteId, rateId) {
  const quote = state.currentQuote || state.quotes.find((item) => item.id === quoteId);
  const response = await api("/api/shipments", {
    method: "POST",
    body: {
      quoteId,
      rateId,
      bookWithCarrier: Boolean(quote?.carrierMode === "mothershipSandbox")
    }
  });

  showToast(`Booked ${response.shipment.confirmationNumber}.`);
  setView("shipments");
  await refreshAll();
}

function renderShipments() {
  const list = document.getElementById("shipmentList");
  list.innerHTML = state.shipments.length
    ? state.shipments.map(shipmentRow).join("")
    : `<div class="empty-state">No shipments yet.</div>`;
}

function renderInvoices() {
  const list = document.getElementById("invoiceList");
  list.innerHTML = state.invoices.length
    ? state.invoices
        .map((invoice) => invoiceRow(invoice))
        .join("")
    : `<div class="empty-state">No invoices yet.</div>`;
}

function quotePayload(form) {
  const pickupAccessorials = form.getAll("pickupAccessorials");
  const deliveryAccessorials = normalizeDeliveryAccessorials(form.getAll("deliveryAccessorials"));
  return {
    customerId: form.get("customerId"),
    carrierMode: form.get("carrierMode"),
    referenceNumber: form.get("referenceNumber"),
    pickupReadyDate: {
      date: form.get("pickupDate"),
      time: form.get("pickupTime")
    },
    pickup: {
      name: form.get("pickupName"),
      address: {
        street: form.get("pickupStreet"),
        city: form.get("pickupCity"),
        state: form.get("pickupState"),
        zip: form.get("pickupZip")
      },
      phoneNumber: form.get("pickupPhone"),
      emails: [],
      openTime: form.get("pickupOpen"),
      closeTime: form.get("pickupClose"),
      accessorials: pickupAccessorials
    },
    delivery: {
      name: form.get("deliveryName"),
      address: {
        street: form.get("deliveryStreet"),
        city: form.get("deliveryCity"),
        state: form.get("deliveryState"),
        zip: form.get("deliveryZip")
      },
      phoneNumber: form.get("deliveryPhone"),
      emails: [],
      openTime: form.get("deliveryOpen"),
      closeTime: form.get("deliveryClose"),
      accessorials: deliveryAccessorials
    },
    freight: [
      {
        quantity: Number(form.get("quantity")),
        type: form.get("freightType"),
        weight: Number(form.get("weight")),
        freightClass: form.get("freightClass"),
        length: Number(form.get("length")),
        width: Number(form.get("width")),
        height: Number(form.get("height")),
        description: form.get("description")
      }
    ]
  };
}

function normalizeDeliveryAccessorials(accessorials) {
  const normalized = Array.from(new Set(accessorials.filter(Boolean)));
  if (normalized.includes("residential") && !normalized.includes("scheduledDelivery")) {
    normalized.push("scheduledDelivery");
  }
  return normalized;
}

function populateTimeSelects() {
  document.querySelectorAll("[data-time-select]").forEach((select) => {
    if (select.dataset.populated === "true") {
      return;
    }

    const defaultValue = select.dataset.defaultValue || "0000";
    select.innerHTML = "";

    for (let hour = 0; hour < 24; hour += 1) {
      const value = `${String(hour).padStart(2, "0")}00`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = formatTimeHour(value);
      if (value === defaultValue) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    if (!select.value) {
      select.value = defaultValue;
    }
    select.dataset.populated = "true";
  });
}

function wireAccessorialDropdowns() {
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => {
    const update = () => {
      if (details.dataset.accessorialGroup === "delivery") {
        enforceDeliveryAccessorialDependencies(details);
      }
      syncAccessorialDropdown(details);
    };

    details.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", update);
    });

    update();
  });
}

function syncAccessorialDropdown(details) {
  const summary = details.querySelector(".accessorial-summary");
  if (!summary) {
    return;
  }

  const selectedLabels = Array.from(details.querySelectorAll("input[type='checkbox']:checked"))
    .map((checkbox) => checkbox.dataset.label || checkbox.value);

  if (selectedLabels.length === 0) {
    summary.textContent = "Select accessorials";
    return;
  }

  if (selectedLabels.length <= 2) {
    summary.textContent = selectedLabels.join(", ");
    return;
  }

  summary.textContent = `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2} more`;
}

function enforceDeliveryAccessorialDependencies(details) {
  const residential = details.querySelector("input[value='residential']");
  const scheduledDelivery = details.querySelector("input[value='scheduledDelivery']");
  if (!residential || !scheduledDelivery) {
    return;
  }

  if (residential.checked) {
    scheduledDelivery.checked = true;
  }
}

function setDefaultPickupDate() {
  const input = document.querySelector("[name='pickupDate']");
  const date = new Date();
  date.setDate(date.getDate() + 1);
  input.value = date.toISOString().slice(0, 10);
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString();
}

function formatTimeHour(value) {
  const hour = Number(String(value || "").slice(0, 2));
  if (!Number.isFinite(hour)) {
    return String(value || "");
  }

  const period = hour < 12 ? "AM" : "PM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:00 ${period}`;
}

function formatTransitDays(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const number = Number(text);
  if (Number.isFinite(number)) {
    return `${number} day${number === 1 ? "" : "s"}`;
  }

  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
