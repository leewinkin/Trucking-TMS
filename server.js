import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createAppStore } from "./store.js";
import { buildPublicUser } from "./server/auth/public-user.js";
import {
  applyActualCarrierNames,
  applyCarrierExclusions,
  customerRateAvailability,
  carrierIdentityCandidates,
  normalizePackagingType,
  packagingTypeForProvider,
  resolveActualCarrierName
} from "./server/quote-reliability.js";
import {
  isMothershipPickupReadyBeforeOpenFailure,
  mothershipPickupReadyBeforeOpenMessage,
  pickupTimeErrorCodes,
  validatePickupReadyWindow
} from "./public/quote-time-validation.js";

const __dirname = process.cwd();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");
const sessionCookieName = "tms_session";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
let appSecret = "local-dev-secret";
const isNodeRuntime = typeof process !== "undefined" && Boolean(process.versions?.node);

if (isNodeRuntime) {
  await loadLocalEnv();
}
appSecret = process.env.APP_SECRET || appSecret;

const store = await createAppStore({
  dbUrl: process.env.FORCE_LOCAL_JSON_STORE === "1" ? "" : process.env.DATABASE_URL,
  dataFile: process.env.DATA_FILE_PATH || ".local-db.json"
});

const mothershipBaseUrl =
  process.env.MOTHERSHIP_API_BASE_URL || "https://sandbox.api.mothership.com/beta";
const speedshipBaseUrl = process.env.SPEEDSHIP_API_BASE_URL || "https://speedship.staging-wwex.com/svc";
const speedshipAuthUrl = process.env.SPEEDSHIP_API_AUTH_URL || "https://auth.staging-wwex.com/oauth/token";
const speedshipAudience = process.env.SPEEDSHIP_API_AUDIENCE || "staging-wwex-apig";
const speedshipClientId = process.env.SPEEDSHIP_API_CLIENT_ID || "";
const speedshipClientSecret = process.env.SPEEDSHIP_API_CLIENT_SECRET || "";
const speedshipDirectToken = process.env.SPEEDSHIP_API_TOKEN || "";
const speedshipApiKey = process.env.SPEEDSHIP_API_KEY || "";
let speedshipTokenCache = null;
const priority1BaseUrl = process.env.PRIORITY1_API_BASE_URL || "";
const priority1ApiKey = process.env.PRIORITY1_API_KEY || "";
const priority1QuotePath = process.env.PRIORITY1_API_QUOTE_PATH || "";
const priority1SuggestedClassPath = process.env.PRIORITY1_API_SUGGESTED_CLASS_PATH || "/v2/ltl/quotes/suggestedclass";
const fedexFreightBaseUrl = process.env.FEDEX_FREIGHT_BASE_URL || "https://apis-sandbox.fedex.com";
const fedexFreightAuthUrl = process.env.FEDEX_FREIGHT_AUTH_URL || `${fedexFreightBaseUrl.replace(/\/$/, "")}/oauth/token`;
const fedexFreightClientId = process.env.FEDEX_FREIGHT_CLIENT_ID || "";
const fedexFreightClientSecret = process.env.FEDEX_FREIGHT_CLIENT_SECRET || "";
const fedexFreightAccountNumber = process.env.FEDEX_FREIGHT_ACCOUNT_NUMBER || "";
let fedexFreightTokenCache = null;
const zipLookupCache = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = isNodeRuntime
  ? http.createServer(async (req, res) => {
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
    })
  : null;

if (server) {
  server.listen(port, () => {
    console.log(`Trucking TMS prototype running at http://localhost:${port}`);
  });
}

export default {
  async fetch(request) {
    return handleFetch(request);
  }
};

async function handleFetch(request) {
  const url = new URL(request.url);
  const req = wrapFetchRequest(request);
  const res = createResponseProxy();

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (error) {
    if (error instanceof PublicError) {
      sendJson(res, error.status, {
        error: error.code,
        message: error.message
      });
    } else {
      console.error(error);
      sendJson(res, 500, {
        error: "SERVER_ERROR",
        message: "Something went wrong in the local TMS server."
      });
    }
  }

  return res.toResponse();
}

function wrapFetchRequest(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    method: request.method,
    url: request.url,
    headers,
    async text() {
      return await request.text();
    },
    async json() {
      return await request.json();
    },
    async *[Symbol.asyncIterator]() {
      const body = await request.arrayBuffer();
      yield new Uint8Array(body);
    }
  };
}

