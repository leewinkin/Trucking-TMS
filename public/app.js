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
  pendingQuoteReentry: null,
  pendingBooking: null,
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

    const reenterButton = event.target.closest("[data-reenter-quote]");
    if (reenterButton) {
      reenterQuote(reenterButton.dataset.reenterQuote);
      return;
    }

    const invoiceButton = event.target.closest("[data-view-invoice]");
    if (invoiceButton) {
      openInvoiceDetails(invoiceButton.dataset.viewInvoice);
      return;
    }

    const confirmBookingButton = event.target.closest("[data-confirm-booking]");
    if (confirmBookingButton) {
      confirmPendingBooking();
      return;
    }

    const cancelBookingButton = event.target.closest("[data-cancel-booking]");
    if (cancelBookingButton) {
      cancelPendingBooking();
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

  document.getElementById("customerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/customers", {
      method: "POST",
      body: {
        companyName: form.get("companyName"),
        billingEmail: form.get("billingEmail"),
        paymentTerms: form.get("paymentTerms"),
        companyPhone: form.get("companyPhone"),
        companyOpenTime: form.get("companyOpenTime"),
        companyCloseTime: form.get("companyCloseTime"),
        companyStreet: form.get("companyStreet"),
        companyCity: form.get("companyCity"),
        companyState: form.get("companyState"),
        companyZip: form.get("companyZip"),
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
    const allowedCarrierModes = form.getAll("allowedCarrierModes");
    const tariffError = document.getElementById("tariffFormError");
    if (tariffError) {
      tariffError.textContent = "";
    }
    if (allowedCarrierModes.length === 0) {
      const message = "Select at least one carrier mode for this customer.";
      if (tariffError) {
        tariffError.textContent = message;
      }
      showToast(message, true);
      return;
    }
    await api("/api/tariffs", {
      method: "POST",
      body: {
        customerId: form.get("customerId"),
        ruleType: form.get("ruleType"),
        fixedAmount: form.get("fixedAmount"),
        markupPercentage: form.get("markupPercentage"),
        allowedCarrierModes
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

    const formError = document.getElementById("quoteFormError");
    try {
      const body = quotePayload(new FormData(event.currentTarget));
      const response = await api("/api/quotes", {
        method: "POST",
        body
      });
      state.currentQuote = response.quote;
      showToast("Quote created.");
      renderQuoteResults(response.quote);
      await refreshAll({ keepQuoteResults: true });
    } catch (error) {
      const noRates = error?.code === "NO_RATES_FOUND";
      const message = noRates
        ? "Carrier returned no rates for this lane."
        : error.message || "Quote request failed.";
      state.currentQuote = null;
      if (formError) {
        formError.textContent = message;
      }
      if (noRates) {
        const results = document.getElementById("quoteResults");
        results.classList.add("empty-state");
        results.textContent = message;
      }
      showToast(message, true);
    }
  });

  const tariffCustomerSelect = document.getElementById("tariffCustomerSelect");
  if (tariffCustomerSelect && !tariffCustomerSelect.dataset.modeSyncBound) {
    tariffCustomerSelect.addEventListener("change", () => {
      syncTariffCarrierModes(tariffCustomerSelect.value);
    });
    tariffCustomerSelect.dataset.modeSyncBound = "true";
  }

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
    if (isCustomerUser()) {
      autofillPickupFromCustomer(state.user?.customerId, true);
      syncCarrierControls();
    }

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

  if (name === "quote" && isCustomerUser() && !state.pendingQuoteReentry) {
    window.requestAnimationFrame(() => {
      autofillPickupFromCustomer(state.user?.customerId, true);
      syncCarrierControls();
    });
  }
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
    if (!state.pendingQuoteReentry) {
      autofillPickupFromCustomer(quoteCustomerSelect.value, true);
    }
  }
  if (quoteCustomerSelect && !quoteCustomerSelect.dataset.autofillBound) {
    quoteCustomerSelect.addEventListener("change", () => {
      autofillPickupFromCustomer(quoteCustomerSelect.value, true);
      syncCarrierControls();
    });
    quoteCustomerSelect.dataset.autofillBound = "true";
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
  state.pendingBooking = null;
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

  openModal(isCustomerUser() ? "Quote Details" : `Quote ${quote.carrierQuoteId}`, quoteDetailsHtml(quote));
}

function reenterQuote(quoteId) {
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  closeModal();
  state.currentQuote = null;
  state.pendingQuoteReentry = quote.id;
  setView("quote");
  window.requestAnimationFrame(() => {
    populateQuoteFormFromQuote(quote);
    clearQuoteFormErrors(document.getElementById("quoteForm"));
    state.pendingQuoteReentry = null;
    const results = document.getElementById("quoteResults");
    if (results) {
      results.classList.add("empty-state");
      results.textContent = "Submit a quote to see available rates.";
    }
    showToast("Quote details copied into New Quote.");
  });
}

function openBookingConfirmation(quoteId, rateId) {
  const quote = state.currentQuote || state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  const rate = Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === rateId) : null;
  if (!rate) {
    return;
  }

  state.pendingBooking = { quoteId, rateId };
  openModal("Confirm Shipment Booking", bookingConfirmationHtml(quote, rate));
}

function cancelPendingBooking() {
  state.pendingBooking = null;
  closeModal();
}

async function confirmPendingBooking() {
  const pending = state.pendingBooking;
  if (!pending) {
    return;
  }

  const quote = state.currentQuote || state.quotes.find((item) => item.id === pending.quoteId);
  if (!quote) {
    cancelPendingBooking();
    return;
  }

  const rate = Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === pending.rateId) : null;
  if (!rate) {
    cancelPendingBooking();
    return;
  }

  state.pendingBooking = null;
  closeModal();
  await finalizeBooking(quote.id, rate.id);
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
          Company phone
          <input name="companyPhone" type="tel" inputmode="numeric" autocomplete="tel" value="${escapeHtml(customer.companyPhone || "")}" placeholder="(555) 123-4567">
        </label>
        <label class="span-2">
          Company street
          <input name="companyStreet" value="${escapeHtml(customer.companyStreet || "")}" placeholder="123 Main St">
        </label>
        <label>
          Company city
          <input name="companyCity" value="${escapeHtml(customer.companyCity || "")}" placeholder="City">
        </label>
        <label>
          Company state
          <input name="companyState" value="${escapeHtml(customer.companyState || "")}" placeholder="CA" maxlength="2">
        </label>
        <label>
          Company ZIP
          <input name="companyZip" value="${escapeHtml(customer.companyZip || "")}" placeholder="ZIP">
        </label>
        <label>
          Open
          <select name="companyOpenTime" data-time-select>
            <option value="">Select time</option>
          </select>
        </label>
        <label>
          Close
          <select name="companyCloseTime" data-time-select>
            <option value="">Select time</option>
          </select>
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
  populateTimeSelects();
  const openTimeField = document.querySelector("#customerEditForm [name='companyOpenTime']");
  const closeTimeField = document.querySelector("#customerEditForm [name='companyCloseTime']");
  if (openTimeField) {
    openTimeField.value = customer.companyOpenTime || "";
  }
  if (closeTimeField) {
    closeTimeField.value = customer.companyCloseTime || "";
  }

  document.getElementById("customerEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/customers/${customer.id}`, {
      method: "PATCH",
      body: {
        companyName: form.get("companyName"),
        billingEmail: form.get("billingEmail"),
        paymentTerms: form.get("paymentTerms"),
        companyPhone: form.get("companyPhone"),
        companyOpenTime: form.get("companyOpenTime"),
        companyCloseTime: form.get("companyCloseTime"),
        companyStreet: form.get("companyStreet"),
        companyCity: form.get("companyCity"),
        companyState: form.get("companyState"),
        companyZip: form.get("companyZip"),
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
                  ${(customer.companyStreet || customer.companyCity || customer.companyState || customer.companyZip)
                    ? `<span class="pill">${escapeHtml([customer.companyStreet, customer.companyCity, customer.companyState, customer.companyZip].filter(Boolean).join(", "))}</span>`
                    : ""}
                  ${customer.companyPhone ? `<span class="pill">${escapeHtml(customer.companyPhone)}</span>` : ""}
                  ${customerHoursRange(customer) ? `<span class="pill">${escapeHtml(customerHoursRange(customer))}</span>` : ""}
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

function autofillPickupFromCustomer(customerId, force = false) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  const values = {
    pickupName: customer.companyName || "",
    pickupPhone: customer.companyPhone || "",
    pickupOpen: customer.companyOpenTime || "",
    pickupClose: customer.companyCloseTime || "",
    pickupStreet: customer.companyStreet || "",
    pickupCity: customer.companyCity || "",
    pickupState: customer.companyState || "",
    pickupZip: customer.companyZip || ""
  };

  if (!Object.values(values).some((value) => String(value || "").trim())) {
    return;
  }

  Object.entries(values).forEach(([name, value]) => {
    const input = document.querySelector(`[name='${name}']`);
    if (!input) {
      return;
    }
    if (force || !String(input.value || "").trim()) {
      input.value = value;
    }
  });
}

function customerHoursRange(customer) {
  if (!customer?.companyOpenTime && !customer?.companyCloseTime) {
    return "";
  }

  const openLabel = customer.companyOpenTime ? formatTimeHour(customer.companyOpenTime) : "Open";
  const closeLabel = customer.companyCloseTime ? formatTimeHour(customer.companyCloseTime) : "Close";
  return `${openLabel} - ${closeLabel}`;
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
  const carrierModes = quoteCarrierModesList(quote);
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(quote.customerName)}</strong>
        <small>${escapeHtml(carrierModeListLabel(carrierModes, false) || quote.carrier || "")} · ${escapeHtml(quote.status)}</small>
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
  const carrierLabel = shipmentCarrierLabel(shipment);
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(shipment.confirmationNumber)}</strong>
        <small>${escapeHtml(shipment.customerName)} · ${escapeHtml(shipment.pickup.address.city)}, ${escapeHtml(shipment.pickup.address.state)} to ${escapeHtml(shipment.delivery.address.city)}, ${escapeHtml(shipment.delivery.address.state)}</small>
        <div class="meta-line">
          <span class="pill">${escapeHtml(shipment.status)}</span>
          <span class="pill">${escapeHtml(carrierLabel)}</span>
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

function shipmentCarrierLabel(shipment) {
  return shipment?.carrierName || carrierDisplayName(shipment?.provider || shipment?.carrier || "", shipment?.carrier || "");
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
  const quoteCarrierModes = quoteCarrierModesList(quote);
  const rateCards = Array.isArray(quote.rates) && quote.rates.length
    ? quote.rates
        .map(
          (rate) => `
            <article class="rate-item compact-rate quote-rate-card">
              <div class="rate-main">
                <div class="rate-title-row">
                  <strong>${escapeHtml(carrierNameLabel(rate, quote, customerView))}</strong>
                  <span class="service-badge">${escapeHtml(formatRateService(rate?.service))}</span>
                  <span class="carrier-badge">${escapeHtml(carrierBadgeLabel(rate.provider, rate.carrierSource || quote.carrierMode, customerView))}</span>
                </div>
                <div class="rate-meta-row">
                  ${customerView ? "" : `<span class="pill">${escapeHtml(rate.carrierSource ? carrierModeSummaryLabel(rate.carrierSource, false) : "Carrier")}</span>`}
                  ${customerView ? "" : `<span class="pill">${escapeHtml(rate.providerScac || "No SCAC")}</span>`}
                  ${customerView ? "" : `<span class="pill">Offer ${escapeHtml(rate.carrierQuoteId || rate.carrierRateId || rate.id || "")}</span>`}
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
            ${customerView ? `<span class="pill">Shipment quote</span>` : `<span class="pill">${escapeHtml(carrierModeListLabel(quoteCarrierModes, false))}</span>`}
            <span class="pill">${escapeHtml(quote.status)}</span>
            ${customerView ? "" : `<span class="pill">${escapeHtml(quote.carrierQuoteId)}</span>`}
          </div>
          ${carrierNotice}
          ${quoteCarrierModes.length ? `<p><strong>Carrier modes:</strong> ${escapeHtml(carrierModeListLabel(quoteCarrierModes, customerView))}</p>` : ""}
          <p><strong>Reference / PO:</strong> ${escapeHtml(quote.referenceNumber || "")}</p>
          ${customerView ? "" : `<p><strong>Tariff:</strong> ${escapeHtml(quote.tariffRule?.ruleType || "n/a")} ${quote.tariffRule?.ruleType === "fixed" ? `· ${money.format(Number(quote.tariffRule?.fixedAmount || 0))}` : `· ${Number(quote.tariffRule?.markupPercentage || 0)}%`}</p>`}
          <p><strong>Pickup:</strong> ${escapeHtml(quote.pickup?.name || "")}, ${escapeHtml(quote.pickup?.address?.street || "")}, ${escapeHtml(quote.pickup?.address?.city || "")}, ${escapeHtml(quote.pickup?.address?.state || "")}</p>
          <p><strong>Delivery:</strong> ${escapeHtml(quote.delivery?.name || "")}, ${escapeHtml(quote.delivery?.address?.street || "")}, ${escapeHtml(quote.delivery?.address?.city || "")}, ${escapeHtml(quote.delivery?.address?.state || "")}</p>
          <p><strong>Freight:</strong> ${escapeHtml(quote.freight?.[0]?.quantity || "")} ${escapeHtml(quote.freight?.[0]?.type || "")} · Class ${escapeHtml(quote.freight?.[0]?.freightClass || "")} · ${escapeHtml(quote.freight?.[0]?.weight || "")} lbs each${totalWeight ? ` (${escapeHtml(totalWeight)} lbs total)` : ""}${freightSize ? ` · ${escapeHtml(freightSize)} in` : ""}</p>
        `
      )} 
      ${detailSection("Rates", rateCards)}
      <div class="modal-actions">
        <button class="primary-action" type="button" data-reenter-quote="${escapeHtml(quote.id)}">Re-enter Quote</button>
      </div>
    </div>
  `;
}

function bookingConfirmationHtml(quote, rate) {
  const customerView = isCustomerUser();
  return `
    <div class="booking-confirmation">
      <div class="quote-status notice-state success-state">
        <strong>Confirm shipment booking</strong>
        <p>This will finalize the shipment with the carrier platform. Please confirm before continuing.</p>
      </div>
      <div class="confirmation-grid">
        <div>
          <small>Carrier</small>
          <strong>${escapeHtml(carrierNameLabel(rate, quote, customerView))}</strong>
        </div>
        <div>
          <small>Service</small>
          <strong>${escapeHtml(formatRateService(rate?.service))}</strong>
        </div>
        <div>
          <small>Reference / PO</small>
          <strong>${escapeHtml(quote.referenceNumber || "N/A")}</strong>
        </div>
        <div>
          <small>Lane</small>
          <strong>${escapeHtml([quote.pickup?.address?.zip, quote.delivery?.address?.zip].filter(Boolean).join(" → ") || "N/A")}</strong>
        </div>
        <div>
          <small>Cost</small>
          <strong>${money.format(rate.sellPrice)}</strong>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-action" data-cancel-booking>Cancel</button>
        <button type="button" class="primary-action" data-confirm-booking>Confirm Booking</button>
      </div>
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
            <span class="pill">${escapeHtml(shipmentCarrierLabel(shipment))}</span>
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
        <span class="pill">${escapeHtml(shipmentCarrierLabel(shipment))}</span>
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
                <small>${escapeHtml(document.type || "Document")} · ${escapeHtml(document.source || shipmentCarrierLabel(shipment) || "")}</small>
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
            <span class="pill">${escapeHtml(shipmentCarrierLabel(shipment))}</span>
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
  const knownNames = {
    xpo: "XPO Logistics",
    xpol: "XPO Logistics",
    saia: "SAIA Freight",
    olddominion: "Old Dominion Freight Line",
    odfl: "Old Dominion Freight Line",
    abf: "ABF Freight",
    abfs: "ABF Freight",
    roadrunner: "Roadrunner Freight",
    rdfs: "Roadrunner Freight",
    frontline: "Frontline Freight",
    fcsy: "Frontline Freight",
    tforce: "TForce Freight",
    tfin: "TForce Freight",
    stg: "STG Logistics",
    stglogistics: "STG Logistics"
  };
  if (knownNames[normalized]) {
    return knownNames[normalized];
  }
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

function carrierModeListLabel(modes, customerView = false) {
  const normalizedModes = Array.isArray(modes) ? modes.filter(Boolean) : normalizeAllowedCarrierModes(modes);
  if (normalizedModes.length === 0) {
    return "";
  }

  return normalizeAllowedCarrierModes(normalizedModes)
    .map((mode) => carrierModeSummaryLabel(mode, customerView))
    .join(", ");
}

function carrierModeSummaryLabel(mode, customerView = false) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (customerView) {
    if (normalized === "mothershipsandbox") {
      return "M";
    }
    if (normalized === "speedshipltl") {
      return "SS";
    }
    if (normalized === "demo") {
      return "D";
    }
  }

  switch (normalized) {
    case "mothershipsandbox":
      return "Mothership sandbox";
    case "speedshipltl":
      return "SpeedShip LTL";
    case "demo":
      return "Demo rates";
    default:
      return carrierDisplayName(mode);
  }
}

function quoteCarrierModesList(quote) {
  const directModes = Array.isArray(quote?.carrierModes)
    ? quote.carrierModes
        .map((mode) => String(mode || "").trim())
        .filter((mode) => ["mothershipSandbox", "speedshipLtl", "demo"].includes(mode))
    : [];
  if (directModes.length > 0) {
    return directModes;
  }

  const legacyMode = String(quote?.carrierMode || "").trim();
  if (!legacyMode || legacyMode === "multiCarrier" || !["mothershipSandbox", "speedshipLtl", "demo"].includes(legacyMode)) {
    return [];
  }

  return [legacyMode];
}

function normalizeAllowedCarrierModes(values) {
  const list = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[,\s]+/).filter(Boolean)
      : [];
  const normalized = [];

  for (const entry of list) {
    const mode = String(entry || "").trim();
    if (!mode) {
      continue;
    }
    if (!["mothershipSandbox", "speedshipLtl", "demo"].includes(mode)) {
      continue;
    }
    if (!normalized.includes(mode)) {
      normalized.push(mode);
    }
  }

  if (normalized.length === 0) {
    normalized.push("mothershipSandbox");
  }

  return normalized;
}

function carrierBadgeLabel(provider, carrierMode = "", customerView = false) {
  if (!customerView) {
    return carrierDisplayName(provider, carrierMode);
  }

  const normalized = String(provider || "").trim().toLowerCase();
  const mode = String(carrierMode || "").trim().toLowerCase();
  if (normalized.includes("speedship") || mode === "speedshipltl") {
    return "SS";
  }
  if (normalized.includes("mothership") || mode === "mothershipsandbox") {
    return "M";
  }
  if (!provider) {
    return "C";
  }

  return String(provider)
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function carrierNameLabel(rate, quote, customerView = false) {
  const explicitName = String(rate?.carrierName || "").trim();
  if (explicitName) {
    return explicitName;
  }

  return carrierDisplayName(rate?.provider || quote?.carrierMode || "", rate?.carrierSource || quote?.carrierMode || "");
}

function rateHeading(rate, quote, customerView = false) {
  return `${carrierNameLabel(rate, quote, customerView)} · ${formatRateService(rate?.service)}`;
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

  const controls = Array.from(form.querySelectorAll("input, select, textarea")).filter((control) => !control.disabled);
  const invalidControls = [];

  controls.forEach((control) => {
    const value = String(control.value || "").trim();

    if (control.name === "pickupPhone" || control.name === "deliveryPhone") {
      const normalized = normalizePhoneNumber(value);
      if (value && normalized.length !== 10) {
        control.setCustomValidity("Phone numbers must be 10 digits.");
      } else {
        control.setCustomValidity("");
      }
    } else {
      control.setCustomValidity("");
    }

    if (!control.checkValidity()) {
      invalidControls.push(control);
    }
  });

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
    const phoneInvalid = invalidControls.some((control) => control.name === "pickupPhone" || control.name === "deliveryPhone");
    error.textContent = phoneInvalid
      ? "Phone numbers must be 10 digits and the highlighted fields must be completed before getting rates."
      : "Please fill in the highlighted required fields before getting rates.";
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
  form.querySelectorAll("input, select, textarea").forEach((control) => {
    if (typeof control.setCustomValidity === "function") {
      control.setCustomValidity("");
    }
  });

  const error = document.getElementById("quoteFormError");
  if (error) {
    error.textContent = "";
  }
}

function syncCarrierControls() {
  const hint = document.getElementById("carrierModeHint");
  const quoteCustomerSelect = document.getElementById("quoteCustomerSelect");
  if (!hint || !quoteCustomerSelect) {
    return;
  }

  const customer = state.customers.find((item) => item.id === quoteCustomerSelect.value) || null;
  const allowedModes = normalizeAllowedCarrierModes(customer?.allowedCarrierModes || []);
  if (!customer) {
    hint.textContent = "Select a customer to see the carrier modes assigned by admin.";
    return;
  }

  const label = carrierModeListLabel(allowedModes, isCustomerUser());
  hint.textContent = isCustomerUser()
    ? `Your quote uses the carrier modes assigned to your account: ${label}.`
    : `Assigned carrier modes for ${customer.companyName}: ${label}.`;
}

function syncTariffCarrierModes(customerId) {
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const selectedModes = normalizeAllowedCarrierModes(customer?.allowedCarrierModes || []);
  document.querySelectorAll("#tariffForm input[name='allowedCarrierModes']").forEach((checkbox) => {
    checkbox.checked = selectedModes.includes(checkbox.value);
  });
}

function renderCustomerOptions() {
  const options = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.companyName)}</option>`)
    .join("");

  const tariffSelect = document.getElementById("tariffCustomerSelect");
  const quoteSelect = document.getElementById("quoteCustomerSelect");
  if (tariffSelect) {
    tariffSelect.innerHTML = options;
    syncTariffCarrierModes(tariffSelect.value || state.customers[0]?.id || "");
  }
  if (quoteSelect) {
    quoteSelect.innerHTML = options;
    if (isCustomerUser()) {
      quoteSelect.value = state.user?.customerId || state.customers[0]?.id || "";
    }
    if (quoteSelect.value && !state.pendingQuoteReentry) {
      autofillPickupFromCustomer(quoteSelect.value, true);
    }
  }
  syncCarrierControls();
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
      const allowedModes = Array.isArray(customer.allowedCarrierModes) ? customer.allowedCarrierModes : [];
      return `
        <article class="row-item" data-customer-id="${escapeHtml(customer.id)}">
          <div>
            <strong>${escapeHtml(customer.companyName)}</strong>
            <small>${escapeHtml(customer.billingEmail || "No billing email")} · ${escapeHtml(customer.paymentTerms)}</small>
            <div class="meta-line">
              ${(customer.companyStreet || customer.companyCity || customer.companyState || customer.companyZip)
                ? `<span class="pill">${escapeHtml([customer.companyStreet, customer.companyCity, customer.companyState, customer.companyZip].filter(Boolean).join(", "))}</span>`
                : ""}
              ${allowedModes.length > 0
                ? `<span class="pill">${escapeHtml(carrierModeListLabel(allowedModes, false))}</span>`
                : ""}
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
  const quoteCarrierModes = quoteCarrierModesList(quote);
  const carrierLabel = quoteCarrierModes.length > 1
    ? "Carriers"
    : carrierModeSummaryLabel(quoteCarrierModes[0], customerView);
  if (!Array.isArray(quote.rates) || quote.rates.length === 0) {
    const notice = quote.carrierMessage || "Carrier returned no rates for this lane.";
    list.innerHTML = `
      <div class="quote-status notice-state success-state">
        <strong>${escapeHtml(quoteCarrierModes.length > 1 ? "Carrier request completed" : `${carrierLabel} connection succeeded`)}</strong>
        <p>${escapeHtml(notice)}</p>
        <div class="meta-line">
          ${quoteCarrierModes.length
            ? quoteCarrierModes.map((mode) => `<span class="pill">${escapeHtml(carrierModeSummaryLabel(mode, customerView))}</span>`).join("")
            : ""}
        </div>
        ${customerView ? "" : (quote.carrierQuoteId ? `<span class="pill">${escapeHtml(quote.carrierQuoteId)}</span>` : "")}
      </div>
    `;
    return;
  }
  list.innerHTML = quote.rates
    .map((rate) => `
      <article class="rate-item quote-rate-card">
        <div class="rate-main">
          <div class="rate-title-row">
            <strong>${escapeHtml(carrierNameLabel(rate, quote, customerView))}</strong>
            <span class="service-badge">${escapeHtml(formatRateService(rate?.service))}</span>
            <span class="carrier-badge">${escapeHtml(carrierBadgeLabel(rate.provider, rate.carrierSource || quote.carrierMode, customerView))}</span>
          </div>
          <div class="rate-meta-row">
            ${customerView ? "" : `<span class="pill">${escapeHtml(rate.carrierSource ? carrierModeSummaryLabel(rate.carrierSource, false) : "Carrier")}</span>`}
            ${customerView ? "" : `<span class="pill">Quote ${escapeHtml(quote.carrierQuoteId)}</span>`}
            ${customerView ? "" : `<span class="pill">Rate ${escapeHtml(rate.carrierRateId || rate.id)}</span>`}
            ${customerView ? "" : `<span class="pill">${escapeHtml(rate.providerScac || "No SCAC")}</span>`}
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
    button.addEventListener("click", () => openBookingConfirmation(quote.id, button.dataset.bookRate));
  });
}

async function finalizeBooking(quoteId, rateId) {
  const quote = state.currentQuote || state.quotes.find((item) => item.id === quoteId);
  const rate = quote && Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === rateId) : null;
  const response = await api("/api/shipments", {
    method: "POST",
    body: {
      quoteId,
      rateId,
      bookWithCarrier: Boolean(rate?.carrierSource === "mothershipSandbox")
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
  const customerId = form.get("customerId");
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const pickupAccessorials = form.getAll("pickupAccessorials");
  const deliveryAccessorials = normalizeDeliveryAccessorials(form.getAll("deliveryAccessorials"));
  const pickupName = String(form.get("pickupName") || "").trim() || customer?.companyName || "";
  const pickupStreet = String(form.get("pickupStreet") || "").trim() || customer?.companyStreet || "";
  const pickupCity = String(form.get("pickupCity") || "").trim() || customer?.companyCity || "";
  const pickupState = String(form.get("pickupState") || "").trim() || customer?.companyState || "";
  const pickupZip = String(form.get("pickupZip") || "").trim() || customer?.companyZip || "";
  const pickupPhone = normalizePhoneNumber(String(form.get("pickupPhone") || "").trim() || customer?.companyPhone || "");
  const pickupOpen = String(form.get("pickupOpen") || "").trim() || customer?.companyOpenTime || "";
  const pickupClose = String(form.get("pickupClose") || "").trim() || customer?.companyCloseTime || "";
  const deliveryPhone = normalizePhoneNumber(String(form.get("deliveryPhone") || "").trim());
  return {
    customerId,
    referenceNumber: form.get("referenceNumber"),
    pickupReadyDate: {
      date: form.get("pickupDate"),
      time: form.get("pickupTime")
    },
    pickup: {
      name: pickupName,
      address: {
        street: pickupStreet,
        city: pickupCity,
        state: pickupState,
        zip: pickupZip
      },
      phoneNumber: pickupPhone,
      emails: form.get("pickupEmail") ? [form.get("pickupEmail")] : [],
      openTime: pickupOpen,
      closeTime: pickupClose,
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
      phoneNumber: deliveryPhone,
      emails: form.get("deliveryEmail") ? [form.get("deliveryEmail")] : [],
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

function populateQuoteFormFromQuote(quote) {
  const form = document.getElementById("quoteForm");
  if (!form || !quote) {
    return;
  }

  const setValue = (name, value) => {
    const control = form.querySelector(`[name='${name}']`);
    if (control) {
      control.value = value ?? "";
    }
  };

  const setCheckboxGroup = (name, values) => {
    const selected = new Set((Array.isArray(values) ? values : []).filter(Boolean));
    form.querySelectorAll(`input[name='${name}']`).forEach((input) => {
      input.checked = selected.has(input.value);
    });
  };

  setValue("customerId", quote.customerId || "");
  setValue("referenceNumber", "");
  setValue("pickupDate", "");
  setValue("pickupTime", "");

  setValue("pickupName", quote.pickup?.name || "");
  setValue("pickupStreet", quote.pickup?.address?.street || "");
  setValue("pickupCity", quote.pickup?.address?.city || "");
  setValue("pickupState", quote.pickup?.address?.state || "");
  setValue("pickupZip", quote.pickup?.address?.zip || "");
  setValue("pickupPhone", quote.pickup?.phoneNumber || "");
  setValue("pickupEmail", Array.isArray(quote.pickup?.emails) ? quote.pickup.emails[0] || "" : "");
  setValue("pickupOpen", quote.pickup?.openTime || "");
  setValue("pickupClose", quote.pickup?.closeTime || "");

  setValue("deliveryName", quote.delivery?.name || "");
  setValue("deliveryStreet", quote.delivery?.address?.street || "");
  setValue("deliveryCity", quote.delivery?.address?.city || "");
  setValue("deliveryState", quote.delivery?.address?.state || "");
  setValue("deliveryZip", quote.delivery?.address?.zip || "");
  setValue("deliveryPhone", quote.delivery?.phoneNumber || "");
  setValue("deliveryEmail", Array.isArray(quote.delivery?.emails) ? quote.delivery.emails[0] || "" : "");
  setValue("deliveryOpen", quote.delivery?.openTime || "");
  setValue("deliveryClose", quote.delivery?.closeTime || "");

  const freight = Array.isArray(quote.freight) ? quote.freight[0] || {} : {};
  setValue("quantity", freight.quantity ?? "");
  setValue("freightType", freight.type || "");
  setValue("weight", freight.weight ?? "");
  setValue("freightClass", freight.freightClass || "");
  setValue("length", freight.length ?? "");
  setValue("width", freight.width ?? "");
  setValue("height", freight.height ?? "");
  setValue("description", freight.description || "");

  setCheckboxGroup("pickupAccessorials", quote.pickup?.accessorials || []);
  setCheckboxGroup("deliveryAccessorials", quote.delivery?.accessorials || []);
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => {
    if (details.dataset.accessorialGroup === "delivery") {
      enforceDeliveryAccessorialDependencies(details);
    }
    syncAccessorialDropdown(details);
  });

  syncCarrierControls();
  clearQuoteFormErrors(form);
}

function normalizeDeliveryAccessorials(accessorials) {
  const normalized = Array.from(new Set(accessorials.filter(Boolean)));
  if (normalized.includes("residential") && !normalized.includes("scheduledDelivery")) {
    normalized.push("scheduledDelivery");
  }
  return normalized;
}

function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

function populateTimeSelects() {
  document.querySelectorAll("[data-time-select]").forEach((select) => {
    if (select.dataset.populated === "true") {
      return;
    }

    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select time";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    for (let hour = 0; hour < 24; hour += 1) {
      const value = `${String(hour).padStart(2, "0")}00`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = formatTimeHour(value);
      select.appendChild(option);
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
  return;
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
  if (value && typeof value === "object") {
    const minimum = Number(value.minimum);
    const maximum = Number(value.maximum);

    if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
      if (minimum === maximum) {
        return `${minimum} day${minimum === 1 ? "" : "s"}`;
      }
      return `${minimum}-${maximum} days`;
    }

    if (Number.isFinite(maximum)) {
      return `${maximum} day${maximum === 1 ? "" : "s"}`;
    }

    if (Number.isFinite(minimum)) {
      return `${minimum} day${minimum === 1 ? "" : "s"}`;
    }
  }

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
