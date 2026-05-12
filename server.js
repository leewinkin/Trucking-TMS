import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAppStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");
const sessionCookieName = "tms_session";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
let appSecret = "local-dev-secret";

await loadLocalEnv();
appSecret = process.env.APP_SECRET || appSecret;

const store = await createAppStore({
  dbUrl: process.env.DATABASE_URL,
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
      dataStore: store.kind,
      mothershipConfigured: Boolean(process.env.MOTHERSHIP_API_TOKEN),
      speedshipConfigured: Boolean(speedshipDirectToken || (speedshipClientId && speedshipClientSecret)),
      mothershipBaseUrl
    });
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

    sendJson(res, 200, { user: publicUser(currentUser) });
    return;
  }

  const currentUser = await requireCurrentUser(req, res, true);
  if (!currentUser) {
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

  if (req.method === "POST" && url.pathname === "/api/quotes") {
    await createQuote(req, res, currentUser);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/quotes") {
    const quotes = await store.listQuotes();
    sendJson(
      res,
      200,
      {
        quotes: currentUser.role === "customer" ? quotes.filter((quote) => quote.customerId === currentUser.customerId) : quotes
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
  const tariffRule = tariffs.find((rule) => rule.status === "active") || defaultTariffRule(customer.id);
  const referenceNumber = requiredString(input.referenceNumber, "referenceNumber");
  const allowedCarrierModes = normalizeAllowedCarrierModes(customer.allowedCarrierModes);
  const mothershipRequest = buildMothershipQuoteRequest(input);
  const speedshipRequests = buildSpeedshipLtlQuoteRequests(input);
  const carrierRuns = await Promise.all(
    allowedCarrierModes.map((mode) => requestCarrierQuoteForMode(mode, mothershipRequest, speedshipRequests))
  );

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
  const carrierNotice = normalizedRates.length === 0 ? carrierMessage || "Carrier returned no rates for this lane." : "";

  if (normalizedRates.length === 0) {
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
      freight: mothershipRequest.freight,
      pickupReadyDate: mothershipRequest.pickupReadyDate,
      tariffRule,
      rates: [],
      status: "carrier_connected_no_rates",
      carrierMessage: carrierNotice,
      rawCarrierResponse: carrierRuns,
      createdAt: new Date().toISOString()
    };

    await store.createQuote(quote);
    sendJson(res, 201, { quote });
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
    freight: mothershipRequest.freight,
    pickupReadyDate: mothershipRequest.pickupReadyDate,
    tariffRule,
    rates: normalizedRates,
    status: "quoted",
    carrierMessage: carrierNotice,
    rawCarrierResponse: carrierRuns,
    createdAt: new Date().toISOString()
  };

  await store.createQuote(quote);
  sendJson(res, 201, { quote });
}

async function createShipment(req, res, currentUser) {
  const input = await readJson(req);
  const quote = await store.getQuote(input.quoteId);

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

    carrierShipment = await requestMothershipShipment({
      quoteId: rate.carrierQuoteId || quote.carrierQuoteId,
      rateId: rate.carrierRateId || rate.id
    });
  }

  const shipment = {
    id: createId("ship"),
    customerId: quote.customerId,
    customerName: quote.customerName,
    quoteId: quote.id,
    carrier: rate.carrierSource === "speedshipLtl" ? "speedship" : rate.carrierSource === "mothershipSandbox" ? "mothership" : quote.carrier || "demo",
    carrierShipmentId: getCarrierShipmentId(carrierShipment) || createId("demoShipment"),
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
    const tracking = await requestMothershipShipmentDetails(shipment.carrierShipmentId);
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

function buildMothershipQuoteRequest(input) {
  return {
    pickup: normalizeStop(input.pickup, "pickup"),
    delivery: normalizeStop(input.delivery, "delivery"),
    pickupReadyDate: {
      date: requiredString(input.pickupReadyDate?.date, "pickupReadyDate.date"),
      time: requiredString(input.pickupReadyDate?.time, "pickupReadyDate.time")
    },
    freight: normalizeFreight(input.freight),
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
      isStackable: false,
      marksAndNumbers: null,
      packagingType: "PLT",
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
          commodityClass: String(item.freightClass || item.commodityClass || "50"),
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
          isHazMat: Boolean(pickupAccessorials.has("hazmat") || deliveryAccessorials.has("hazmat")),
          name: item.description,
          NMFCDescription: null,
          NMFCNbr: null,
          packagingType: "PLT",
          quantity: itemQuantity,
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
            type: "Reference 1",
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

async function requestMothershipShipmentDocuments(shipmentId) {
  return requestMothership(`/documents/${encodeURIComponent(shipmentId)}`, {
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
      rate.carrier?.name ||
      rate.vendor?.name ||
      null,
    service: Array.isArray(rate.services) && rate.services.length > 0 ? rate.services.join(", ") : "Standard",
    carrierCost: toMoney(rate.price || rate.total || rate.cost || 0),
    estimatedPickupDate: rate.estimatedPickupDate || null,
    estimatedDeliveryDate: rate.estimatedDeliveryDate || null,
    transitDays: rate.transitDays || null,
    warnings: Array.isArray(rate.warnings) ? rate.warnings : []
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
      providerScac: rate.vendorId || rate.carrierCode || rate.timeInTransit?.scac || rate.primaryVendor?.scac || null,
      carrierName:
        rate.carrierName ||
        rate.vendorName ||
        rate.primaryVendor?.name ||
        rate.timeInTransit?.carrierName ||
        rate.timeInTransit?.vendorName ||
        rate.carrierDescription ||
        null,
      service: String(
        rate.serviceName ||
          rate.serviceType ||
          rate.serviceLevel ||
          rate.timeInTransit?.serviceLevel ||
          rate.vendorName ||
          rate.mode ||
          rate.name ||
          "LTL"
      ),
      carrierCost,
      estimatedPickupDate: rate.estimatedPickupDate || rate.pickupDate || null,
      estimatedDeliveryDate: rate.estimatedDeliveryDate || rate.deliveryDate || rate.timeInTransit?.estimatedDeliveryDate || null,
      transitDays: rate.transitDays || rate.transitTime || rate.timeInTransit?.transitDays || null,
      warnings: Array.isArray(rate.warnings) ? rate.warnings : Array.isArray(rate.messages) ? rate.messages : []
    };
  });
}

function normalizeTrackingEvents(payload) {
  const events = payload?.results || payload?.data?.trackingEvents || payload?.data || [];
  if (Array.isArray(events)) {
    return events.map((event) => ({
      status: event.status || event.type || "Updated",
      eventTime: event.eventTime || event.timestamp || event.createdAt || new Date().toISOString(),
      location: event.location || [event.city, event.state].filter(Boolean).join(", "),
      description: event.description || event.message || "Tracking event received."
    }));
  }

  const data = payload?.data || payload || {};
  return [
    {
      status: data.status || "Updated",
      eventTime:
        data.estimatedDeliveryDate ||
        data.earliestPickupDate ||
        data.createdAt ||
        new Date().toISOString(),
      location:
        data.estimatedLocation && typeof data.estimatedLocation === "object"
          ? `${data.estimatedLocation.latitude}, ${data.estimatedLocation.longitude}`
          : "",
      description: "Shipment details updated."
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
  const data = payload?.data || payload;
  return data?.id || data?.shipmentId || data?.productTransactionId || data?.shipmentOfferId || null;
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
  if (value === "mothershipSandbox" || value === "speedshipLtl") {
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
    if ((mode === "mothershipSandbox" || mode === "speedshipLtl" || mode === "demo") && !normalized.includes(mode)) {
      normalized.push(mode);
    }
  }

  return normalized.length > 0 ? normalized : fallback;
}

function carrierModeDisplayName(mode) {
  switch (normalizeCarrierMode(mode)) {
    case "mothershipSandbox":
      return "Mothership sandbox";
    case "speedshipLtl":
      return "SpeedShip LTL";
    case "demo":
    default:
      return "Demo rates";
  }
}

async function requestCarrierQuoteForMode(mode, mothershipRequest, speedshipRequests) {
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
          rawCarrierResponse: {}
        };
      }

      const carrierQuote = await requestMothershipQuote(mothershipRequest);
      const rates = normalizeMothershipRates(carrierQuote);
      return {
        mode: normalizedMode,
        carrier: "mothership",
        carrierQuoteId: getCarrierQuoteId(carrierQuote),
        rates,
        carrierMessage: rates.length === 0 ? "Mothership sandbox returned no rates for this lane." : "",
        rawCarrierResponse: carrierQuote
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
          rawCarrierResponse: {}
        };
      }

      const carrierQuote = await requestSpeedshipLtlQuote(speedshipRequests.shopFlow, speedshipRequests.estimateFlow);
      const rates = normalizeSpeedshipLtlRates(carrierQuote);
      return {
        mode: normalizedMode,
        carrier: "speedship",
        carrierQuoteId: getCarrierQuoteId(carrierQuote),
        rates,
        carrierMessage: rates.length === 0 ? "SpeedShip sandbox connection succeeded, but this lane returned no matching rates." : "",
        rawCarrierResponse: carrierQuote
      };
    }

    const carrierQuote = createDemoCarrierQuote(mothershipRequest);
    const rates = normalizeMothershipRates(carrierQuote);
    return {
      mode: normalizedMode,
      carrier: "demo",
      carrierQuoteId: getCarrierQuoteId(carrierQuote),
      rates,
      carrierMessage: "",
      rawCarrierResponse: carrierQuote
    };
  } catch (error) {
    return {
      mode: normalizedMode,
      carrier: normalizedMode === "speedshipLtl" ? "speedship" : normalizedMode === "mothershipSandbox" ? "mothership" : "demo",
      carrierQuoteId: createId(`${normalizedMode}Quote`),
      rates: [],
      carrierMessage: error?.message || "Carrier request failed.",
      rawCarrierResponse: {
        error: error?.code || "CARRIER_REQUEST_FAILED",
        message: error?.message || "Carrier request failed."
      }
    };
  }
}

function isSpeedshipConfigured() {
  return Boolean(speedshipDirectToken || (speedshipClientId && speedshipClientSecret));
}

function readNestedNumber(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      current = current?.[key];
    }
    if (current !== undefined && current !== null && current !== "") {
      const number = Number(current);
      if (Number.isFinite(number)) {
        return number;
      }
    }
  }
  return 0;
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

  const normalized = type.replace(/[_-]+/g, " ").toLowerCase();
  if (normalized === "bill of lading" || normalized === "bol") {
    return "Bill of Lading";
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
  sendJson(res, 200, { user: publicUser(user) });
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

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    customerId: user.customerId || null,
    status: user.status
  };
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
  const cookies = parseCookies(req.headers.cookie || "");
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

process.on("uncaughtException", (error) => {
  if (error instanceof PublicError) {
    console.error(`${error.code}: ${error.message}`);
    return;
  }
  console.error(error);
});
