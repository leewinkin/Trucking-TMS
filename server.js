import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const dataFile = path.join(__dirname, ".local-db.json");
const publicDir = path.join(__dirname, "public");

await loadLocalEnv();

const mothershipBaseUrl =
  process.env.MOTHERSHIP_API_BASE_URL || "https://sandbox.api.mothership.com/beta";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    if (error instanceof PublicError) {
      sendJson(res, error.status, {
        error: error.code,
        message: error.message
      });
      return;
    }

    console.error(error);
    sendJson(res, 500, {
      error: "SERVER_ERROR",
      message: "Something went wrong in the local TMS server."
    });
  }
});

server.listen(port, () => {
  console.log(`Trucking TMS prototype running at http://localhost:${port}`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "Trucking TMS local prototype",
      mothershipConfigured: Boolean(process.env.MOTHERSHIP_API_TOKEN),
      mothershipBaseUrl
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/customers") {
    const db = await readDb();
    sendJson(res, 200, { customers: db.customers });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const input = await readJson(req);
    const db = await readDb();
    const customer = {
      id: createId("cust"),
      companyName: requiredString(input.companyName, "companyName"),
      billingEmail: String(input.billingEmail || "").trim(),
      paymentTerms: String(input.paymentTerms || "Net 15").trim(),
      status: "active",
      createdAt: new Date().toISOString()
    };

    db.customers.push(customer);
    db.tariffRules.push(defaultTariffRule(customer.id));
    await writeDb(db);
    sendJson(res, 201, { customer });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tariffs") {
    const db = await readDb();
    const customerId = url.searchParams.get("customerId");
    const tariffRules = customerId
      ? db.tariffRules.filter((rule) => rule.customerId === customerId)
      : db.tariffRules;
    sendJson(res, 200, { tariffRules });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tariffs") {
    const input = await readJson(req);
    const db = await readDb();
    const customer = db.customers.find((item) => item.id === input.customerId);

    if (!customer) {
      sendJson(res, 404, { error: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
      return;
    }

    db.tariffRules = db.tariffRules.filter((rule) => rule.customerId !== input.customerId);
    const tariffRule = {
      id: createId("tariff"),
      customerId: input.customerId,
      ruleType: ["fixed", "percentage", "hybrid"].includes(input.ruleType)
        ? input.ruleType
        : "percentage",
      fixedAmount: toMoney(input.fixedAmount),
      markupPercentage: toNumber(input.markupPercentage),
      minimumMargin: toMoney(input.minimumMargin),
      status: "active",
      createdAt: new Date().toISOString()
    };

    db.tariffRules.push(tariffRule);
    await writeDb(db);
    sendJson(res, 200, { tariffRule });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/quotes") {
    await createQuote(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/quotes") {
    const db = await readDb();
    sendJson(res, 200, { quotes: db.quotes.slice().reverse() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shipments") {
    await createShipment(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/shipments") {
    const db = await readDb();
    sendJson(res, 200, { shipments: db.shipments.slice().reverse() });
    return;
  }

  const shipmentMatch = url.pathname.match(/^\/api\/shipments\/([^/]+)$/);
  if (req.method === "GET" && shipmentMatch) {
    const db = await readDb();
    const shipment = db.shipments.find((item) => item.id === shipmentMatch[1]);
    if (!shipment) {
      sendJson(res, 404, { error: "SHIPMENT_NOT_FOUND", message: "Shipment was not found." });
      return;
    }
    sendJson(res, 200, { shipment });
    return;
  }

  const trackingMatch = url.pathname.match(/^\/api\/shipments\/([^/]+)\/tracking$/);
  if (req.method === "GET" && trackingMatch) {
    await getTracking(res, trackingMatch[1]);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/invoices") {
    const db = await readDb();
    sendJson(res, 200, { invoices: db.invoices.slice().reverse() });
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND", message: "Route not found." });
}

async function createQuote(req, res) {
  const input = await readJson(req);
  const db = await readDb();
  const customer = db.customers.find((item) => item.id === input.customerId);

  if (!customer) {
    sendJson(res, 404, { error: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    return;
  }

  const tariffRule =
    db.tariffRules.find((rule) => rule.customerId === customer.id && rule.status === "active") ||
    defaultTariffRule(customer.id);

  const carrierMode = input.carrierMode === "mothershipSandbox" ? "mothershipSandbox" : "demo";
  const mothershipRequest = buildMothershipQuoteRequest(input);
  let carrierQuote;

  if (carrierMode === "mothershipSandbox") {
    if (!process.env.MOTHERSHIP_API_TOKEN) {
      sendJson(res, 400, {
        error: "MOTHERSHIP_TOKEN_MISSING",
        message: "Add MOTHERSHIP_API_TOKEN to .env.local before using Mothership sandbox."
      });
      return;
    }

    carrierQuote = await requestMothershipQuote(mothershipRequest);
  } else {
    carrierQuote = createDemoCarrierQuote(mothershipRequest);
  }

  const normalizedRates = normalizeMothershipRates(carrierQuote).map((rate) => {
    const pricing = applyTariff(rate.carrierCost, tariffRule);
    return {
      ...rate,
      ...pricing
    };
  });

  if (normalizedRates.length === 0) {
    sendJson(res, 422, {
      error: "NO_RATES_FOUND",
      message: "No carrier rates were returned for this quote."
    });
    return;
  }

  const quote = {
    id: createId("quote"),
    customerId: customer.id,
    customerName: customer.companyName,
    carrierMode,
    carrier: carrierMode === "mothershipSandbox" ? "mothership" : "demo",
    carrierQuoteId: getCarrierQuoteId(carrierQuote),
    pickup: mothershipRequest.pickup,
    delivery: mothershipRequest.delivery,
    freight: mothershipRequest.freight,
    pickupReadyDate: mothershipRequest.pickupReadyDate,
    tariffRule,
    rates: normalizedRates,
    status: "quoted",
    rawCarrierResponse: carrierQuote,
    createdAt: new Date().toISOString()
  };

  db.quotes.push(quote);
  await writeDb(db);
  sendJson(res, 201, { quote });
}

async function createShipment(req, res) {
  const input = await readJson(req);
  const db = await readDb();
  const quote = db.quotes.find((item) => item.id === input.quoteId);

  if (!quote) {
    sendJson(res, 404, { error: "QUOTE_NOT_FOUND", message: "Quote was not found." });
    return;
  }

  const rate = quote.rates.find((item) => item.id === input.rateId);
  if (!rate) {
    sendJson(res, 404, { error: "RATE_NOT_FOUND", message: "Selected rate was not found." });
    return;
  }

  let carrierShipment = null;
  const shouldBookCarrier = Boolean(input.bookWithCarrier);

  if (shouldBookCarrier) {
    if (quote.carrierMode !== "mothershipSandbox") {
      sendJson(res, 400, {
        error: "CARRIER_BOOKING_UNAVAILABLE",
        message: "Carrier booking is only available for Mothership sandbox quotes."
      });
      return;
    }

    if (!process.env.MOTHERSHIP_API_TOKEN) {
      sendJson(res, 400, {
        error: "MOTHERSHIP_TOKEN_MISSING",
        message: "Add MOTHERSHIP_API_TOKEN to .env.local before booking with Mothership sandbox."
      });
      return;
    }

    carrierShipment = await requestMothershipShipment({
      quoteId: quote.carrierQuoteId,
      rateId: rate.carrierRateId || rate.id
    });
  }

  const shipment = {
    id: createId("ship"),
    customerId: quote.customerId,
    customerName: quote.customerName,
    quoteId: quote.id,
    carrier: quote.carrier,
    carrierShipmentId: getCarrierShipmentId(carrierShipment) || createId("demoShipment"),
    confirmationNumber: getCarrierShipmentId(carrierShipment) || `LOCAL-${Date.now()}`,
    pickup: quote.pickup,
    delivery: quote.delivery,
    freight: quote.freight,
    carrierCost: rate.carrierCost,
    sellPrice: rate.sellPrice,
    margin: rate.margin,
    provider: rate.provider,
    service: rate.service,
    status: shouldBookCarrier ? "booked_with_carrier" : "local_booking",
    pickupDate: quote.pickupReadyDate,
    carrierShipment,
    createdAt: new Date().toISOString()
  };

  const invoice = {
    id: createId("inv"),
    shipmentId: shipment.id,
    customerId: quote.customerId,
    customerName: quote.customerName,
    invoiceNumber: `INV-${String(db.invoices.length + 1).padStart(5, "0")}`,
    amount: rate.sellPrice,
    status: "draft",
    issuedAt: null,
    dueAt: null,
    createdAt: new Date().toISOString()
  };

  db.shipments.push(shipment);
  db.invoices.push(invoice);
  quote.status = "booked";
  await writeDb(db);
  sendJson(res, 201, { shipment, invoice });
}

async function getTracking(res, shipmentId) {
  const db = await readDb();
  const shipment = db.shipments.find((item) => item.id === shipmentId);

  if (!shipment) {
    sendJson(res, 404, { error: "SHIPMENT_NOT_FOUND", message: "Shipment was not found." });
    return;
  }

  if (
    shipment.status === "booked_with_carrier" &&
    shipment.carrier === "mothership" &&
    process.env.MOTHERSHIP_API_TOKEN
  ) {
    const tracking = await requestMothershipTracking(shipment.carrierShipmentId);
    sendJson(res, 200, {
      shipmentId: shipment.id,
      carrierShipmentId: shipment.carrierShipmentId,
      events: normalizeTrackingEvents(tracking)
    });
    return;
  }

  sendJson(res, 200, {
    shipmentId: shipment.id,
    carrierShipmentId: shipment.carrierShipmentId,
    events: [
      {
        status: shipment.status,
        eventTime: shipment.createdAt,
        location: `${shipment.pickup.address.city}, ${shipment.pickup.address.state}`,
        description: "Local prototype booking created."
      }
    ]
  });
}

function buildMothershipQuoteRequest(input) {
  return {
    pickup: normalizeStop(input.pickup, "pickup"),
    delivery: normalizeStop(input.delivery, "delivery"),
    pickupReadyDate: {
      date: requiredString(input.pickupReadyDate?.date, "pickupReadyDate.date"),
      time: requiredString(input.pickupReadyDate?.time, "pickupReadyDate.time")
    },
    freight: normalizeFreight(input.freight)
  };
}

function normalizeStop(stop, label) {
  return {
    name: requiredString(stop?.name, `${label}.name`),
    address: {
      street: requiredString(stop?.address?.street, `${label}.address.street`),
      city: requiredString(stop?.address?.city, `${label}.address.city`),
      state: requiredString(stop?.address?.state, `${label}.address.state`).toUpperCase(),
      zip: requiredString(stop?.address?.zip, `${label}.address.zip`)
    },
    phoneNumber: requiredString(stop?.phoneNumber, `${label}.phoneNumber`),
    emails: Array.isArray(stop?.emails) ? stop.emails.filter(Boolean) : [],
    openTime: requiredString(stop?.openTime, `${label}.openTime`),
    closeTime: requiredString(stop?.closeTime, `${label}.closeTime`),
    accessorials: Array.isArray(stop?.accessorials) ? stop.accessorials.filter(Boolean) : []
  };
}

function normalizeFreight(freight) {
  if (!Array.isArray(freight) || freight.length === 0) {
    throw new PublicError(400, "INVALID_FREIGHT", "Add at least one freight line.");
  }

  return freight.map((item, index) => ({
    quantity: toPositiveNumber(item.quantity, `freight.${index}.quantity`),
    type: requiredString(item.type, `freight.${index}.type`),
    weight: toPositiveNumber(item.weight, `freight.${index}.weight`),
    length: toPositiveNumber(item.length, `freight.${index}.length`),
    width: toPositiveNumber(item.width, `freight.${index}.width`),
    height: toPositiveNumber(item.height, `freight.${index}.height`),
    description: requiredString(item.description, `freight.${index}.description`)
  }));
}

async function requestMothershipQuote(payload) {
  return requestMothership("/quotes", {
    method: "POST",
    body: payload
  });
}

async function requestMothershipShipment(payload) {
  return requestMothership("/shipments", {
    method: "POST",
    body: payload
  });
}

async function requestMothershipTracking(shipmentId) {
  return requestMothership(`/tracking/${encodeURIComponent(shipmentId)}`, {
    method: "GET"
  });
}

async function requestMothership(route, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(`${mothershipBaseUrl}${route}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${process.env.MOTHERSHIP_API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new PublicError(response.status, payload.type || "MOTHERSHIP_ERROR", payload.message || "Mothership request failed.");
    }

    return payload;
  } catch (error) {
    if (error instanceof PublicError) {
      throw error;
    }
    throw new PublicError(502, "MOTHERSHIP_UNAVAILABLE", "Could not reach Mothership sandbox.");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMothershipRates(payload) {
  const data = payload?.data || payload;
  const rates = data?.rates || data?.rateResults || data?.results || [];

  if (!Array.isArray(rates)) {
    return [];
  }

  return rates.map((rate, index) => ({
    id: String(rate.id || rate.rateId || `rate_${index + 1}`),
    carrierRateId: String(rate.id || rate.rateId || `rate_${index + 1}`),
    provider: String(rate.provider || rate.providerScac || "mothership"),
    service: Array.isArray(rate.services) && rate.services.length > 0 ? rate.services.join(", ") : "Standard",
    carrierCost: toMoney(rate.price || rate.total || rate.cost || 0),
    estimatedPickupDate: rate.estimatedPickupDate || null,
    estimatedDeliveryDate: rate.estimatedDeliveryDate || null,
    transitDays: rate.transitDays || null,
    warnings: Array.isArray(rate.warnings) ? rate.warnings : []
  }));
}

function normalizeTrackingEvents(payload) {
  const events = payload?.results || payload?.data?.trackingEvents || payload?.data || [];
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => ({
    status: event.status || event.type || "Updated",
    eventTime: event.eventTime || event.timestamp || event.createdAt || new Date().toISOString(),
    location: event.location || [event.city, event.state].filter(Boolean).join(", "),
    description: event.description || event.message || "Tracking event received."
  }));
}

function createDemoCarrierQuote(request) {
  const totalWeight = request.freight.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  const base = Math.max(95, totalWeight * 0.72);
  return {
    data: {
      id: createId("demoQuote"),
      rates: [
        {
          id: "DEMO_STD",
          provider: "mothership-demo",
          services: ["standard"],
          price: roundMoney(base + 42),
          estimatedPickupDate: `${request.pickupReadyDate.date}T${request.pickupReadyDate.time.slice(0, 2)}:${request.pickupReadyDate.time.slice(2)}:00.000Z`,
          estimatedDeliveryDate: null,
          transitDays: { minimum: 1, maximum: 2 },
          warnings: []
        },
        {
          id: "DEMO_FAST",
          provider: "mothership-demo",
          services: ["expedited"],
          price: roundMoney(base + 98),
          estimatedPickupDate: `${request.pickupReadyDate.date}T${request.pickupReadyDate.time.slice(0, 2)}:${request.pickupReadyDate.time.slice(2)}:00.000Z`,
          estimatedDeliveryDate: null,
          transitDays: { minimum: 0, maximum: 1 },
          warnings: []
        }
      ]
    }
  };
}

function applyTariff(carrierCost, tariffRule) {
  const fixedMarkup = toMoney(tariffRule.fixedAmount);
  const percentageMarkup = roundMoney(carrierCost * (toNumber(tariffRule.markupPercentage) / 100));
  let markup = percentageMarkup;

  if (tariffRule.ruleType === "fixed") {
    markup = fixedMarkup;
  }

  if (tariffRule.ruleType === "hybrid") {
    markup = Math.max(fixedMarkup, percentageMarkup);
  }

  markup = Math.max(markup, toMoney(tariffRule.minimumMargin));

  return {
    carrierCost: roundMoney(carrierCost),
    markup: roundMoney(markup),
    sellPrice: roundMoney(carrierCost + markup),
    margin: roundMoney(markup)
  };
}

function getCarrierQuoteId(payload) {
  const data = payload?.data || payload;
  return String(data?.id || data?.quoteId || createId("carrierQuote"));
}

function getCarrierShipmentId(payload) {
  const data = payload?.data || payload;
  return data?.id || data?.shipmentId || null;
}

async function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function readDb() {
  if (!existsSync(dataFile)) {
    const seed = createSeedDb();
    await writeDb(seed);
    return seed;
  }

  const raw = await readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  await writeFile(dataFile, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function createSeedDb() {
  const customerId = "cust_demo";
  return {
    customers: [
      {
        id: customerId,
        companyName: "Demo Customer",
        billingEmail: "billing@example.com",
        paymentTerms: "Net 15",
        status: "active",
        createdAt: new Date().toISOString()
      }
    ],
    tariffRules: [
      {
        ...defaultTariffRule(customerId),
        id: "tariff_demo"
      }
    ],
    quotes: [],
    shipments: [],
    invoices: []
  };
}

function defaultTariffRule(customerId) {
  return {
    id: createId("tariff"),
    customerId,
    ruleType: "percentage",
    fixedAmount: 50,
    markupPercentage: 15,
    minimumMargin: 75,
    status: "active",
    createdAt: new Date().toISOString()
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function requiredString(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    throw new PublicError(400, "VALIDATION_ERROR", `${field} is required.`);
  }
  return text;
}

function toPositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new PublicError(400, "VALIDATION_ERROR", `${field} must be greater than zero.`);
  }
  return number;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toMoney(value) {
  return roundMoney(toNumber(value));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

async function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

class PublicError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

process.on("uncaughtException", (error) => {
  if (error instanceof PublicError) {
    console.error(`${error.code}: ${error.message}`);
    return;
  }
  console.error(error);
});
