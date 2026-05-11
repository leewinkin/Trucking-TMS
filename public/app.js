const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const state = {
  health: null,
  customers: [],
  tariffs: [],
  quotes: [],
  shipments: [],
  invoices: [],
  currentQuote: null,
  carrierModeTouched: false
};

const viewMeta = {
  dashboard: ["Dashboard", "Watch quote activity, shipment status, and invoice drafts."],
  customers: ["Customers", "Manage customer accounts and tariff rules."],
  quote: ["New Quote", "Create a shipment quote and apply customer-specific markup."],
  shipments: ["Shipments", "Review local bookings and carrier shipment references."],
  invoices: ["Invoices", "See draft invoices created from booked shipments."]
};

document.addEventListener("DOMContentLoaded", async () => {
  wireNavigation();
  wireForms();
  setDefaultPickupDate();
  await refreshAll();
});

function wireNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.getElementById("refreshButton").addEventListener("click", refreshAll);
}

function wireForms() {
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
        paymentTerms: form.get("paymentTerms")
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

  document.getElementById("quoteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
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
    renderCustomerOptions();
    renderCustomers();
    renderDashboard();
    renderShipments();
    renderInvoices();
    syncCarrierControls();

    if (!options.keepQuoteResults && !state.currentQuote) {
      document.getElementById("quoteResults").textContent = "Submit a quote to see available rates.";
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
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

  const [title, subtitle] = viewMeta[name] || viewMeta.dashboard;
  document.getElementById("viewTitle").textContent = title;
  document.getElementById("viewSubtitle").textContent = subtitle;
}

function renderHealth() {
  const dot = document.getElementById("statusDot");
  const healthText = document.getElementById("healthText");
  dot.classList.toggle("ready", Boolean(state.health?.ok));
  healthText.textContent = state.health?.mothershipConfigured
    ? "Server ready, Mothership configured"
    : "Server ready, demo mode";
}

function syncCarrierControls() {
  const carrierModeSelect = document.querySelector("[name='carrierMode']");
  const bookWithCarrier = document.querySelector("[name='bookWithCarrier']");
  const hint = document.getElementById("carrierModeHint");
  if (!carrierModeSelect || !bookWithCarrier) {
    return;
  }

  if (
    state.health?.mothershipConfigured &&
    !state.carrierModeTouched &&
    !state.currentQuote &&
    carrierModeSelect.value === "demo"
  ) {
    carrierModeSelect.value = "mothershipSandbox";
  }

  const sandboxEnabled = carrierModeSelect.value === "mothershipSandbox";
  bookWithCarrier.disabled = !sandboxEnabled;
  if (!sandboxEnabled) {
    bookWithCarrier.checked = false;
  }

  hint.textContent = sandboxEnabled
    ? "Mothership sandbox is selected. Checking booking will purchase the rate in sandbox after quote."
    : "Demo rates only create local test bookings.";
}

function renderCustomerOptions() {
  const options = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.companyName)}</option>`)
    .join("");

  document.getElementById("tariffCustomerSelect").innerHTML = options;
  document.getElementById("quoteCustomerSelect").innerHTML = options;
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
        <article class="row-item">
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
}

function renderQuoteResults(quote) {
  const list = document.getElementById("quoteResults");
  list.classList.remove("empty-state");
  list.innerHTML = quote.rates
    .map((rate) => `
      <article class="rate-item">
        <div>
          <div class="rate-title-row">
            <strong>${escapeHtml(rate.provider)} · ${escapeHtml(rate.service)}</strong>
            <span class="carrier-badge">${escapeHtml(rate.provider)}${rate.providerScac ? ` (${escapeHtml(rate.providerScac)})` : ""}</span>
          </div>
          <small>Carrier quote ${escapeHtml(quote.carrierQuoteId)} · Rate ${escapeHtml(rate.carrierRateId || rate.id)}</small>
          <div class="meta-line">
            <span class="pill">Cost ${money.format(rate.carrierCost)}</span>
            <span class="pill">Markup ${money.format(rate.markup)}</span>
          </div>
          ${Array.isArray(rate.warnings) && rate.warnings.length > 0 ? `
            <div class="meta-line">
              ${rate.warnings.map((warning) => `<span class="pill">${escapeHtml(warning)}</span>`).join("")}
            </div>
          ` : ""}
        </div>
        <div class="price-block">
          <strong>${money.format(rate.sellPrice)}</strong>
          <button class="secondary-action" type="button" data-book-rate="${escapeHtml(rate.id)}">Book Rate</button>
        </div>
      </article>
    `)
    .join("");

  list.querySelectorAll("[data-book-rate]").forEach((button) => {
    button.addEventListener("click", () => bookRate(quote.id, button.dataset.bookRate));
  });
}

async function bookRate(quoteId, rateId) {
  const bookWithCarrier = Boolean(document.querySelector("[name='bookWithCarrier']")?.checked);
  const response = await api("/api/shipments", {
    method: "POST",
    body: {
      quoteId,
      rateId,
      bookWithCarrier
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

function shipmentRow(shipment) {
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(shipment.confirmationNumber)}</strong>
        <small>${escapeHtml(shipment.customerName)} · ${escapeHtml(shipment.pickup.address.city)}, ${escapeHtml(shipment.pickup.address.state)} to ${escapeHtml(shipment.delivery.address.city)}, ${escapeHtml(shipment.delivery.address.state)}</small>
        <div class="meta-line">
          <span class="pill">${escapeHtml(shipment.status)}</span>
          <span class="pill">${escapeHtml(shipment.provider)}</span>
          <span class="pill">Sell ${money.format(shipment.sellPrice)}</span>
        </div>
      </div>
      <span>${formatDate(shipment.createdAt)}</span>
    </article>
  `;
}

function renderInvoices() {
  const list = document.getElementById("invoiceList");
  list.innerHTML = state.invoices.length
    ? state.invoices
        .map((invoice) => `
          <article class="row-item">
            <div>
              <strong>${escapeHtml(invoice.invoiceNumber)}</strong>
              <small>${escapeHtml(invoice.customerName)} · Shipment ${escapeHtml(invoice.shipmentId)}</small>
              <div class="meta-line">
                <span class="pill">${escapeHtml(invoice.status)}</span>
                <span class="pill">${formatDate(invoice.createdAt)}</span>
              </div>
            </div>
            <div class="price-block"><strong>${money.format(invoice.amount)}</strong></div>
          </article>
        `)
        .join("")
    : `<div class="empty-state">No invoices yet.</div>`;
}

function quotePayload(form) {
  return {
    customerId: form.get("customerId"),
    carrierMode: form.get("carrierMode"),
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
      accessorials: splitAccessorials(form.get("pickupAccessorials"))
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
      accessorials: splitAccessorials(form.get("deliveryAccessorials"))
    },
    freight: [
      {
        quantity: Number(form.get("quantity")),
        type: form.get("freightType"),
        weight: Number(form.get("weight")),
        length: Number(form.get("length")),
        width: Number(form.get("width")),
        height: Number(form.get("height")),
        description: form.get("description")
      }
    ]
  };
}

function splitAccessorials(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