function createResponseProxy() {
  const headers = new Headers();
  let status = 200;
  let body = "";

  return {
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      Object.entries(nextHeaders).forEach(([name, value]) => {
        this.setHeader(name, value);
      });
    },
    setHeader(name, value) {
      const key = String(name);
      if (key.toLowerCase() === "set-cookie") {
        const values = Array.isArray(value) ? value : [value];
        values.filter(Boolean).forEach((entry) => headers.append(key, String(entry)));
        return;
      }
      headers.set(key, String(value));
    },
    end(value = "") {
      body = value;
    },
    toResponse() {
      return new Response(body, { status, headers });
    }
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "Trucking TMS local prototype",
      dataStore: store.kind,
      mothershipConfigured: Boolean(process.env.MOTHERSHIP_API_TOKEN),
      speedshipConfigured: Boolean(speedshipDirectToken || (speedshipClientId && speedshipClientSecret)),
      priority1Configured: isPriority1Configured(),
      fedexFreightConfigured: isFedexFreightConfigured(),
      mothershipBaseUrl
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/zip-lookup") {
    await lookupZipCode(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    await login(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    await logout(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const currentUser = await requireCurrentUser(req, res, false);
    if (!currentUser) {
      sendJson(res, 401, { error: "UNAUTHENTICATED", message: "Please sign in." });
      return;
    }

    sendJson(res, 200, { user: await publicUserWithOrganizationContext(currentUser) });
    return;
  }

  const currentUser = await requireCurrentUser(req, res, true);
  if (!currentUser) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/internal-users") {
    requireInternalUserManager(currentUser);
    const users = await store.listInternalUsers({ requesterRole: currentUser.role });
    sendJson(res, 200, { users });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/internal-users") {
    requireInternalUserManager(currentUser);
    const input = await readJson(req);
    const role = normalizeInternalRole(input.role || "staff");
    assertCanCreateInternalRole(currentUser, role);
    const user = await createInternalUserWithPublicErrors({
      email: normalizeEmail(input.email),
      password: requiredString(input.password, "password"),
      role
    });
    sendJson(res, 201, { user });
    return;
  }

  const internalUserMatch = url.pathname.match(/^\/api\/internal-users\/([^/]+)$/);
  if (internalUserMatch && req.method === "PATCH") {
    requireInternalUserManager(currentUser);
    const targetId = internalUserMatch[1];
    const target = await requireManageableInternalTarget(currentUser, targetId);
    const input = await readJson(req);
    const update = {};
    if (Object.prototype.hasOwnProperty.call(input, "role")) {
      update.role = normalizeInternalRole(input.role);
    }
    if (Object.prototype.hasOwnProperty.call(input, "status")) {
      update.status = normalizeInternalStatus(input.status);
    }
    assertCanUpdateInternalUser(currentUser, target, update);
    const user = await updateInternalUserWithPublicErrors(targetId, update);
    if (!user) {
      sendJson(res, 404, { error: "INTERNAL_USER_NOT_FOUND", message: "Internal user was not found." });
      return;
    }
    sendJson(res, 200, { user });
    return;
  }

  const internalUserPasswordMatch = url.pathname.match(/^\/api\/internal-users\/([^/]+)\/reset-password$/);
  if (internalUserPasswordMatch && req.method === "POST") {
    requireInternalUserManager(currentUser);
    const targetId = internalUserPasswordMatch[1];
    const target = await requireManageableInternalTarget(currentUser, targetId);
    assertCanResetInternalUserPassword(currentUser, target);
    const input = await readJson(req);
    const user = await resetInternalUserPasswordWithPublicErrors(targetId, requiredString(input.password, "password"));
    if (!user) {
      sendJson(res, 404, { error: "INTERNAL_USER_NOT_FOUND", message: "Internal user was not found." });
      return;
    }
    sendJson(res, 200, { user });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/customers") {
    const customer = currentUser.role === "customer" ? await store.getCustomer(currentUser.customerId) : null;
    const customers = currentUser.role === "customer" ? (customer ? [customer] : []) : await store.listCustomers();
    sendJson(res, 200, { customers });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    requireStaff(currentUser);
    const input = await readJson(req);
    input.companyName = requiredString(input.companyName, "companyName");
    if (String(input.portalEmail || "").trim() && !String(input.portalPassword || "").trim()) {
      throw new PublicError(400, "VALIDATION_ERROR", "portalPassword is required when portalEmail is provided.");
    }
    const customer = await store.createCustomer(input);
    sendJson(res, 201, { customer });
    return;
  }

  const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && req.method === "PATCH") {
    requireStaff(currentUser);
    const input = await readJson(req);

    const inputKeys = Object.keys(input || {});
    if (inputKeys.length === 1 && Object.prototype.hasOwnProperty.call(input, "status")) {
      const customer = await store.setCustomerStatus(customerMatch[1], input.status);
      sendJson(res, 200, { customer });
      return;
    }

    const customer = await store.updateCustomer(customerMatch[1], input);
    sendJson(res, 200, { customer });
    return;
  }

  if (customerMatch && req.method === "DELETE") {
    requireStaff(currentUser);
    await store.deleteCustomer(customerMatch[1]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tariffs") {
    const customerId =
      currentUser.role === "customer" ? currentUser.customerId : url.searchParams.get("customerId");
    const tariffRules = await store.listTariffs(customerId);
    sendJson(res, 200, { tariffRules });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tariffs") {
    requireStaff(currentUser);
    const input = await readJson(req);
    const customer = await store.getCustomer(input.customerId);

    if (!customer) {
      sendJson(res, 404, { error: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
      return;
    }

    const tariffRule = await store.upsertTariff(input);
    sendJson(res, 200, { tariffRule });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/freight-class-suggestion") {
    await suggestFreightClass(req, res, currentUser);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/address-book") {
    const customerId = await addressBookCustomerIdForRequest(currentUser, url.searchParams.get("customerId"));
    const entries = await store.listAddressBookEntries({ customerId });
    sendJson(res, 200, { entries });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/address-book") {
    const input = await readJson(req);
    const customerId = await addressBookCustomerIdForRequest(currentUser, input.customerId);
    const customerOrganizationId = await store.getCustomerOrganizationId(customerId);
    const entry = await store.createAddressBookEntry({
      ...normalizeAddressBookInput(input),
      customerId,
      customerOrganizationId: customerOrganizationId || null,
      createdByUserId: currentUser.id
    });
    sendJson(res, 201, { entry });
    return;
  }

  const addressBookMatch = url.pathname.match(/^\/api\/address-book\/([^/]+)$/);
  if (addressBookMatch && req.method === "PATCH") {
    const existing = await store.getAddressBookEntry(addressBookMatch[1]);
    await requireAddressBookAccess(currentUser, existing);
    const input = await readJson(req);
    const entry = await store.updateAddressBookEntry(addressBookMatch[1], normalizeAddressBookInput(input));
    if (!entry) {
      sendJson(res, 404, { error: "ADDRESS_NOT_FOUND", message: "Saved address was not found." });
      return;
    }
    sendJson(res, 200, { entry });
    return;
  }

  if (addressBookMatch && req.method === "DELETE") {
    const existing = await store.getAddressBookEntry(addressBookMatch[1]);
    await requireAddressBookAccess(currentUser, existing);
    await store.deleteAddressBookEntry(addressBookMatch[1]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/carrier-preferences") {
    requireStaff(currentUser);
    const customerId = await addressBookCustomerIdForRequest(currentUser, url.searchParams.get("customerId"));
    const preferences = await store.listCarrierPreferences({ customerId });
    sendJson(res, 200, { preferences });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/carrier-preferences") {
    requireStaff(currentUser);
    const input = await readJson(req);
    const customerId = await addressBookCustomerIdForRequest(currentUser, input.customerId);
    const preference = await store.createCarrierPreference({
      customerId,
      carrierKey: requiredString(input.carrierKey || input.carrierName, "carrierKey"),
      carrierName: requiredString(input.carrierName || input.carrierKey, "carrierName"),
      preference: input.preference === "preferred" ? "preferred" : "blocked",
      reason: String(input.reason || "").trim() || null,
      createdByUserId: currentUser.id
    });
    sendJson(res, 201, { preference });
    return;
  }

  const carrierPreferenceMatch = url.pathname.match(/^\/api\/carrier-preferences\/([^/]+)$/);
  if (carrierPreferenceMatch && req.method === "DELETE") {
    requireStaff(currentUser);
    const customerId = await addressBookCustomerIdForRequest(currentUser, url.searchParams.get("customerId"));
    const preference = await store.getCarrierPreference(carrierPreferenceMatch[1]);
    if (!preference || preference.status !== "active") {
      sendJson(res, 404, { error: "CARRIER_PREFERENCE_NOT_FOUND", message: "Carrier preference was not found." });
      return;
    }
    if (preference.customerId !== customerId) {
      sendJson(res, 403, { error: "FORBIDDEN", message: "Carrier preference does not belong to this customer." });
      return;
    }
    await store.deleteCarrierPreference(preference.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/quotes") {
    await createQuote(req, res, currentUser);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/quotes") {
    const quotes = await store.listQuotes();
    const quoteCustomer = currentUser.role === "customer" ? await store.getCustomer(currentUser.customerId) : null;
    sendJson(
      res,
      200,
      {
        quotes: quotes
          .filter((quote) => currentUser.role !== "customer" || quote.customerId === currentUser.customerId)
          .map((quote) => quoteForUser(quote, currentUser, quoteCustomer))
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shipments") {
    await createShipment(req, res, currentUser);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/shipments") {
    const shipments = await store.listShipments();
    sendJson(
      res,
      200,
      {
        shipments:
          currentUser.role === "customer"
            ? shipments.filter((shipment) => shipment.customerId === currentUser.customerId)
            : shipments
      }
    );
    return;
  }

  const mothershipDocumentMatch = url.pathname.match(/^\/api\/mothership\/documents\/([^/]+)$/);
  if (req.method === "GET" && mothershipDocumentMatch) {
    await getMothershipShipmentDocuments(res, mothershipDocumentMatch[1], currentUser);
    return;
  }

  const shipmentMatch = url.pathname.match(/^\/api\/shipments\/([^/]+)$/);
  if (req.method === "GET" && shipmentMatch) {
    const shipment = await store.getShipment(shipmentMatch[1]);
    if (!shipment) {
      sendJson(res, 404, { error: "SHIPMENT_NOT_FOUND", message: "Shipment was not found." });
      return;
    }
    if (currentUser.role === "customer" && shipment.customerId !== currentUser.customerId) {
      sendJson(res, 403, { error: "FORBIDDEN", message: "You can only view your own shipments." });
      return;
    }
    sendJson(res, 200, { shipment });
    return;
  }

  const trackingMatch = url.pathname.match(/^\/api\/shipments\/([^/]+)\/tracking$/);
  if (req.method === "GET" && trackingMatch) {
    await getTracking(res, trackingMatch[1], currentUser);
    return;
  }

  const documentsMatch = url.pathname.match(/^\/api\/shipments\/([^/]+)\/documents$/);
  if (req.method === "GET" && documentsMatch) {
    await getShipmentDocuments(res, documentsMatch[1], currentUser);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/invoices") {
    const invoices = await store.listInvoices();
    sendJson(
      res,
      200,
      {
        invoices:
          currentUser.role === "customer"
            ? invoices.filter((invoice) => invoice.customerId === currentUser.customerId)
            : invoices
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/invoices/sync") {
    requireStaff(currentUser);
    await syncMothershipInvoices(res);
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND", message: "Route not found." });
}

async function createQuote(req, res, currentUser) {
  const input = await readJson(req);
  const requestedCustomerId = currentUser.role === "customer" ? currentUser.customerId : input.customerId;
  const customer = await store.getCustomer(requestedCustomerId);

  if (!customer) {
    sendJson(res, 404, { error: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    return;
  }

  if (currentUser.role === "customer" && input.customerId && input.customerId !== currentUser.customerId) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "You can only quote for your own customer account." });
    return;
  }

  const tariffs = await store.listTariffs(customer.id);
  const carrierPreferences = await store.listCarrierPreferences({ customerId: customer.id });
  const tariffRule = tariffs.find((rule) => rule.status === "active") || defaultTariffRule(customer.id);
  const referenceNumber = requiredString(input.referenceNumber, "referenceNumber");
  const allowedCarrierModes = normalizeAllowedCarrierModes(customer.allowedCarrierModes);
  const organizationContext = await store.getOrganizationContextForUser(currentUser);
  validatePickupTimesForQuote(input);
  const mothershipRequest = buildMothershipQuoteRequest(input);
  const speedshipRequests = buildSpeedshipLtlQuoteRequests(input);
  const priority1Request = buildPriority1QuoteRequest(input);
  const canonicalFreight = normalizeFreight(input.freight);
    const carrierRuns = await Promise.all(
      allowedCarrierModes.map((mode) =>
        requestCarrierQuoteForMode(mode, input, mothershipRequest, speedshipRequests, priority1Request)
      )
    );
    const carrierAudit = carrierRuns.map((run) => ({
      mode: run.mode,
      carrier: run.carrier,
      carrierQuoteId: run.carrierQuoteId,
      carrierMessage: run.carrierMessage,
      quoteMetadata: run.quoteMetadata || null,
      rateCount: Array.isArray(run.rates) ? run.rates.length : 0,
      request: run.carrierRequest,
      response: run.rawCarrierResponse
    }));

    const carrierQuoteId = carrierRuns.map((run) => run.carrierQuoteId).filter(Boolean).join(" | ") || createId("carrierQuote");
    const carrierMessage = carrierRuns.map((run) => run.carrierMessage).filter(Boolean).join(" ").trim();
  const normalizedRates = carrierRuns
    .flatMap((run) =>
      (Array.isArray(run.rates) ? run.rates : []).map((rate) => ({
        ...rate,
        carrierSource: run.mode,
        carrierQuoteId: run.carrierQuoteId
      }))
    )
    .map((rate) => {
    const pricing = applyTariff(rate.carrierCost, tariffRule);
    return {
      ...rate,
      ...pricing
    };
    });
  const exclusionResult = applyCarrierExclusions(normalizedRates, carrierPreferences);
  const visibleRates = exclusionResult.allowedRates;
  const carrierNotice = visibleRates.length === 0
    ? exclusionResult.blockedRates.length > 0 && normalizedRates.length > 0
      ? "No rates are available based on your current carrier preferences."
      : carrierMessage || "Carrier returned no rates for this lane."
    : "";
  const rateAvailability = visibleRates.length === 0 && exclusionResult.blockedRates.length > 0 && normalizedRates.length > 0
    ? { status: "none", messageCode: "NO_RATES_AVAILABLE_BY_PREFERENCE" }
    : customerRateAvailability(carrierRuns, visibleRates);
  const carrierExclusionAudit = exclusionResult.blockedRates.map((blocked) => ({
    carrierName: blocked.carrierName,
    carrierKey: blocked.carrierKey,
    reason: blocked.reason
  }));

  if (visibleRates.length === 0) {
    const quote = {
      id: createId("quote"),
      customerId: customer.id,
      customerName: customer.companyName,
      carrierMode: "multiCarrier",
      carrierModes: allowedCarrierModes,
      carrier: "mixed",
      carrierQuoteId,
      referenceNumber,
      pickup: mothershipRequest.pickup,
      delivery: mothershipRequest.delivery,
      freight: canonicalFreight,
      pickupReadyDate: mothershipRequest.pickupReadyDate,
        tariffRule,
        rates: [],
        rateAvailability,
        status: "carrier_connected_no_rates",
        carrierMessage: carrierNotice,
        carrierAudit,
        carrierExclusionAudit,
        rawCarrierResponse: carrierRuns,
        customerOrganizationId: organizationContext?.customerOrganizationId || null,
        agentOrganizationId: organizationContext?.agentOrganizationId || null,
        createdByUserId: currentUser.id,
        createdByOrganizationId: organizationContext?.organizationId || null,
        createdAt: new Date().toISOString()
      };

    await store.createQuote(quote);
    sendJson(res, 201, { quote: quoteForUser(quote, currentUser, customer) });
    return;
  }

  const quote = {
    id: createId("quote"),
    customerId: customer.id,
    customerName: customer.companyName,
    carrierMode: "multiCarrier",
    carrierModes: allowedCarrierModes,
    carrier: "mixed",
    carrierQuoteId,
    referenceNumber,
    pickup: mothershipRequest.pickup,
    delivery: mothershipRequest.delivery,
    freight: canonicalFreight,
    pickupReadyDate: mothershipRequest.pickupReadyDate,
      tariffRule,
      rates: visibleRates,
      rateAvailability,
      status: "quoted",
      carrierMessage: carrierNotice,
      carrierAudit,
      carrierExclusionAudit,
      rawCarrierResponse: carrierRuns,
      customerOrganizationId: organizationContext?.customerOrganizationId || null,
      agentOrganizationId: organizationContext?.agentOrganizationId || null,
      createdByUserId: currentUser.id,
      createdByOrganizationId: organizationContext?.organizationId || null,
      createdAt: new Date().toISOString()
    };

  await store.createQuote(quote);
  sendJson(res, 201, { quote: quoteForUser(quote, currentUser, customer) });
}

async function createShipment(req, res, currentUser) {
  const input = await readJson(req);
  const quote = await store.getQuote(input.quoteId);
  const organizationContext = await store.getOrganizationContextForUser(currentUser);

  if (!quote) {
    sendJson(res, 404, { error: "QUOTE_NOT_FOUND", message: "Quote was not found." });
    return;
  }

  if (currentUser.role === "customer" && quote.customerId !== currentUser.customerId) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "You can only book your own quotes." });
    return;
  }

  const rate = quote.rates.find((item) => item.id === input.rateId);
  if (!rate) {
    sendJson(res, 404, { error: "RATE_NOT_FOUND", message: "Selected rate was not found." });
    return;
  }
  const bookingPreferences = await store.listCarrierPreferences({ customerId: quote.customerId });
  if (applyCarrierExclusions([rate], bookingPreferences).blockedRates.length > 0) {
    sendJson(res, 403, {
      error: "CARRIER_BLOCKED",
      message: "This carrier is not available for this customer."
    });
    return;
  }

  if (currentUser.role === "customer") {
    const bookingCustomer = await store.getCustomer(currentUser.customerId);
    if (!isCustomerAllowedToBookCarrier(bookingCustomer, rate.carrierSource || quote.carrierMode)) {
      sendJson(res, 403, {
        error: "BOOKING_DISABLED",
        message: "Shipment booking is disabled for this carrier mode on your account."
      });
      return;
    }
  }

  let carrierShipment = null;
  const shouldBookCarrier = Boolean(input.bookWithCarrier);

  if (shouldBookCarrier) {
    if (rate.carrierSource !== "mothershipSandbox") {
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

    const purchaseMetadata = findMothershipPurchaseMetadataFromQuote(quote, rate);
    const purchaseSummary = summarizeMothershipPurchaseMetadata(purchaseMetadata);
    if (purchaseSummary && purchaseSummary.purchasable === false) {
      console.log("Mothership quote blocked before booking", {
        quoteId: quote.id,
        carrierQuoteId: rate.carrierQuoteId || quote.carrierQuoteId,
        rateId: rate.carrierRateId || rate.id,
        metadata: purchaseMetadata
      });
      sendJson(res, 400, {
        error: "CARRIER_NOT_PURCHASABLE",
        message: purchaseSummary.message || "This quote is not purchasable yet."
      });
      return;
    }

    const carrierShipmentRequest = {
      quoteId: rate.carrierQuoteId || quote.carrierQuoteId,
      rateId: rate.carrierRateId || rate.id
    };
    console.log("Mothership shipment booking request", {
      quoteId: carrierShipmentRequest.quoteId,
      rateId: carrierShipmentRequest.rateId,
      quoteIdSource: rate.carrierQuoteId || quote.carrierQuoteId ? "carrier" : "local",
      rateIdSource: rate.carrierRateId || rate.id ? "carrier" : "local",
      baseUrl: mothershipBaseUrl
    });

    let carrierShipmentResponse;
    try {
      carrierShipmentResponse = await requestMothershipShipment(carrierShipmentRequest);
    } catch (error) {
      console.error("Mothership shipment booking failed", {
        quoteId: carrierShipmentRequest.quoteId,
        rateId: carrierShipmentRequest.rateId,
        status: error?.status,
        code: error?.code,
        message: error?.message,
        baseUrl: mothershipBaseUrl
      });
      throw error;
    }

    console.log("Mothership shipment booking response", {
      quoteId: carrierShipmentRequest.quoteId,
      rateId: carrierShipmentRequest.rateId,
      responseKeys: carrierShipmentResponse && typeof carrierShipmentResponse === "object" ? Object.keys(carrierShipmentResponse) : []
    });
    carrierShipment = {
      request: carrierShipmentRequest,
      response: carrierShipmentResponse,
      tmsReferenceNumber: quote.referenceNumber,
      referenceNote:
        "Mothership's published Create Shipment API currently documents quoteId and rateId only, so the TMS Reference / PO stays on the local shipment record."
    };
  }

  const shipment = {
    id: createId("ship"),
    customerId: quote.customerId,
    customerName: quote.customerName,
    quoteId: quote.id,
    carrier:
      rate.carrierSource === "speedshipLtl"
        ? "speedship"
        : rate.carrierSource === "mothershipSandbox"
          ? "mothership"
          : rate.carrierSource === "priority1Ltl"
            ? "priority1"
            : rate.carrierSource === "fedexFreight"
              ? "fedexFreight"
              : quote.carrier || "demo",
    carrierShipmentId: getCarrierShipmentId(carrierShipment) || createId("demoShipment"),
    carrierEntityId: getCarrierEntityId(carrierShipment) || null,
    confirmationNumber: getCarrierShipmentId(carrierShipment) || `LOCAL-${Date.now()}`,
    referenceNumber: quote.referenceNumber,
    pickup: quote.pickup,
    delivery: quote.delivery,
    freight: quote.freight,
    carrierCost: rate.carrierCost,
    sellPrice: rate.sellPrice,
    margin: rate.margin,
    provider: rate.provider,
    carrierName: rate.carrierName || null,
    service: rate.service,
    status: shouldBookCarrier ? "booked_with_carrier" : "local_booking",
    pickupDate: quote.pickupReadyDate,
    carrierShipment,
    customerOrganizationId: quote.customerOrganizationId || organizationContext?.customerOrganizationId || null,
    agentOrganizationId: quote.agentOrganizationId || organizationContext?.agentOrganizationId || null,
    createdByUserId: currentUser.id,
    createdByOrganizationId: organizationContext?.organizationId || null,
    createdAt: new Date().toISOString()
  };

  const invoice = {
    shipmentId: shipment.id,
    customerId: quote.customerId,
    customerName: quote.customerName,
    referenceNumber: quote.referenceNumber,
    amount: rate.sellPrice,
    status: "draft",
    issuedAt: null,
    dueAt: null,
    customerOrganizationId: quote.customerOrganizationId || organizationContext?.customerOrganizationId || null,
    agentOrganizationId: quote.agentOrganizationId || organizationContext?.agentOrganizationId || null,
    createdAt: new Date().toISOString()
  };

  const result = await store.createShipment({ quoteId: quote.id, shipment, invoice });
  sendJson(res, 201, result);
}

async function getTracking(res, shipmentId, currentUser) {
  const shipment = await store.getShipment(shipmentId);

  if (!shipment) {
    sendJson(res, 404, { error: "SHIPMENT_NOT_FOUND", message: "Shipment was not found." });
    return;
  }

  if (currentUser.role === "customer" && shipment.customerId !== currentUser.customerId) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "You can only view your own shipment tracking." });
    return;
  }

  if (
    shipment.status === "booked_with_carrier" &&
    shipment.carrier === "mothership" &&
    process.env.MOTHERSHIP_API_TOKEN
  ) {
    const tracking = await requestMothershipTracking(shipment.carrierShipmentId);
    const events = normalizeTrackingEvents(tracking);
    await store.replaceTrackingEvents(shipment.id, events, tracking);
    sendJson(res, 200, { shipmentId: shipment.id, carrierShipmentId: shipment.carrierShipmentId, events });
    return;
  }

  const storedEvents = await store.getTrackingEvents(shipment.id);
  if (storedEvents.length > 0) {
    sendJson(res, 200, {
      shipmentId: shipment.id,
      carrierShipmentId: shipment.carrierShipmentId,
      events: storedEvents
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

async function getShipmentDocuments(res, shipmentId, currentUser) {
  const shipment = await store.getShipment(shipmentId);

  if (!shipment) {
    sendJson(res, 404, { error: "SHIPMENT_NOT_FOUND", message: "Shipment was not found." });
    return;
  }

  if (currentUser.role === "customer" && shipment.customerId !== currentUser.customerId) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "You can only view your own shipment documents." });
    return;
  }

  const quote = await store.getQuote(shipment.quoteId);
  let carrierDocuments = null;

  if (shipment.status !== "booked_with_carrier") {
    sendJson(res, 200, {
      shipmentId: shipment.id,
      carrierShipmentId: shipment.carrierShipmentId,
      documents: [],
      message:
        shipment.carrier === "speedship"
          ? "SpeedShip BOL is only available after a carrier booking. This shipment was booked locally."
          : "Carrier documents are only available after a carrier booking."
    });
    return;
  }

  if (shipment.carrier === "mothership") {
    if (!process.env.MOTHERSHIP_API_TOKEN) {
      sendJson(res, 400, {
        error: "MOTHERSHIP_TOKEN_MISSING",
        message: "Add MOTHERSHIP_API_TOKEN to .env.local before downloading Mothership documents."
      });
      return;
    }

    carrierDocuments = await requestMothershipShipmentDocuments(shipment.carrierShipmentId);
  } else if (shipment.carrier === "speedship") {
    const productTransactionId = getSpeedshipProductTransactionId(shipment, quote);
    if (!productTransactionId) {
      sendJson(res, 400, {
        error: "SPEEDSHIP_DOCUMENT_REFERENCE_MISSING",
        message: "SpeedShip document download needs a product transaction ID."
      });
      return;
    }

    carrierDocuments = await requestSpeedshipShipmentDocuments(productTransactionId);
  } else {
    sendJson(res, 200, {
      shipmentId: shipment.id,
      carrierShipmentId: shipment.carrierShipmentId,
      documents: [],
      message: "This shipment was booked locally, so no carrier document is available."
    });
    return;
  }

  const documents = normalizeShipmentDocuments(carrierDocuments, shipment.carrier);
  sendJson(res, 200, {
    shipmentId: shipment.id,
    carrierShipmentId: shipment.carrierShipmentId,
    documents,
    message: documents.length > 0 ? null : "No carrier documents were returned for this shipment.",
    rawCarrierResponse: carrierDocuments
  });
}

async function getMothershipShipmentDocuments(res, entityId, currentUser) {
  requireStaff(currentUser);

  if (!process.env.MOTHERSHIP_API_TOKEN) {
    sendJson(res, 400, {
      error: "MOTHERSHIP_TOKEN_MISSING",
      message: "Add MOTHERSHIP_API_TOKEN to .env.local before downloading Mothership documents."
    });
    return;
  }

  const carrierDocuments = await requestMothershipShipmentDocuments(entityId);
  const documents = normalizeShipmentDocuments(carrierDocuments, "mothership");
  sendJson(res, 200, {
    entityId,
    shipmentId: entityId,
    documents,
    message: documents.length > 0 ? null : "No carrier documents were returned for this shipment.",
    rawCarrierResponse: carrierDocuments
  });
}

function buildMothershipQuoteRequest(input) {
  const referenceNumber = requiredString(input.referenceNumber, "referenceNumber");
  const pickup = {
    ...normalizeStop(input.pickup, "pickup"),
    referenceNumber
  };
  const delivery = {
    ...normalizeStop(input.delivery, "delivery"),
    referenceNumber
  };
  const freight = normalizeFreight(input.freight).map((item) => ({
    quantity: item.quantity,
    type: packagingTypeForProvider(item.type, "mothership"),
    weight: item.weight,
    length: item.length,
    width: item.width,
    height: item.height,
    description: item.description
  }));

  return {
    pickup,
    delivery,
    pickupReadyDate: {
      date: requiredString(input.pickupReadyDate?.date, "pickupReadyDate.date"),
      time: requiredString(input.pickupReadyDate?.time, "pickupReadyDate.time")
    },
    freight,
    rateResponseTimeoutMs: 25000,
    applyAvailableCredits: true
  };
}

function buildSpeedshipLtlQuoteRequests(input) {
  const freight = normalizeFreight(input.freight);
  const firstLine = freight[0] || {};
  return {
    shopFlow: buildSpeedshipShopFlowRequest(input, freight),
    estimateFlow: buildSpeedshipEstimateRequest(input, firstLine, freight)
  };
}

function buildSpeedshipShopFlowRequest(input, freight) {
  const pickup = normalizeStop(input.pickup, "pickup");
  const delivery = normalizeStop(input.delivery, "delivery");
  const pickupAccessorials = new Set(pickup.accessorials);
  const deliveryAccessorials = new Set(delivery.accessorials);
  const totalWeight = totalFreightWeight(freight);
  const shipmentDate = formatSpeedshipDateTime(input.pickupReadyDate);
  const handlingUnitList = freight.map((item) => {
    const itemWeight = toPositiveNumber(item.weight, "freight.weight");
    const itemQuantity = toPositiveNumber(item.quantity, "freight.quantity");
    const itemPieces = normalizePieceCount(item.pieces);
    const freightClass = String(item.freightClass || item.commodityClass || "50");
    return {
      billedDimension: {
        length: {
          value: String(item.length),
          unit: "IN"
        },
        width: {
          value: String(item.width),
          unit: "IN"
        },
        height: {
          value: String(item.height),
          unit: "IN"
        },
        dimensionType: "NET"
      },
      description: item.description,
      isCOD: false,
      isMixedClass: false,
      isStackable: Boolean(item.stackable),
      marksAndNumbers: null,
      packagingType: packagingTypeForProvider(item.type, "speedship"),
      quantity: itemQuantity,
      referenceList: [
        {
          type: "Reference 1",
          value: requiredString(input.referenceNumber, "referenceNumber"),
          isPrintAsBarCode: false
        }
      ],
      shippedItemList: [
        {
          commodityClass: freightClass,
          commodityDescription: item.description,
          commodityType: null,
          dimensions: {
            length: {
              value: String(item.length),
              unit: "IN"
            },
            width: {
              value: String(item.width),
              unit: "IN"
            },
            height: {
              value: String(item.height),
              unit: "IN"
            },
            dimensionType: "NET"
          },
          hazMatItemInfo: null,
          isHazMat: Boolean(item.hazmat || pickupAccessorials.has("hazmat") || deliveryAccessorials.has("hazmat")),
          name: item.description,
          NMFCDescription: item.nmfc || null,
          NMFCNbr: item.nmfc || null,
          packagingType: packagingTypeForProvider(item.type, "speedship"),
          quantity: itemPieces,
          weight: {
            value: String(itemWeight),
            unit: "LB"
          }
        }
      ],
      sortAndSegregateFlag: false,
      weight: {
        value: String(itemWeight * itemQuantity),
        unit: "LB"
      }
    };
  });

  const flags = buildSpeedshipLtlFlags(pickupAccessorials, deliveryAccessorials);
  const specialInstructions = buildSpeedshipSpecialInstructions(pickupAccessorials, deliveryAccessorials, input.referenceNumber);

  return {
    correlationId: createId("speedshipQuote"),
    request: {
      productType: "LTL",
        shipment: {
        shipmentDate,
        originAddress: buildSpeedshipAddressStop(pickup, "SENDER"),
        destinationAddress: buildSpeedshipAddressStop(delivery, "RECEIVER"),
        handlingCharge: null,
        handlingUnitList,
        totalHandlingUnitCount: freight.reduce(
          (sum, item, index) => sum + toPositiveNumber(item.quantity, `freight.${index}.quantity`),
          0
        ),
        totalWeight: {
          value: totalWeight,
          unit: "LB"
        },
        shipmentReferenceList: [
          {
            type: "Shipment Reference 1",
            value: requiredString(input.referenceNumber, "referenceNumber"),
            isPrintAsBarCode: false
          }
        ],
        shipmentForm: {
          allowPaperless: false,
          shipmentFormRequestDetails: []
        },
        pickupSpecialInstructions: specialInstructions.pickup,
        deliverySpecialInstructions: specialInstructions.delivery,
        handlingSpecialInstructions: specialInstructions.handling,
        skipAddressVerification: false,
        ...flags
      }
    }
  };
}

function buildSpeedshipEstimateRequest(input, firstLine, freight) {
  const totalWeight = totalFreightWeight(freight);
  return {
    correlationId: createId("speedshipQuote"),
    request: {
      originZipCode: requiredString(input.pickup?.address?.zip, "pickup.address.zip"),
      destinationZipCode: requiredString(input.delivery?.address?.zip, "delivery.address.zip"),
      productType: "LTL",
      commodityClass: requiredString(firstLine.freightClass || firstLine.commodityClass || "50", "freight.0.freightClass"),
      weight: {
        unit: "LB",
        value: totalWeight
      }
    }
  };
}

function buildSpeedshipAddressStop(stop, contactType) {
  return {
    stopSequence: null,
    address: {
      addressLineList: [stop.address.street],
      locality: stop.address.city,
      region: stop.address.state,
      postalCode: stop.address.zip,
      countryCode: "US",
      addressType: null,
      companyName: stop.name,
      longitude: null,
      latitude: null,
      phone: stop.phoneNumber,
      contactList: [
        {
          firstName: "",
          lastName: stop.name,
          phone: stop.phoneNumber,
          contactType,
          email: "",
          fax: null,
          website: null,
          extension: null
        }
      ],
      skipValidation: false
    }
  };
}

function buildSpeedshipLtlFlags(pickupAccessorials, deliveryAccessorials) {
  const hasPickup = (value) => pickupAccessorials.has(value);
  const hasDelivery = (value) => deliveryAccessorials.has(value);

  return {
    appointmentDeliveryFlag: hasDelivery("appointment"),
    directDeliveryOnlyFlag: false,
    holdAtTerminalFlag: false,
    insideDeliveryFlag: hasDelivery("inside"),
    insidePickupFlag: hasPickup("inside"),
    carrierTerminalPickupFlag: false,
    insuranceRequestFlag: false,
    liftgateDeliveryFlag: hasDelivery("liftgate"),
    liftgatePickupFlag: hasPickup("liftgate"),
    constructionSiteDeliveryFlag: false,
    constructionSitePickupFlag: false,
    notifyBeforeDeliveryFlag: false,
    protectionFromColdFlag: false,
    residentialDeliveryFlag: hasDelivery("residential"),
    residentialPickupFlag: hasPickup("residential"),
    sortAndSegregateFlag: hasPickup("sortAndSegregate") || hasDelivery("sortAndSegregate"),
    tradeshowDeliveryFlag: hasDelivery("tradeshow"),
    tradeshowDeliveryName: hasDelivery("tradeshow") ? "Tradeshow" : "",
    tradeshowPickupFlag: hasPickup("tradeshow"),
    tradeshowPickupName: hasPickup("tradeshow") ? "Tradeshow" : "",
    isGuaranteed: false,
    isSelfScheduled: false,
    isCOD: false,
    allowedCODPaymentMethodsList: [],
    returnDescription: "Return Package"
  };
}

function buildSpeedshipSpecialInstructions(pickupAccessorials, deliveryAccessorials, referenceNumber) {
  const pickup = [];
  const delivery = [];
  if (pickupAccessorials.has("limitedAccess")) {
    pickup.push("Limited access pickup");
  }
  if (pickupAccessorials.has("hazmat") || deliveryAccessorials.has("hazmat")) {
    pickup.push(`Hazmat reference ${referenceNumber}`);
  }
  if (deliveryAccessorials.has("limitedAccess")) {
    delivery.push("Limited access delivery");
  }
  if (deliveryAccessorials.has("tradeshow")) {
    delivery.push("Tradeshow delivery");
  }
  return {
    pickup: pickup.join("; "),
    delivery: delivery.join("; "),
    handling: [pickupAccessorials, deliveryAccessorials]
      .flatMap((set) => Array.from(set))
      .filter((value) => !["liftgate", "residential", "inside", "appointment", "tradeshow"].includes(value))
      .join("; ")
  };
}

function formatSpeedshipDateTime(pickupReadyDate) {
  const date = requiredString(pickupReadyDate?.date, "pickupReadyDate.date");
  const time = requiredString(pickupReadyDate?.time, "pickupReadyDate.time");
  return `${date} ${time.slice(0, 2)}:${time.slice(2)}:00`;
}

function normalizeStop(stop, label) {
  const phoneNumber = normalizePhoneNumber(stop?.phoneNumber, `${label}.phoneNumber`);
  return {
    name: requiredString(stop?.name, `${label}.name`),
    address: {
      street: requiredString(stop?.address?.street, `${label}.address.street`),
      city: requiredString(stop?.address?.city, `${label}.address.city`),
      state: requiredString(stop?.address?.state, `${label}.address.state`).toUpperCase(),
      zip: requiredString(stop?.address?.zip, `${label}.address.zip`)
    },
    phoneNumber,
    emails: Array.isArray(stop?.emails) ? stop.emails.filter(Boolean) : [],
    openTime: requiredString(stop?.openTime, `${label}.openTime`),
    closeTime: requiredString(stop?.closeTime, `${label}.closeTime`),
    accessorials: Array.isArray(stop?.accessorials) ? stop.accessorials.filter(Boolean) : []
  };
}

function validatePickupTimesForQuote(input) {
  const result = validatePickupReadyWindow({
    openTime: input?.pickup?.openTime,
    readyTime: input?.pickupReadyDate?.time,
    closeTime: input?.pickup?.closeTime
  });

  if (result.valid) {
    return;
  }

  switch (result.code) {
    case pickupTimeErrorCodes.invalidHours:
      throw new PublicError(400, result.code, "Pickup open time must be earlier than pickup close time.");
    case pickupTimeErrorCodes.readyBeforeOpen:
      throw new PublicError(400, result.code, "Pickup ready time must not be earlier than pickup opening time.");
    case pickupTimeErrorCodes.readyAfterClose:
      throw new PublicError(400, result.code, "Pickup ready time must be earlier than pickup close time.");
    default:
      throw new PublicError(400, "VALIDATION_ERROR", "Enter valid pickup times.");
  }
}

async function addressBookCustomerIdForRequest(currentUser, requestedCustomerId) {
  if (currentUser.role === "customer") {
    if (!currentUser.customerId) {
      throw new PublicError(403, "FORBIDDEN", "Your user is not linked to a customer account.");
    }
    return currentUser.customerId;
  }

  requireStaff(currentUser);
  const customerId = requiredString(requestedCustomerId, "customerId");
  const customer = await store.getCustomer(customerId);
  if (!customer) {
    throw new PublicError(404, "CUSTOMER_NOT_FOUND", "Customer was not found.");
  }
  return customer.id;
}

async function requireAddressBookAccess(currentUser, entry) {
  if (!entry || entry.status !== "active") {
    throw new PublicError(404, "ADDRESS_NOT_FOUND", "Saved address was not found.");
  }
  if (currentUser.role === "customer" && entry.customerId !== currentUser.customerId) {
    throw new PublicError(404, "ADDRESS_NOT_FOUND", "Saved address was not found.");
  }
  if (currentUser.role !== "customer") {
    requireStaff(currentUser);
  }
}

function normalizeAddressBookInput(input = {}) {
  return {
    label: String(input.label || input.nickname || "").trim(),
    usageType: ["pickup", "delivery", "both"].includes(input.usageType) ? input.usageType : "both",
    companyName: requiredString(input.companyName, "companyName"),
    contactName: String(input.contactName || "").trim() || null,
    street: requiredString(input.street, "street"),
    city: requiredString(input.city, "city"),
    state: requiredString(input.state, "state").toUpperCase(),
    zip: requiredString(input.zip, "zip"),
    country: String(input.country || "US").trim() || "US",
    phone: normalizePhoneNumber(String(input.phone || ""), "phone"),
    email: String(input.email || "").trim() || null,
    openTime: String(input.openTime || "").trim(),
    closeTime: String(input.closeTime || "").trim(),
    defaultAccessorials: Array.isArray(input.defaultAccessorials) ? input.defaultAccessorials.filter(Boolean) : [],
    isDefaultPickup: Boolean(input.isDefaultPickup),
    isDefaultDelivery: Boolean(input.isDefaultDelivery)
  };
}

function normalizeFreight(freight) {
  if (!Array.isArray(freight) || freight.length === 0) {
    throw new PublicError(400, "INVALID_FREIGHT", "Add at least one freight line.");
  }

  return freight.map((item, index) => {
    const typeField = `freight.${index}.type`;
    const type = normalizeFreightPackagingType(item.type, typeField);
    return {
      quantity: toPositiveNumber(item.quantity, `freight.${index}.quantity`),
      type,
      pieces: normalizePieceCount(item.pieces),
      weight: toPositiveNumber(item.weight, `freight.${index}.weight`),
      length: toPositiveNumber(item.length, `freight.${index}.length`),
      width: toPositiveNumber(item.width, `freight.${index}.width`),
      height: toPositiveNumber(item.height, `freight.${index}.height`),
      freightClass: requiredString(item.freightClass || item.commodityClass, `freight.${index}.freightClass`),
      nmfc: String(item.nmfc || item.nmfcCode || "").trim(),
      stackable: Boolean(item.stackable),
      hazmat: Boolean(item.hazmat),
      used: Boolean(item.used),
      machinery: Boolean(item.machinery),
      description: requiredString(item.description, `freight.${index}.description`)
    };
  });
}

function normalizeFreightPackagingType(value, fieldName) {
  try {
    return normalizePackagingType(requiredString(value, fieldName), fieldName);
  } catch (error) {
    if (error?.code === "INVALID_PACKAGING_TYPE") {
      throw new PublicError(400, error.code, error.message);
    }
    throw error;
  }
}

function normalizePieceCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function totalFreightWeight(freight) {
  if (!Array.isArray(freight) || freight.length === 0) {
    throw new PublicError(400, "INVALID_FREIGHT", "Add at least one freight line.");
  }

  return freight.reduce((sum, item, index) => sum + toPositiveNumber(item.weight, `freight.${index}.weight`) * toPositiveNumber(item.quantity, `freight.${index}.quantity`), 0);
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

function extractMothershipQuoteMetadata(payload) {
  const candidates = [
    payload?.data?.metadata,
    payload?.metadata,
    payload?.data?.quote?.metadata,
    payload?.quote?.metadata,
    payload?.data?.quoteMetadata
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function summarizeMothershipPurchaseMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const purchasable = Boolean(metadata.purchasable);
  const invalidFields = Array.isArray(metadata.invalidFieldsRequiredForPurchase)
    ? metadata.invalidFieldsRequiredForPurchase
        .map((item) => {
          const field = String(item?.field || "").trim();
          const errorMessage = String(item?.errorMessage || item?.message || "").trim();
          if (!field && !errorMessage) {
            return null;
          }
          return [field, errorMessage].filter(Boolean).join(": ");
        })
        .filter(Boolean)
    : [];
  const pickupSuggestedAccessorials = Array.isArray(metadata.pickupLocationSuggestedAccessorials)
    ? metadata.pickupLocationSuggestedAccessorials.filter(Boolean)
    : [];
  const deliverySuggestedAccessorials = Array.isArray(metadata.deliveryLocationSuggestedAccessorials)
    ? metadata.deliveryLocationSuggestedAccessorials.filter(Boolean)
    : [];

  const messageParts = [];
  if (!purchasable) {
    messageParts.push("This quote is not purchasable yet.");
  }
  if (invalidFields.length > 0) {
    messageParts.push(`Missing or invalid fields: ${invalidFields.join("; ")}`);
  }
  if (pickupSuggestedAccessorials.length > 0) {
    messageParts.push(`Pickup suggested accessorials: ${pickupSuggestedAccessorials.join(", ")}`);
  }
  if (deliverySuggestedAccessorials.length > 0) {
    messageParts.push(`Delivery suggested accessorials: ${deliverySuggestedAccessorials.join(", ")}`);
  }

  return {
    purchasable,
    invalidFields,
    pickupSuggestedAccessorials,
    deliverySuggestedAccessorials,
    message: messageParts.join(" ").trim()
  };
}

function findMothershipPurchaseMetadataFromQuote(quote, rate = null) {
  const directMetadata = rate?.purchaseMetadata || rate?.mothershipMetadata || null;
  if (directMetadata) {
    return directMetadata;
  }

  const runs = Array.isArray(quote?.rawCarrierResponse) ? quote.rawCarrierResponse : [];
  for (const run of runs) {
    const isMothershipRun =
      normalizeCarrierMode(run?.mode) === "mothershipSandbox" || String(run?.carrier || "").toLowerCase() === "mothership";
    if (!isMothershipRun) {
      continue;
    }

    const metadata = extractMothershipQuoteMetadata(run?.rawCarrierResponse || run?.response || run);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

async function requestSpeedshipLtlQuote(primaryPayload, fallbackPayload) {
  const token = await getSpeedshipAccessToken();
  try {
    const primaryQuote = await requestSpeedship("/shopFlow", {
      method: "POST",
      token,
      body: primaryPayload
    });

    if (!fallbackPayload || normalizeSpeedshipLtlRates(primaryQuote).length > 0) {
      return primaryQuote;
    }

    const fallbackQuote = await requestSpeedship("/estimateQuoteFlow", {
      method: "POST",
      token,
      body: fallbackPayload
    });

    return normalizeSpeedshipLtlRates(fallbackQuote).length > 0 ? fallbackQuote : primaryQuote;
  } catch (error) {
    if (!fallbackPayload) {
      throw error;
    }

    const fallbackQuote = await requestSpeedship("/estimateQuoteFlow", {
      method: "POST",
      token,
      body: fallbackPayload
    });
    return fallbackQuote;
  }
}

async function requestMothershipTracking(shipmentId) {
  return requestMothership(`/tracking/${encodeURIComponent(shipmentId)}`, {
    method: "GET"
  });
}

async function requestMothershipShipmentDetails(shipmentId) {
  return requestMothership(`/shipments/${encodeURIComponent(shipmentId)}`, {
    method: "GET"
  });
}

async function requestMothershipShipmentDocuments(entityId) {
  return requestMothership(`/documents/${encodeURIComponent(entityId)}`, {
    method: "GET"
  });
}

async function requestMothershipModifiedInvoices(modifiedSince, page = null) {
  const params = new URLSearchParams();
  params.set("timestamp", modifiedSince);
  params.set("limit", "100");
  if (page !== null && page !== undefined && page !== "") {
    params.set("page", String(page));
  }

  return requestMothership(`/invoices/modified_since?${params.toString()}`, {
    method: "GET"
  });
}

async function requestMothershipInvoice(invoiceId) {
  return requestMothership(`/invoices/${encodeURIComponent(invoiceId)}`, {
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

async function syncMothershipInvoices(res) {
  if (!process.env.MOTHERSHIP_API_TOKEN) {
    sendJson(res, 400, {
      error: "MOTHERSHIP_TOKEN_MISSING",
      message: "Add MOTHERSHIP_API_TOKEN to .env.local before syncing Mothership invoices."
    });
    return;
  }

  const modifiedSince = "2000-01-01T00:00:00.000Z";
  const syncedAt = nowIso();
  const referenceRecords = [];
  const hydratedInvoices = [];
  let page = null;
  let pagesVisited = 0;

  while (pagesVisited < 100) {
    const payload = await requestMothershipModifiedInvoices(modifiedSince, page);
    const records = extractMothershipInvoiceRecords(payload);
    referenceRecords.push(...records);

    pagesVisited += 1;
    const nextPage = readMothershipInvoiceNextPage(payload, page || 0, records.length);
    if (!nextPage || nextPage === page) {
      break;
    }
    page = nextPage;
  }

  const detailSummary = {
    hydrated: 0,
    failed: 0
  };
  const shipments = await store.listShipments();

  for (const chunk of chunkArray(referenceRecords, 5)) {
    const resolved = await Promise.all(
      chunk.map(async (referenceRecord) => {
        const invoiceId = readMothershipInvoiceId(referenceRecord);
        if (!invoiceId) {
          detailSummary.failed += 1;
          return normalizeMothershipInvoice(referenceRecord, null, syncedAt, null, resolveMothershipShipmentId(referenceRecord, null, shipments));
        }

        try {
          const detailPayload = await requestMothershipInvoice(invoiceId);
          detailSummary.hydrated += 1;
          const detailRecord = unwrapMothershipData(detailPayload);
          return normalizeMothershipInvoice(
            referenceRecord,
            detailRecord,
            syncedAt,
            detailPayload,
            resolveMothershipShipmentId(referenceRecord, detailRecord, shipments)
          );
        } catch (error) {
          detailSummary.failed += 1;
          return normalizeMothershipInvoice(
            referenceRecord,
            null,
            syncedAt,
            { error: error.message, reference: referenceRecord },
            resolveMothershipShipmentId(referenceRecord, null, shipments)
          );
        }
      })
    );

    hydratedInvoices.push(...resolved);
  }

  const summary = await store.upsertExternalInvoices(hydratedInvoices);
  sendJson(res, 200, {
    synced: summary,
    totalFetched: referenceRecords.length,
    hydrated: detailSummary.hydrated,
    detailFailed: detailSummary.failed,
    modifiedSince,
    syncedAt
  });
}

async function requestSpeedship(route, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(`${speedshipBaseUrl}${route}`, {
      method: options.method,
      headers: {
        Authorization: options.token.startsWith("Bearer ") ? options.token : `Bearer ${options.token}`,
        ...(speedshipApiKey ? { "x-api-key": speedshipApiKey } : {}),
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new PublicError(response.status, payload.type || "SPEEDSHIP_ERROR", payload.message || "SpeedShip request failed.");
    }

    return payload;
  } catch (error) {
    if (error instanceof PublicError) {
      throw error;
    }
    throw new PublicError(502, "SPEEDSHIP_UNAVAILABLE", "Could not reach SpeedShip sandbox.");
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSpeedshipShipmentDocuments(productTransactionId) {
  const token = await getSpeedshipAccessToken();
  return requestSpeedship("/documentDownloadFlow", {
    method: "POST",
    token,
    body: {
      request: {
        downloadMode: "MULTIPLE",
        docTypes: ["BILL_OF_LADING"],
        transactionType: "LTL",
        referenceMap: {
          PRODUCT_TRANSACTION_ID: productTransactionId
        }
      },
      correlationId: "WWEX-M2M-documentDownloadFlow"
    }
  });
}

async function getSpeedshipAccessToken() {
  if (speedshipDirectToken) {
    return speedshipDirectToken;
  }

  if (speedshipTokenCache && speedshipTokenCache.expiresAt - Date.now() > 60_000) {
    return speedshipTokenCache.token;
  }

  if (!speedshipClientId || !speedshipClientSecret) {
    throw new PublicError(400, "SPEEDSHIP_TOKEN_MISSING", "Add SpeedShip sandbox credentials to .env.local before using SpeedShip LTL.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: speedshipClientId,
    client_secret: speedshipClientSecret,
    audience: speedshipAudience
  });

  const response = await fetch(speedshipAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new PublicError(response.status, payload.error || "SPEEDSHIP_AUTH_ERROR", payload.error_description || payload.message || "SpeedShip auth failed.");
  }

  const token = String(payload.access_token || "");
  const expiresIn = Number(payload.expires_in || 3600);
  if (!token) {
    throw new PublicError(502, "SPEEDSHIP_AUTH_ERROR", "SpeedShip auth did not return an access token.");
  }

  speedshipTokenCache = {
    token,
    expiresAt: Date.now() + expiresIn * 1000
  };
  return token;
}

function normalizeMothershipRates(payload) {
  const data = payload?.data || payload;
  const metadata = extractMothershipQuoteMetadata(payload);
  const rates = data?.rates || data?.rateResults || data?.results || [];

  if (!Array.isArray(rates)) {
    return [];
  }

  return rates.map((rate, index) => ({
    id: String(rate.id || rate.rateId || `rate_${index + 1}`),
    carrierRateId: String(rate.id || rate.rateId || `rate_${index + 1}`),
    provider: String(rate.provider || rate.providerScac || "mothership"),
    providerScac: rate.providerScac || null,
    carrierName:
      rate.carrierName ||
      rate.vendorName ||
      rate.providerName ||
      rate.primaryVendor?.name ||
      rate.primaryVendor?.preferredName ||
      rate.carrier?.name ||
      rate.vendor?.name ||
      null,
    service: Array.isArray(rate.services) && rate.services.length > 0 ? rate.services.join(", ") : "Standard",
    carrierCost: toMoney(rate.price || rate.total || rate.cost || 0),
    estimatedPickupDate: rate.estimatedPickupDate || null,
    estimatedDeliveryDate: rate.estimatedDeliveryDate || null,
    transitDays: rate.transitDays || null,
    warnings: Array.isArray(rate.warnings) ? rate.warnings : [],
    purchaseMetadata: metadata
  }));
}

function normalizeSpeedshipLtlRates(payload) {
  const data = payload?.data || payload?.request?.data || payload || {};
  const response = payload?.response || data?.response || {};
  const candidates = [
    data.rates,
    data.rateResults,
    data.results,
    data.offers,
    data.offerList,
    data.shipmentOfferList,
    data.shipmentOffers,
    response.rates,
    response.rateResults,
    response.results,
    response.offers,
    response.offerList,
    response.shipmentOfferList,
    response.shipmentOffers
  ].find((value) => Array.isArray(value));

  const rates = candidates || (response.offerId || response.productTransactionId || data.shipmentOfferId || data.productTransactionId || data.offerId ? [response.offerId ? response : data] : []);
  if (!Array.isArray(rates) || rates.length === 0) {
    return [];
  }

  return rates.map((rate, index) => {
    const timeInTransit =
      rate.timeInTransit ||
      rate.shopRQShipment?.timeInTransit ||
      rate.offeredProductList?.[0]?.shopRQShipment?.timeInTransit ||
      rate.offeredProductList?.[0]?.timeInTransit ||
      rate.product?.shopRQShipment?.timeInTransit ||
      null;
    const carrierRateId = String(
      rate.offerId ||
        rate.shipmentOfferId ||
        rate.productTransactionId ||
        rate.id ||
        rate.rateId ||
        `speedship_${index + 1}`
    );
    const carrierCost = toMoney(
      readNestedNumber(rate, [
        ["totalOfferPrice", "value"],
        ["totalOfferCost", "value"],
        ["totalCharge", "value"],
        ["totalRate", "value"],
        ["totalAmount", "value"],
        ["price", "value"],
        ["price"],
        ["rate"],
        ["cost"],
        ["quotedRate", "value"],
        ["quotePrice", "value"]
      ])
    );
    return {
      id: carrierRateId,
      carrierRateId,
      provider: String(rate.vendorId || rate.carrierCode || rate.provider || "speedship"),
      providerScac:
        rate.vendorId ||
        rate.carrierCode ||
        timeInTransit?.scac ||
        rate.primaryVendor?.scac ||
        rate.offeredProductList?.[0]?.shopRQShipment?.timeInTransit?.scac ||
        null,
      carrierName:
        readNestedString(rate, [
          ["carrierName"],
          ["vendorName"],
          ["primaryVendor", "preferredName"],
          ["primaryVendor", "name"],
          ["timeInTransit", "carrierName"],
          ["timeInTransit", "vendorName"],
          ["shopRQShipment", "timeInTransit", "carrierName"],
          ["shopRQShipment", "timeInTransit", "vendorName"],
          ["offeredProductList", 0, "shopRQShipment", "timeInTransit", "carrierName"],
          ["offeredProductList", 0, "shopRQShipment", "timeInTransit", "vendorName"],
          ["carrierDescription"]
        ]) || null,
      service: String(
        rate.serviceName ||
          rate.serviceType ||
          rate.serviceLevel ||
          timeInTransit?.serviceLevel ||
          rate.shopRQShipment?.timeInTransit?.serviceLevel ||
          rate.offeredProductList?.[0]?.shopRQShipment?.timeInTransit?.serviceLevel ||
          rate.vendorName ||
          rate.mode ||
          rate.name ||
          "LTL"
      ),
      carrierCost,
      estimatedPickupDate: rate.estimatedPickupDate || rate.pickupDate || null,
      estimatedDeliveryDate:
        rate.estimatedDeliveryDate ||
        rate.deliveryDate ||
        timeInTransit?.estimatedDeliveryDate ||
        rate.shopRQShipment?.timeInTransit?.estimatedDeliveryDate ||
        rate.offeredProductList?.[0]?.shopRQShipment?.timeInTransit?.estimatedDeliveryDate ||
        null,
      transitDays:
        rate.transitDays ||
        rate.transitTime ||
        timeInTransit?.transitDays ||
        rate.shopRQShipment?.timeInTransit?.transitDays ||
        rate.offeredProductList?.[0]?.shopRQShipment?.timeInTransit?.transitDays ||
        null,
      warnings: Array.isArray(rate.warnings) ? rate.warnings : Array.isArray(rate.messages) ? rate.messages : []
    };
  });
}

function normalizeTrackingEvents(payload) {
  const candidates = [
    payload?.results,
    payload?.data?.trackingEvents,
    payload?.data?.events,
    payload?.data?.results,
    payload?.data,
    payload?.events
  ];
  const events = candidates.find((value) => Array.isArray(value));
  if (Array.isArray(events) && events.length > 0) {
    return events.map((event) => ({
      status:
        String(
          event.status ||
          event.type ||
          event.eventType ||
          event.name ||
          event.title ||
          "Updated"
        ).trim(),
      eventTime:
        event.eventTime ||
        event.timestamp ||
        event.createdAt ||
        event.occurredAt ||
        event.time ||
        new Date().toISOString(),
      location:
        event.location ||
        event.city ||
        [event.city, event.state].filter(Boolean).join(", ") ||
        [event.locationCity, event.locationState].filter(Boolean).join(", "),
      description:
        event.description ||
        event.message ||
        event.detail ||
        event.notes ||
        event.statusDescription ||
        "Tracking event received."
    }));
  }

  const data = payload?.data || payload || {};
  return [
    {
      status: String(data.status || data.type || "Updated").trim(),
      eventTime:
        data.eventTime ||
        data.timestamp ||
        data.createdAt ||
        data.updatedAt ||
        data.estimatedDeliveryDate ||
        data.earliestPickupDate ||
        new Date().toISOString(),
      location:
        data.location ||
        data.city ||
        (data.estimatedLocation && typeof data.estimatedLocation === "object"
          ? `${data.estimatedLocation.latitude}, ${data.estimatedLocation.longitude}`
          : ""),
      description:
        data.description ||
        data.message ||
        data.detail ||
        "Shipment details updated."
    }
  ];
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

  return {
    carrierCost: roundMoney(carrierCost),
    markup: roundMoney(markup),
    sellPrice: roundMoney(carrierCost + markup),
    margin: roundMoney(markup)
  };
}

function getCarrierQuoteId(payload) {
  const data = payload?.data || payload;
  return String(
    data?.id ||
      data?.quoteId ||
      data?.shipmentOfferId ||
      data?.productTransactionId ||
      data?.correlationId ||
      createId("carrierQuote")
  );
}

function getCarrierShipmentId(payload) {
  const data = payload?.response?.data || payload?.response || payload?.data || payload;
  return data?.id || data?.shipmentId || data?.productTransactionId || data?.shipmentOfferId || null;
}

function getCarrierEntityId(payload) {
  const data = payload?.response?.data || payload?.response || payload?.data || payload;
  return data?.entityID || data?.entityId || data?.entity_id || data?.shipment?.entityID || data?.shipment?.entityId || data?.shipment?.entity_id || null;
}

function getSpeedshipProductTransactionId(shipment, quote) {
  const candidates = [
    shipment?.carrierShipment?.response?.productTransactionId,
    shipment?.carrierShipment?.productTransactionId,
    shipment?.carrierShipmentId,
    quote?.rawCarrierResponse?.response?.productTransactionId,
    quote?.rawCarrierResponse?.productTransactionId,
    quote?.carrierQuoteId
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function normalizeCarrierMode(value) {
  if (value === "mothershipSandbox" || value === "speedshipLtl" || value === "priority1Ltl" || value === "fedexFreight") {
    return value;
  }
  return "demo";
}

function normalizeAllowedCarrierModes(values, fallback = ["mothershipSandbox"]) {
  const list = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[,\s]+/).filter(Boolean)
      : [];
  const normalized = [];

  for (const entry of list) {
    const mode = normalizeCarrierMode(entry);
    if ((mode === "mothershipSandbox" || mode === "speedshipLtl" || mode === "priority1Ltl" || mode === "fedexFreight" || mode === "demo") && !normalized.includes(mode)) {
      normalized.push(mode);
    }
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAllowedBookingCarrierModes(customer) {
  if (!customer || customer.allowedBooking === false) {
    return [];
  }

  const allowedModes = normalizeAllowedCarrierModes(customer.allowedCarrierModes || [], []);
  const bookingModes = normalizeAllowedCarrierModes(customer.allowedBookingCarrierModes || [], []);
  const fallbackModes = allowedModes.length > 0 ? allowedModes : ["mothershipSandbox"];
  const selectedModes = bookingModes.length > 0 ? bookingModes : fallbackModes;
  return selectedModes.filter((mode) => fallbackModes.includes(mode));
}

function isCustomerAllowedToBookCarrier(customer, carrierMode) {
  const mode = normalizeCarrierMode(carrierMode);
  return normalizeAllowedBookingCarrierModes(customer).includes(mode);
}

function carrierModeDisplayName(mode) {
  switch (normalizeCarrierMode(mode)) {
    case "mothershipSandbox":
      return "Mothership sandbox";
    case "speedshipLtl":
      return "SpeedShip LTL";
    case "priority1Ltl":
      return "Priority1 LTL";
    case "fedexFreight":
      return "FedEx Freight";
    case "demo":
    default:
      return "Demo rates";
  }
}

async function requestCarrierQuoteForMode(mode, input, mothershipRequest, speedshipRequests, priority1Request) {
  const normalizedMode = normalizeCarrierMode(mode);

  try {
    if (normalizedMode === "mothershipSandbox") {
      if (!process.env.MOTHERSHIP_API_TOKEN) {
        return {
          mode: normalizedMode,
          carrier: "mothership",
          carrierQuoteId: createId("mothershipQuote"),
          rates: [],
          carrierMessage: "Add MOTHERSHIP_API_TOKEN to .env.local before using Mothership sandbox.",
          carrierRequest: mothershipRequest,
          rawCarrierResponse: {}
        };
      }

      const carrierQuote = await requestMothershipQuote(mothershipRequest);
      const rates = applyActualCarrierNames(normalizeMothershipRates(carrierQuote), normalizedMode);
      const quoteMetadata = extractMothershipQuoteMetadata(carrierQuote);
      return {
        mode: normalizedMode,
        carrier: "mothership",
        carrierQuoteId: getCarrierQuoteId(carrierQuote),
        rates,
        carrierMessage: rates.length === 0 ? "Mothership sandbox returned no rates for this lane." : "",
        carrierRequest: mothershipRequest,
        rawCarrierResponse: carrierQuote,
        quoteMetadata
      };
    }

    if (normalizedMode === "speedshipLtl") {
      if (!isSpeedshipConfigured()) {
        return {
          mode: normalizedMode,
          carrier: "speedship",
          carrierQuoteId: createId("speedshipQuote"),
          rates: [],
          carrierMessage: "Add SpeedShip sandbox credentials to .env.local before using SpeedShip LTL.",
          carrierRequest: speedshipRequests,
          rawCarrierResponse: {}
        };
      }

      const carrierQuote = await requestSpeedshipLtlQuote(speedshipRequests.shopFlow, speedshipRequests.estimateFlow);
      const rates = applyActualCarrierNames(normalizeSpeedshipLtlRates(carrierQuote), normalizedMode);
      return {
        mode: normalizedMode,
        carrier: "speedship",
        carrierQuoteId: getCarrierQuoteId(carrierQuote),
        rates,
        carrierMessage: rates.length === 0 ? "SpeedShip sandbox connection succeeded, but this lane returned no matching rates." : "",
        carrierRequest: speedshipRequests,
        rawCarrierResponse: carrierQuote
      };
    }

    if (normalizedMode === "priority1Ltl") {
      if (!isPriority1Configured()) {
        return {
          mode: normalizedMode,
          carrier: "priority1",
          carrierQuoteId: createId("priority1Quote"),
          rates: [],
          carrierMessage: "Add PRIORITY1_API_BASE_URL and PRIORITY1_API_KEY to .env.local before using Priority1 LTL.",
          carrierRequest: priority1Request,
          rawCarrierResponse: {}
        };
      }

      const carrierQuote = await requestPriority1Quote(priority1Request);
      const rates = applyActualCarrierNames(normalizePriority1Rates(carrierQuote), normalizedMode);
      return {
        mode: normalizedMode,
        carrier: "priority1",
        carrierQuoteId: getPriority1QuoteId(carrierQuote),
        rates,
        carrierMessage: rates.length === 0 ? "Priority1 returned no rates for this lane." : "",
        carrierRequest: priority1Request,
        rawCarrierResponse: carrierQuote
      };
    }

    if (normalizedMode === "fedexFreight") {
      if (!isFedexFreightConfigured()) {
        return {
          mode: normalizedMode,
          carrier: "fedexFreight",
          carrierQuoteId: createId("fedexFreightQuote"),
          rates: [],
          carrierMessage: "Add FedEx Freight credentials to .env.local before using FedEx Freight.",
          carrierRequest: {},
          rawCarrierResponse: {}
        };
      }

      const fedexRequest = buildFedexFreightQuoteRequest(input);
      const carrierQuote = await requestFedexFreightQuote(fedexRequest);
      const rates = applyActualCarrierNames(normalizeFedexFreightRates(carrierQuote), normalizedMode);
      return {
        mode: normalizedMode,
        carrier: "fedexFreight",
        carrierQuoteId: getFedexFreightQuoteId(carrierQuote),
        rates,
        carrierMessage: rates.length === 0 ? "FedEx Freight returned no rates for this lane." : "",
        carrierRequest: fedexRequest,
        rawCarrierResponse: carrierQuote
      };
    }

    const carrierQuote = createDemoCarrierQuote(mothershipRequest);
    const rates = applyActualCarrierNames(normalizeMothershipRates(carrierQuote), normalizedMode);
    return {
      mode: normalizedMode,
      carrier: "demo",
      carrierQuoteId: getCarrierQuoteId(carrierQuote),
      rates,
      carrierMessage: "",
      carrierRequest: mothershipRequest,
      rawCarrierResponse: carrierQuote
    };
  } catch (error) {
    return {
      mode: normalizedMode,
      carrier:
        normalizedMode === "speedshipLtl"
          ? "speedship"
          : normalizedMode === "mothershipSandbox"
            ? "mothership"
            : normalizedMode === "priority1Ltl"
              ? "priority1"
              : normalizedMode === "fedexFreight"
                ? "fedexFreight"
              : "demo",
      carrierQuoteId: createId(`${normalizedMode}Quote`),
      rates: [],
      carrierMessage: readableCarrierFailureMessage(normalizedMode, error),
      carrierRequest:
        normalizedMode === "speedshipLtl"
          ? speedshipRequests
          : normalizedMode === "priority1Ltl"
            ? priority1Request
            : normalizedMode === "fedexFreight"
              ? buildFedexFreightQuoteRequest(mothershipRequest)
              : mothershipRequest,
      rawCarrierResponse: {
        error: error?.code || "CARRIER_REQUEST_FAILED",
        message: readableCarrierFailureMessage(normalizedMode, error)
      }
    };
  }
}

function readableCarrierFailureMessage(mode, error) {
  const message = String(error?.message || "").trim();
  if (
    normalizeCarrierMode(mode) === "mothershipSandbox" &&
    isMothershipPickupReadyBeforeOpenFailure(message)
  ) {
    return mothershipPickupReadyBeforeOpenMessage;
  }
  return message || "Carrier request failed.";
}

function isSpeedshipConfigured() {
  return Boolean(speedshipDirectToken || (speedshipClientId && speedshipClientSecret));
}

function isPriority1Configured() {
  return Boolean(priority1BaseUrl && priority1ApiKey);
}

function isFedexFreightConfigured() {
  return Boolean(fedexFreightClientId && fedexFreightClientSecret && fedexFreightAccountNumber);
}

async function suggestFreightClass(req, res, currentUser) {
  const input = await readJson(req);
  const customerId = currentUser.role === "customer" ? currentUser.customerId : String(input.customerId || "").trim();
  const customer = customerId ? await store.getCustomer(customerId) : null;

  if (customerId && !customer) {
    sendJson(res, 404, { error: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    return;
  }

  const quantity = toPositiveNumber(input.quantity, "quantity");
  const weight = toPositiveNumber(input.weight, "weight");
  const length = toPositiveNumber(input.length, "length");
  const width = toPositiveNumber(input.width, "width");
  const height = toPositiveNumber(input.height, "height");
  const totalWeight = quantity * weight;
  const allowedCarrierModes = normalizeAllowedCarrierModes(customer?.allowedCarrierModes || []);
  const canUsePriority1Suggestion = isPriority1Configured() && allowedCarrierModes.includes("priority1Ltl");

  if (canUsePriority1Suggestion) {
    try {
      const priority1Suggestion = await requestPriority1SuggestedClass({
        totalWeight,
        width,
        height,
        length,
        units: quantity
      });
      const suggestedClass = String(priority1Suggestion?.suggestedClass || priority1Suggestion?.data?.suggestedClass || "").trim();
      if (suggestedClass) {
        sendJson(res, 200, { suggestedClass, source: "priority1" });
        return;
      }
    } catch (error) {
      console.warn("Priority1 freight class suggestion fell back to local estimate:", error.message);
    }
  }

  const density = totalWeight / ((quantity * length * width * height) / 1728);
  const suggestedClass = suggestFreightClassByDensity(density);
  sendJson(res, 200, { suggestedClass, source: "local" });
}

async function lookupZipCode(req, res, url) {
  const zip = normalizeZipCode(url.searchParams.get("zip"));
  if (!zip) {
    sendJson(res, 400, { error: "VALIDATION_ERROR", message: "zip is required." });
    return;
  }

  const cached = zipLookupCache.get(zip);
  if (cached) {
    sendJson(res, 200, cached);
    return;
  }

  const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    sendJson(res, 404, { error: "ZIP_NOT_FOUND", message: "ZIP code was not found." });
    return;
  }

  const payload = await response.json();
  const place = Array.isArray(payload?.places) ? payload.places[0] : null;
  if (!place) {
    sendJson(res, 404, { error: "ZIP_NOT_FOUND", message: "ZIP code was not found." });
    return;
  }

  const data = {
    zip,
    city: String(place["place name"] || "").trim(),
    state: String(place["state abbreviation"] || "").trim(),
    country: String(payload["country abbreviation"] || "US").trim() || "US"
  };
  zipLookupCache.set(zip, data);
  sendJson(res, 200, data);
}

function buildPriority1QuoteRequest(input) {
  const freight = normalizeFreight(input.freight);
  const pickup = normalizeStop(input.pickup, "pickup");
  const delivery = normalizeStop(input.delivery, "delivery");
  const accessorialServices = buildPriority1AccessorialServices(pickup.accessorials, delivery.accessorials);
  const pickupDate = formatPriority1PickupDate(input.pickupReadyDate);

  return {
    originZipCode: requiredString(pickup.address.zip, "pickup.address.zip"),
    destinationZipCode: requiredString(delivery.address.zip, "delivery.address.zip"),
    originCity: pickup.address.city || null,
    originStateAbbreviation: pickup.address.state || null,
    originCountryCode: "US",
    destinationCity: delivery.address.city || null,
    destinationStateAbbreviation: delivery.address.state || null,
    destinationCountryCode: "US",
    pickupDate,
    items: freight.map((item, index) => ({
      freightClass: String(item.freightClass || item.commodityClass || "50"),
      packagingType: packagingTypeForProvider(item.type, "priority1"),
      units: toPositiveNumber(item.quantity, `freight.${index}.quantity`),
      pieces: normalizePieceCount(item.pieces),
      totalWeight: toPositiveNumber(item.weight, `freight.${index}.weight`) * toPositiveNumber(item.quantity, `freight.${index}.quantity`),
      length: toPositiveNumber(item.length, `freight.${index}.length`),
      width: toPositiveNumber(item.width, `freight.${index}.width`),
      height: toPositiveNumber(item.height, `freight.${index}.height`),
      isStackable: Boolean(item.stackable),
      isHazardous: Boolean(item.hazmat || pickup.accessorials.includes("hazmat") || delivery.accessorials.includes("hazmat")),
      isUsed: Boolean(item.used),
      isMachinery: Boolean(item.machinery),
      nmfcItemCode: item.nmfc || null,
      nmfcSubCode: null,
      description: String(item.description || "").trim() || null
    })),
    accessorialServices: accessorialServices.length > 0 ? accessorialServices : null,
    apiConfiguration: null
  };
}

function buildFedexFreightQuoteRequest(input) {
  const freight = normalizeFreight(input.freight);
  const pickup = normalizeStop(input.pickup, "pickup");
  const delivery = normalizeStop(input.delivery, "delivery");
  const totalHandlingUnits = freight.reduce(
    (sum, item, index) => sum + toPositiveNumber(item.quantity, `freight.${index}.quantity`),
    0
  );
  const shipDateStamp = requiredString(input.pickupReadyDate?.date, "pickupReadyDate.date");

  return {
    accountNumber: {
      value: requiredString(fedexFreightAccountNumber, "FEDEX_FREIGHT_ACCOUNT_NUMBER")
    },
    rateRequestControlParameters: {
      returnTransitTimes: true,
      servicesNeededOnRateFailure: true,
      rateSortOrder: "COMMITASCENDING"
    },
    freightRequestedShipment: {
      shipper: {
        address: buildFedexFreightAddress(pickup)
      },
      recipient: {
        address: buildFedexFreightAddress(delivery)
      },
      preferredCurrency: "USD",
      rateRequestType: ["ACCOUNT"],
      shipDateStamp,
      requestedPackageLineItems: freight.map((item, index) => {
        const quantity = toPositiveNumber(item.quantity, `freight.${index}.quantity`);
        const lineWeight = toPositiveNumber(item.weight, `freight.${index}.weight`) * quantity;
        return {
          subPackagingType: packagingTypeForProvider(item.type, "fedexFreight"),
          groupPackageCount: quantity,
          weight: {
            units: "LB",
            value: lineWeight
          },
          dimensions: {
            length: Math.round(toPositiveNumber(item.length, `freight.${index}.length`)),
            width: Math.round(toPositiveNumber(item.width, `freight.${index}.width`)),
            height: Math.round(toPositiveNumber(item.height, `freight.${index}.height`)),
            units: "IN"
          },
          associatedFreightLineItems: [
            {
              id: `line-${index + 1}`
            }
          ]
        };
      }),
      totalPackageCount: totalHandlingUnits,
      freightShipmentDetail: {
        role: "SHIPPER",
        accountNumber: {
          value: requiredString(fedexFreightAccountNumber, "FEDEX_FREIGHT_ACCOUNT_NUMBER")
        },
        fedExFreightBillingContactAndAddress: buildFedexFreightBillingContactAndAddress(pickup),
        lineItem: freight.map((item, index) => {
          const quantity = toPositiveNumber(item.quantity, `freight.${index}.quantity`);
          const lineWeight = toPositiveNumber(item.weight, `freight.${index}.weight`) * quantity;
          const totalPieces = quantity * normalizePieceCount(item.pieces);
          return {
            id: `line-${index + 1}`,
            description: requiredString(item.description, `freight.${index}.description`),
            freightClass: normalizeFedexFreightClass(item.freightClass || item.class || "50"),
            handlingUnits: quantity,
            pieces: totalPieces,
            subPackagingType: packagingTypeForProvider(item.type, "fedexFreight"),
            weight: {
              units: "LB",
              value: lineWeight
            },
            dimensions: {
              length: Math.round(toPositiveNumber(item.length, `freight.${index}.length`)),
              width: Math.round(toPositiveNumber(item.width, `freight.${index}.width`)),
              height: Math.round(toPositiveNumber(item.height, `freight.${index}.height`)),
              units: "IN"
            },
            purchaseOrderNumber: requiredString(input.referenceNumber, "referenceNumber"),
            nmfcCode: item.nmfc || undefined
          };
        }),
        totalHandlingUnits
      }
    }
  };
}

function buildFedexFreightAddress(stop) {
  return {
    streetLines: [stop.address.street].filter(Boolean),
    city: stop.address.city,
    stateOrProvinceCode: stop.address.state,
    postalCode: stop.address.zip,
    countryCode: "US",
    residential: false
  };
}

function buildFedexFreightBillingContactAndAddress(stop) {
  const phoneNumber = normalizePhoneNumber(stop.phoneNumber || "");
  const contact = {
    personName: stop.name,
    emailAddress: Array.isArray(stop.emails) ? stop.emails.find(Boolean) || "" : "",
    phoneNumber,
    companyName: stop.name
  };

  if (!contact.emailAddress) {
    delete contact.emailAddress;
  }
  if (!contact.phoneNumber) {
    delete contact.phoneNumber;
  }

  return {
    contact,
    address: {
      streetLines: [stop.address.street].filter(Boolean),
      city: stop.address.city,
      stateOrProvinceCode: stop.address.state,
      postalCode: stop.address.zip,
      countryCode: "US",
      residential: false
    }
  };
}

function normalizeFedexFreightPackagingType(value) {
  const text = String(value || "").trim().toLowerCase();
  const map = {
    pallet: "PALLET",
    skid: "SKID",
    carton: "CARTON",
    box: "BOX",
    crate: "CRATE",
    bundle: "BUNDLE",
    drum: "DRUM",
    bag: "BAG",
    package: "PACKAGE",
    pieces: "PIECES",
    unit: "UNIT",
    other: "OTHER"
  };

  if (map[text]) {
    return map[text];
  }

  return "PALLET";
}

function normalizeFedexFreightClass(value) {
  const text = String(value || "").trim().toLowerCase().replace(/class[_\s-]*/g, "").replace(/\./g, "_");
  const map = {
    "50": "CLASS_050",
    "050": "CLASS_050",
    "55": "CLASS_055",
    "055": "CLASS_055",
    "60": "CLASS_060",
    "060": "CLASS_060",
    "65": "CLASS_065",
    "065": "CLASS_065",
    "70": "CLASS_070",
    "070": "CLASS_070",
    "77.5": "CLASS_077_5",
    "77_5": "CLASS_077_5",
    "077_5": "CLASS_077_5",
    "85": "CLASS_085",
    "085": "CLASS_085",
    "92.5": "CLASS_092_5",
    "92_5": "CLASS_092_5",
    "092_5": "CLASS_092_5",
    "100": "CLASS_100",
    "110": "CLASS_110",
    "125": "CLASS_125",
    "150": "CLASS_150",
    "175": "CLASS_175",
    "200": "CLASS_200",
    "250": "CLASS_250",
    "300": "CLASS_300",
    "400": "CLASS_400",
    "500": "CLASS_500"
  };

  return map[text] || "CLASS_050";
}

async function requestFedexFreightQuote(payload) {
  const token = await getFedexFreightAccessToken();
  return requestFedexFreight("/rate/v1/freight/rates/quotes", {
    method: "POST",
    token,
    body: payload
  });
}

async function requestFedexFreight(route, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(`${fedexFreightBaseUrl.replace(/\/$/, "")}${route}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        "X-locale": "en_US",
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      const firstError = errors[0] || {};
      throw new PublicError(
        response.status,
        firstError.code || payload.error || "FEDEX_FREIGHT_ERROR",
        firstError.message || payload.message || "FedEx Freight request failed."
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof PublicError) {
      throw error;
    }
    throw new PublicError(502, "FEDEX_FREIGHT_UNAVAILABLE", "Could not reach FedEx Freight.");
  } finally {
    clearTimeout(timeout);
  }
}

async function getFedexFreightAccessToken() {
  if (fedexFreightTokenCache && fedexFreightTokenCache.expiresAt - Date.now() > 60_000) {
    return fedexFreightTokenCache.token;
  }

  if (!isFedexFreightConfigured()) {
    throw new PublicError(
      400,
      "FEDEX_FREIGHT_CONFIG_MISSING",
      "Add FEDEX_FREIGHT_CLIENT_ID, FEDEX_FREIGHT_CLIENT_SECRET, and FEDEX_FREIGHT_ACCOUNT_NUMBER to .env.local before using FedEx Freight."
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: fedexFreightClientId,
    client_secret: fedexFreightClientSecret
  });

  const response = await fetch(fedexFreightAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new PublicError(
      response.status,
      payload.error || "FEDEX_FREIGHT_AUTH_ERROR",
      payload.error_description || payload.message || "FedEx Freight auth failed."
    );
  }

  const token = String(payload.access_token || "");
  const expiresIn = Number(payload.expires_in || 3600);
  if (!token) {
    throw new PublicError(502, "FEDEX_FREIGHT_AUTH_ERROR", "FedEx Freight auth did not return an access token.");
  }

  fedexFreightTokenCache = {
    token,
    expiresAt: Date.now() + expiresIn * 1000
  };

  return token;
}

function normalizeFedexFreightRates(payload) {
  const data = payload?.output || payload?.data || payload || {};
  const rates = Array.isArray(data.rateReplyDetails)
    ? data.rateReplyDetails
    : Array.isArray(payload?.rateReplyDetails)
      ? payload.rateReplyDetails
      : [];

  if (!Array.isArray(rates) || rates.length === 0) {
    return [];
  }

  return rates.map((rate, index) => {
    const shipmentDetail = Array.isArray(rate.ratedShipmentDetails) ? rate.ratedShipmentDetails[0] || {} : rate.ratedShipmentDetails || {};
    const operationalDetail = rate.operationalDetail || {};
    const commit = rate.commit || {};
    const transitDays = normalizeFedexTransitDays(commit.transitDays, operationalDetail.transitTime);
    const estimatedDeliveryDate = operationalDetail.deliveryDate || operationalDetail.commitDate || commit.dateDetail?.dayFormat || null;
    const carrierCost = toMoney(
      shipmentDetail.totalNetFedExCharge ??
        shipmentDetail.totalNetCharge ??
        shipmentDetail.totalBaseCharge ??
        shipmentDetail.shipmentRateDetail?.totalNetCharge ??
        shipmentDetail.shipmentRateDetail?.totalBaseCharge ??
        0
    );

    return {
      id: String(shipmentDetail.quoteNumber || rate.serviceType || `fedex_${index + 1}`),
      carrierRateId: String(shipmentDetail.quoteNumber || rate.serviceType || `fedex_${index + 1}`),
      provider: "fedexFreight",
      providerScac: rate.serviceType || null,
      carrierName: "FedEx Freight",
      service: String(rate.serviceName || rate.serviceType || "FedEx Freight"),
      carrierCost,
      estimatedPickupDate: null,
      estimatedDeliveryDate,
      transitDays,
      warnings: Array.isArray(data.alerts)
        ? data.alerts.map((alert) => alert?.message).filter(Boolean)
        : []
    };
  });
}

function normalizeFedexTransitDays(transitDays, transitTime) {
  const description = String(transitDays?.description || "").trim();
  if (description) {
    const digits = Number(description.match(/\d+/)?.[0]);
    if (Number.isFinite(digits)) {
      return { minimum: digits, maximum: digits };
    }
    return description;
  }

  const code = String(transitDays?.minimumTransitTime || transitTime || "").trim().toUpperCase();
  const mapped = {
    ONE_DAY: 1,
    TWO_DAYS: 2,
    THREE_DAYS: 3,
    FOUR_DAYS: 4,
    FIVE_DAYS: 5,
    SIX_DAYS: 6,
    SEVEN_DAYS: 7
  };
  if (Object.prototype.hasOwnProperty.call(mapped, code)) {
    const value = mapped[code];
    return { minimum: value, maximum: value };
  }

  return code || "";
}

function getFedexFreightQuoteId(payload) {
  const data = payload?.output || payload?.data || payload || {};
  const firstRate = Array.isArray(data.rateReplyDetails) ? data.rateReplyDetails[0] : payload?.rateReplyDetails?.[0];
  const shipmentDetail = Array.isArray(firstRate?.ratedShipmentDetails) ? firstRate.ratedShipmentDetails[0] || {} : firstRate?.ratedShipmentDetails || {};
  return String(data.customerTransactionId || shipmentDetail.quoteNumber || createId("fedexFreightQuote"));
}

function buildPriority1AccessorialServices(pickupAccessorials, deliveryAccessorials) {
  const codes = new Set();
  const hasPickup = (value) => pickupAccessorials.includes(value);
  const hasDelivery = (value) => deliveryAccessorials.includes(value);

  if (hasPickup("appointment") || hasDelivery("appointment")) {
    codes.add("APPT");
  }
  if (hasPickup("liftgate")) {
    codes.add("LGPU");
  }
  if (hasDelivery("liftgate")) {
    codes.add("LGDEL");
  }
  if (hasPickup("residential")) {
    codes.add("RESPU");
  }
  if (hasDelivery("residential")) {
    codes.add("RESDEL");
  }
  if (hasPickup("inside")) {
    codes.add("INPU");
  }
  if (hasDelivery("inside")) {
    codes.add("INDEL");
  }
  if (hasPickup("limitedAccess")) {
    codes.add("LTDPU");
  }
  if (hasDelivery("limitedAccess")) {
    codes.add("LTDDEL");
  }
  if (hasPickup("tradeshow") || hasDelivery("tradeshow")) {
    codes.add("TRD");
  }
  return Array.from(codes).map((code) => ({ code }));
}

function formatPriority1PickupDate(pickupReadyDate) {
  const date = requiredString(pickupReadyDate?.date, "pickupReadyDate.date");
  const time = requiredString(pickupReadyDate?.time, "pickupReadyDate.time");
  return `${date}T${time.slice(0, 2)}:${time.slice(2)}:00`;
}

async function requestPriority1Quote(priority1Request) {
  const response = await fetch(`${priority1BaseUrl.replace(/\/$/, "")}${priority1QuotePath || "/v2/ltl/quotes/rates"}`, {
    method: "POST",
    headers: {
      "X-API-KEY": priority1ApiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(priority1Request)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new PublicError(response.status, payload.message || payload.title || "PRIORITY1_ERROR", payload.detail || payload.message || "Priority1 request failed.");
  }

  return payload;
}

async function requestPriority1SuggestedClass(priority1Request) {
  const response = await fetch(`${priority1BaseUrl.replace(/\/$/, "")}${priority1SuggestedClassPath || "/v2/ltl/quotes/suggestedclass"}`, {
    method: "POST",
    headers: {
      "X-API-KEY": priority1ApiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(priority1Request)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new PublicError(response.status, payload.message || payload.title || "PRIORITY1_ERROR", payload.detail || payload.message || "Priority1 request failed.");
  }

  return payload;
}

function normalizePriority1Rates(payload) {
  const data = payload?.rateQuotes || payload?.data?.rateQuotes || payload?.data || payload || {};
  const rates = Array.isArray(data.rateQuotes) ? data.rateQuotes : Array.isArray(payload?.rateQuotes) ? payload.rateQuotes : Array.isArray(payload?.data?.rateQuotes) ? payload.data.rateQuotes : [];
  if (!Array.isArray(rates) || rates.length === 0) {
    return [];
  }

  return rates.map((rate, index) => ({
    id: String(rate.id || rate.carrierQuoteNumber || `priority1_${index + 1}`),
    carrierRateId: String(rate.id || rate.carrierQuoteNumber || `priority1_${index + 1}`),
    provider: String(rate.carrierCode || rate.carrierName || "priority1"),
    providerScac: rate.carrierCode || null,
    carrierName: rate.carrierName || rate.carrierCode || null,
    service: String(rate.serviceLevelDescription || rate.serviceLevel || rate.mode || "LTL"),
    carrierCost: toMoney(rate?.rateQuoteDetail?.total || rate.total || 0),
    estimatedPickupDate: rate.effectiveDate || null,
    estimatedDeliveryDate: rate.deliveryDate || null,
    transitDays: rate.transitDays || null,
    warnings: []
  }));
}

function getPriority1QuoteId(payload) {
  return String(payload?.id || payload?.rateQuoteRequestDetail?.quoteId || payload?.rateQuotes?.[0]?.carrierQuoteNumber || createId("priority1Quote"));
}

function suggestFreightClassByDensity(density) {
  if (!Number.isFinite(density) || density <= 0) {
    return "";
  }

  const densityBands = [
    { min: 50, classValue: "50" },
    { min: 35, classValue: "55" },
    { min: 30, classValue: "60" },
    { min: 22.5, classValue: "65" },
    { min: 15, classValue: "70" },
    { min: 13.5, classValue: "77.5" },
    { min: 12, classValue: "85" },
    { min: 10.5, classValue: "92.5" },
    { min: 9, classValue: "100" },
    { min: 8, classValue: "110" },
    { min: 7, classValue: "125" },
    { min: 6, classValue: "150" },
    { min: 5, classValue: "175" },
    { min: 4, classValue: "200" },
    { min: 3, classValue: "250" },
    { min: 2, classValue: "300" },
    { min: 1, classValue: "400" },
    { min: 0, classValue: "500" }
  ];

  const matched = densityBands.find((band) => density >= band.min);
  return matched?.classValue || "";
}

function normalizeZipCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 5) {
    return "";
  }
  return digits.slice(0, 5);
}

function readNestedNumber(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      current = current?.[key];
    }
    if (current !== undefined && current !== null && current !== "") {
      const number = parseMoneyValue(current);
      if (Number.isFinite(number)) {
        return number;
      }
    }
  }
  return 0;
}

function parseMoneyValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return NaN;
    }

    const cleaned = text
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(([^)]+)\)/g, "-$1");
    const direct = Number(cleaned);
    if (Number.isFinite(direct)) {
      return direct;
    }

    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : NaN;
    }
  }

  if (value && typeof value === "object") {
    const nestedCandidates = [
      value.value,
      value.amount,
      value.total,
      value.totalAmount,
      value.total_amount,
      value.balanceDue,
      value.balance_due,
      value.invoiceTotal,
      value.invoice_total
    ];
    for (const candidate of nestedCandidates) {
      const parsed = parseMoneyValue(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return NaN;
}

function readNestedString(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      current = current?.[key];
    }
    if (current !== undefined && current !== null && current !== "") {
      const text = String(current).trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function unwrapMothershipData(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  return Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function readMothershipInvoiceId(record) {
  return readNestedString(record, [
    ["id"],
    ["invoiceId"],
    ["invoice_id"],
    ["invoice", "id"],
    ["reference", "id"]
  ]);
}

function extractMothershipInvoiceRecords(payload) {
  const candidates = [
    payload?.data?.invoices,
    payload?.data?.results,
    payload?.data?.items,
    payload?.data,
    payload?.invoices,
    payload?.results,
    payload?.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function readMothershipInvoiceNextPage(payload, currentPage, currentCount) {
  const directNext = readNestedString(payload, [
    ["data", "nextPage"],
    ["data", "next_page"],
    ["nextPage"],
    ["next_page"]
  ]);
  if (directNext) {
    const parsed = Number(directNext);
    if (Number.isFinite(parsed) && parsed > currentPage) {
      return parsed;
    }
  }

  const hasMore = readNestedString(payload, [
    ["data", "hasMore"],
    ["data", "has_more"],
    ["hasMore"],
    ["has_more"]
  ]);
  if (String(hasMore).toLowerCase() === "true") {
    return currentPage + 1;
  }

  const totalPages = readNestedNumber(payload, [
    ["data", "totalPages"],
    ["data", "total_pages"],
    ["pagination", "totalPages"],
    ["pagination", "total_pages"],
    ["totalPages"],
    ["total_pages"]
  ]);
  if (totalPages > currentPage) {
    return currentPage + 1;
  }

  return currentCount > 0 ? null : null;
}

function normalizeMothershipInvoice(referenceRecord, detailRecord, syncedAt, rawCarrierResponse = null, linkedShipmentId = null) {
  const externalInvoiceId = readMothershipInvoiceId(detailRecord || referenceRecord);
  const carrierEntityId =
    readNestedString(detailRecord || referenceRecord, [
      ["entityID"],
      ["entityId"],
      ["entity_id"],
      ["shipment", "entityID"],
      ["shipment", "entityId"],
      ["shipment", "entity_id"]
    ]) || null;
  const carrierShipmentId =
    readNestedString(detailRecord || referenceRecord, [
      ["shipmentId"],
      ["shipment_id"],
      ["carrierShipmentId"],
      ["carrier_shipment_id"],
      ["shipment", "id"],
      ["shipment", "shipmentId"],
      ["shipment", "carrierShipmentId"]
    ]) || null;
  const invoiceNumber =
    readNestedString(detailRecord || referenceRecord, [
      ["invoiceNumber"],
      ["invoice_number"],
      ["number"],
      ["invoiceNo"],
      ["displayNumber"],
      ["documentNumber"],
      ["invoice", "invoiceNumber"],
      ["invoice", "number"]
    ]) || (externalInvoiceId ? `MS-${externalInvoiceId.slice(-10)}` : `MS-${createId("invoice")}`);
  const shipmentId = linkedShipmentId || null;
  const customerName =
    readNestedString(detailRecord || referenceRecord, [
      ["customerName"],
      ["customer", "name"],
      ["accountName"],
      ["account", "name"],
      ["companyName"],
      ["shipper", "name"],
      ["billTo", "name"],
      ["shipperName"],
      ["account", "companyName"]
    ]) || "Imported from Mothership";
  const referenceNumber = readNestedString(detailRecord || referenceRecord, [
    ["referenceNumber"],
    ["purchaseOrderNumber"],
    ["poNumber"],
    ["po"],
    ["customerReference"],
    ["shipment", "referenceNumber"],
    ["reference", "number"]
  ]);
  const amount = deriveMothershipInvoiceAmount(detailRecord || referenceRecord);
  const status =
    normalizeImportedInvoiceStatus(
      readNestedString(detailRecord || referenceRecord, [
        ["status"],
        ["invoiceStatus"],
        ["paymentStatus"],
        ["state"]
      ])
    ) || "imported";
  const issuedAt = normalizeIsoTimestamp(
    readNestedString(detailRecord || referenceRecord, [
      ["issuedAt"],
      ["invoiceDate"],
      ["dateIssued"],
      ["createdAt"],
      ["created_at"]
    ])
  );
  const dueAt = normalizeIsoTimestamp(
    readNestedString(detailRecord || referenceRecord, [
      ["dueAt"],
      ["dueDate"],
      ["paymentDueDate"]
    ])
  );
  const createdAt =
    normalizeIsoTimestamp(
      readNestedString(detailRecord || referenceRecord, [
        ["createdAt"],
        ["created_at"],
        ["updatedAt"],
        ["updated_at"],
        ["invoiceDate"],
        ["issuedAt"]
      ])
    ) || syncedAt;

  return {
    shipmentId,
    customerId: null,
    customerName,
    invoiceNumber,
    referenceNumber,
    amount,
    status,
    issuedAt,
    dueAt,
    createdAt,
    source: "mothership",
    externalInvoiceId,
    carrierEntityId,
    carrierShipmentId,
    carrierName: "Mothership",
    rawCarrierResponse: rawCarrierResponse || detailRecord || referenceRecord,
    syncedAt
  };
}

function resolveMothershipShipmentId(referenceRecord, detailRecord, shipments) {
  const source = detailRecord || referenceRecord;
  if (!source || !Array.isArray(shipments) || shipments.length === 0) {
    return null;
  }

  const candidateValues = [
    ...extractMothershipShipmentIdentifiers(source),
    ...extractMothershipShipmentIdentifiers(referenceRecord),
    ...extractMothershipShipmentIdentifiers(detailRecord)
  ].filter(Boolean);

  for (const candidate of candidateValues) {
    const match = shipments.find((shipment) =>
      String(shipment.id || "").trim() === candidate ||
      String(shipment.carrierShipmentId || "").trim() === candidate ||
      String(shipment.confirmationNumber || "").trim() === candidate ||
      String(shipment.referenceNumber || "").trim() === candidate
    );
    if (match) {
      return match.id;
    }
  }

  return null;
}

function extractMothershipShipmentIdentifiers(source) {
  return [
    readNestedString(source, [["shipmentId"]]),
    readNestedString(source, [["shipment_id"]]),
    readNestedString(source, [["carrierShipmentId"]]),
    readNestedString(source, [["carrier_shipment_id"]]),
    readNestedString(source, [["confirmationNumber"]]),
    readNestedString(source, [["confirmation_number"]]),
    readNestedString(source, [["shipment", "id"]]),
    readNestedString(source, [["shipment", "shipmentId"]]),
    readNestedString(source, [["shipment", "carrierShipmentId"]]),
    readNestedString(source, [["shipment", "confirmationNumber"]]),
    readNestedString(source, [["referenceNumber"]]),
    readNestedString(source, [["reference_number"]]),
    readNestedString(source, [["shipment", "referenceNumber"]])
  ].filter(Boolean);
}

function deriveMothershipInvoiceAmount(source) {
  const directAmount = normalizeMothershipCurrencyAmount(readNestedNumber(source, [
    ["totalAmount"],
    ["total"],
    ["amount"],
    ["subtotal"],
    ["grandTotal"],
    ["grand_total"],
    ["invoiceAmount"],
    ["invoice_amount"],
    ["amountDue"],
    ["amount_due"],
    ["balanceDue"],
    ["balance_due"],
    ["invoiceTotal"],
    ["invoice_total"],
    ["totalDue"],
    ["total_due"],
    ["totalCharges"],
    ["total_charges"],
    ["charges", "total"],
    ["charges", "amount"],
    ["charges", "totalAmount"],
    ["charges", "total_amount"],
    ["pricing", "total"]
  ]));
  if (directAmount) {
    return directAmount;
  }

  const lineItems = extractMothershipInvoiceLineItems(source);
  if (!lineItems.length) {
    return directAmount;
  }

  const lineTotal = lineItems.reduce((sum, item) => {
    const value = normalizeMothershipCurrencyAmount(readNestedNumber(item, [
      ["amount"],
      ["amountDue"],
      ["amount_due"],
      ["chargeAmount"],
      ["charge_amount"],
      ["lineTotal"],
      ["line_total"],
      ["total"],
      ["totalAmount"],
      ["total_amount"],
      ["value"],
      ["price"],
      ["rate"],
      ["extendedAmount"],
      ["extended_amount"]
    ]));
    return sum + value;
  }, 0);

  return lineTotal || directAmount;
}

function normalizeMothershipCurrencyAmount(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (Number.isInteger(value) && Math.abs(value) >= 100) {
    return value / 100;
  }

  return value;
}

function extractMothershipInvoiceLineItems(source) {
  const candidates = [
    source?.lineItems,
    source?.line_items,
    source?.items,
    source?.charges,
    source?.adjustments,
    source?.data?.lineItems,
    source?.data?.items,
    source?.data?.charges,
    source?.invoice?.lineItems,
    source?.invoice?.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function normalizeImportedInvoiceStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  return text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "imported";
}

function normalizeIsoTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeShipmentDocuments(payload, source) {
  const documents = [];
  const seenUrls = new Set();

  const visit = (value, depth = 0) => {
    if (!value || depth > 5) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      if (typeof value === "string") {
        const url = value.trim();
        if (isLikelyUrl(url) && !seenUrls.has(url)) {
          seenUrls.add(url);
          documents.push({
            id: createId("doc"),
            type: source === "speedship" ? "BILL_OF_LADING" : "document",
            label: source === "speedship" ? "Bill of Lading" : "Document",
            url,
            source
          });
        }
      }
      return;
    }

    const url = readNestedString(value, [
      ["url"],
      ["downloadUrl"],
      ["documentUrl"],
      ["href"],
      ["link"],
      ["uri"],
      ["downloadLink"]
    ]);
    if (url && isLikelyUrl(url) && !seenUrls.has(url)) {
      seenUrls.add(url);
      documents.push({
        id: String(value.id || value.documentId || value.type || createId("doc")),
        type: String(value.type || value.documentType || value.name || value.label || (source === "speedship" ? "BILL_OF_LADING" : "document")),
        label: formatDocumentLabel(value, source),
        url,
        source
      });
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        visit(child, depth + 1);
      }
    }
  };

  visit(payload);
  return documents;
}

function formatDocumentLabel(value, source) {
  const type = String(value?.type || value?.documentType || value?.name || value?.label || "").trim();
  if (!type) {
    return source === "speedship" ? "Bill of Lading" : "Document";
  }

  const normalized = type
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  if (normalized === "bill of lading" || normalized === "bol") {
    return "Bill of Lading";
  }
  if (normalized === "proof of delivery" || normalized === "pod") {
    return "Proof of Delivery";
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim()) || String(value || "").startsWith("data:");
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

function defaultTariffRule(customerId) {
  return {
    id: createId("tariff"),
    customerId,
    ruleType: "percentage",
    fixedAmount: 50,
    markupPercentage: 15,
    status: "active",
    createdAt: new Date().toISOString()
  };
}

async function readJson(req) {
  if (req && typeof req.text === "function" && typeof req[Symbol.asyncIterator] !== "function") {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  }

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

function normalizePhoneNumber(value, field) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  throw new PublicError(400, "VALIDATION_ERROR", `${field} must be a 10-digit phone number.`);
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

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

async function login(req, res) {
  const input = await readJson(req);
  const email = requiredString(input.email, "email");
  const password = requiredString(input.password, "password");
  const user = await store.getUserByEmail(email);

  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    sendJson(res, 401, { error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    return;
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  await store.createSession({
    userId: user.id,
    tokenHash: sessionHash,
    expiresAt
  });
  setSessionCookie(res, sessionToken, expiresAt);
  sendJson(res, 200, { user: await publicUserWithOrganizationContext(user) });
}

async function logout(req, res) {
  const token = getSessionToken(req);
  if (token) {
    await store.deleteSessionByTokenHash(hashSessionToken(token));
  }
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

async function requireCurrentUser(req, res, writeError = true) {
  const token = getSessionToken(req);
  if (!token) {
    if (writeError) {
      sendJson(res, 401, { error: "UNAUTHENTICATED", message: "Please sign in." });
    }
    return null;
  }

  const session = await store.getSessionByTokenHash(hashSessionToken(token));
  if (!session) {
    if (writeError) {
      clearSessionCookie(res);
      sendJson(res, 401, { error: "UNAUTHENTICATED", message: "Please sign in." });
    }
    return null;
  }

  return session.user || null;
}

function requireStaff(user) {
  if (!["admin", "operations"].includes(user.role)) {
    throw new PublicError(403, "FORBIDDEN", "You do not have permission to perform that action.");
  }
}

function requireInternalUserManager(user) {
  if (!["admin", "operations"].includes(user.role)) {
    throw new PublicError(403, "FORBIDDEN", "You do not have permission to manage internal users.");
  }
}

function isInternalUser(user) {
  return ["admin", "operations", "staff"].includes(user?.role);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PublicError(400, "VALIDATION_ERROR", "A valid email is required.");
  }
  return email;
}

function normalizeInternalRole(value) {
  const role = String(value || "").trim();
  if (!["admin", "operations", "staff"].includes(role)) {
    throw new PublicError(400, "VALIDATION_ERROR", "role must be admin, operations, or staff.");
  }
  return role;
}

function normalizeInternalStatus(value) {
  const status = String(value || "").trim();
  if (!["active", "disabled"].includes(status)) {
    throw new PublicError(400, "VALIDATION_ERROR", "status must be active or disabled.");
  }
  return status;
}

function assertCanCreateInternalRole(actor, role) {
  if (actor.role === "admin") {
    return;
  }
  if (actor.role === "operations" && role === "staff") {
    return;
  }
  throw new PublicError(403, "FORBIDDEN", "You do not have permission to create that internal role.");
}

async function requireManageableInternalTarget(actor, targetId) {
  const target = await store.getUserById(targetId);
  if (!target || target.role === "customer" || target.customerId) {
    throw new PublicError(404, "INTERNAL_USER_NOT_FOUND", "Internal user was not found.");
  }
  if (!["admin", "operations", "staff"].includes(target.role)) {
    throw new PublicError(404, "INTERNAL_USER_NOT_FOUND", "Internal user was not found.");
  }
  if (actor.role === "operations" && target.role !== "staff") {
    throw new PublicError(403, "FORBIDDEN", "Sub-admins may manage Staff users only.");
  }
  return target;
}

function assertCanUpdateInternalUser(actor, target, update) {
  const nextRole = Object.prototype.hasOwnProperty.call(update, "role") ? update.role : target.role;
  const nextStatus = Object.prototype.hasOwnProperty.call(update, "status") ? update.status : target.status;
  if (actor.id === target.id && (nextRole !== target.role || nextStatus !== target.status)) {
    throw new PublicError(403, "FORBIDDEN", "You cannot change your own role or status from User Management.");
  }
  if (actor.role === "operations") {
    if (target.role !== "staff" || nextRole !== "staff") {
      throw new PublicError(403, "FORBIDDEN", "Sub-admins may manage Staff users only.");
    }
  }
}

function assertCanResetInternalUserPassword(actor, target) {
  if (actor.id === target.id) {
    throw new PublicError(403, "FORBIDDEN", "You cannot reset your own password from User Management.");
  }
  if (actor.role === "operations" && target.role !== "staff") {
    throw new PublicError(403, "FORBIDDEN", "Sub-admins may reset Staff passwords only.");
  }
}

function storeInternalUserError(error) {
  if (error?.code === "EMAIL_ALREADY_EXISTS" || error?.code === "23505") {
    return new PublicError(409, "EMAIL_ALREADY_EXISTS", "Email is already in use.");
  }
  if (error?.code === "FINAL_ACTIVE_ADMIN") {
    return new PublicError(400, "FINAL_ACTIVE_ADMIN", "The final active Admin cannot be demoted or disabled.");
  }
  if (error?.code === "NOT_INTERNAL_USER") {
    return new PublicError(404, "INTERNAL_USER_NOT_FOUND", "Internal user was not found.");
  }
  return null;
}

async function createInternalUserWithPublicErrors(input) {
  try {
    return await store.createInternalUser(input);
  } catch (error) {
    throw storeInternalUserError(error) || error;
  }
}

async function updateInternalUserWithPublicErrors(id, input) {
  try {
    return await store.updateInternalUser(id, input);
  } catch (error) {
    throw storeInternalUserError(error) || error;
  }
}

async function resetInternalUserPasswordWithPublicErrors(id, password) {
  try {
    return await store.resetInternalUserPassword(id, password);
  } catch (error) {
    throw storeInternalUserError(error) || error;
  }
}

function publicUser(user) {
  return buildPublicUser(user);
}

async function publicUserWithOrganizationContext(user) {
  return buildPublicUser(user, await store.getOrganizationContextForUser(user));
}

function quoteForUser(quote, user, customer = null) {
  if (isInternalUser(user)) {
    return quote;
  }
  return sanitizeQuoteForCustomer(quote, customer);
}

function sanitizeQuoteForCustomer(quote, customer = null) {
  if (!quote || typeof quote !== "object") {
    return quote;
  }

  return {
    id: quote.id,
    customerId: quote.customerId,
    customerName: quote.customerName,
    referenceNumber: quote.referenceNumber,
    pickup: quote.pickup,
    delivery: quote.delivery,
    freight: quote.freight,
    pickupReadyDate: quote.pickupReadyDate,
    rates: Array.isArray(quote.rates) ? quote.rates.map((rate) => sanitizeRateForCustomer(rate, quote, customer)) : [],
    rateAvailability: quote.rateAvailability || {
      status: Array.isArray(quote.rates) && quote.rates.length > 0 ? "complete" : "none",
      messageCode: Array.isArray(quote.rates) && quote.rates.length > 0 ? null : "NO_RATES_AVAILABLE"
    },
    status: quote.status,
    createdAt: quote.createdAt
  };
}

function sanitizeRateForCustomer(rate, quote, customer = null) {
  const carrierMode = rate?.carrierSource || quote?.carrierMode;
  return {
    id: rate?.id,
    carrierName: safeCustomerCarrierName(rate, quote),
    service: rate?.service,
    sellPrice: rate?.sellPrice,
    estimatedPickupDate: rate?.estimatedPickupDate || null,
    estimatedDeliveryDate: rate?.estimatedDeliveryDate || null,
    transitDays: rate?.transitDays || null,
    bookingAllowed: customer ? isCustomerAllowedToBookCarrier(customer, carrierMode) : false
  };
}

function safeCustomerCarrierName(rate, quote = null) {
  return resolveActualCarrierName(rate, {
    sourcePlatform: rate?.carrierSource || quote?.carrierMode || ""
  });
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = crypto.pbkdf2Sync(String(password), String(salt), 120000, 32, "sha256").toString("hex");
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(String(expectedHash), "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

function hashSessionToken(token) {
  return crypto.createHmac("sha256", appSecret).update(String(token)).digest("hex");
}

function getSessionToken(req) {
  const cookieHeader = typeof req?.headers?.get === "function"
    ? req.headers.get("cookie") || ""
    : req?.headers?.cookie || "";
  const cookies = parseCookies(cookieHeader);
  return cookies[sessionCookieName] || null;
}

function parseCookies(header) {
  return header
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const separator = item.indexOf("=");
      if (separator === -1) {
        return acc;
      }
      const key = item.slice(0, separator).trim();
      const value = decodeURIComponent(item.slice(separator + 1).trim());
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
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

if (isNodeRuntime && typeof process.on === "function") {
  process.on("uncaughtException", (error) => {
    if (error instanceof PublicError) {
      console.error(`${error.code}: ${error.message}`);
      return;
    }
    console.error(error);
  });
}
