export function normalizeQuoteStatus(status) {
  const value = String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["booked", "converted", "shipment_created"].includes(value)) {
    return "booked";
  }
  if (["cancelled", "canceled"].includes(value)) {
    return "cancelled";
  }
  if (value === "expired") {
    return "expired";
  }
  if (["failed", "error", "rejected"].includes(value)) {
    return "failed";
  }
  if (["no_rates", "none"].includes(value)) {
    return "no_rates";
  }
  if (["quoted", "ready", "ready_to_book"].includes(value)) {
    return "ready";
  }
  return "status_pending";
}

export function normalizeShipmentStatus(status) {
  const value = String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["booked", "booked_with_carrier", "local_booking", "confirmed"].includes(value)) {
    return "booked";
  }
  if (["pickup_scheduled", "scheduled", "pickup_appointment"].includes(value)) {
    return "pickup_scheduled";
  }
  if (["picked_up", "pickup_complete", "at_origin"].includes(value)) {
    return "picked_up";
  }
  if (["in_transit", "transit", "moving"].includes(value)) {
    return "in_transit";
  }
  if (["out_for_delivery", "ofd"].includes(value)) {
    return "out_for_delivery";
  }
  if (["delivered", "completed", "complete"].includes(value)) {
    return "delivered";
  }
  if (["exception", "delayed", "failed", "rejected", "needs_attention"].includes(value)) {
    return "exception";
  }
  if (["cancelled", "canceled", "void"].includes(value)) {
    return "cancelled";
  }
  return "status_pending";
}

export function normalizeInvoiceStatus(status) {
  const value = String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["paid", "settled"].includes(value)) {
    return "paid";
  }
  if (["void", "voided"].includes(value)) {
    return "void";
  }
  if (["cancelled", "canceled", "closed", "refunded", "written_off"].includes(value)) {
    return "cancelled";
  }
  if (["draft", "open", "pending", "unpaid", "due", "overdue", "imported"].includes(value)) {
    return "open";
  }
  return "status_pending";
}

export function customerVisibleRates(quote) {
  return Array.isArray(quote?.rates) ? quote.rates : [];
}

export function quoteHasShipment(quote, shipments = []) {
  return shipments.some((shipment) => shipment.quoteId && shipment.quoteId === quote?.id);
}

export function isQuoteReadyToBook(quote, shipments = []) {
  const blockedStatuses = new Set(["cancelled", "expired", "failed", "booked"]);
  return (
    customerVisibleRates(quote).length > 0 &&
    !quoteHasShipment(quote, shipments) &&
    !blockedStatuses.has(normalizeQuoteStatus(quote?.status))
  );
}

export function isActiveShipment(shipment) {
  return ["booked", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "exception"].includes(
    normalizeShipmentStatus(shipment?.status)
  );
}

export function isOpenInvoice(invoice) {
  return normalizeInvoiceStatus(invoice?.status) === "open";
}

export function reliableDeliveredDate(shipment) {
  if (normalizeShipmentStatus(shipment?.status) !== "delivered") {
    return null;
  }
  const candidates = [
    shipment.deliveredAt,
    shipment.deliveryDate,
    shipment.actualDeliveryDate,
    shipment.pod?.deliveredAt,
    shipment.tracking?.deliveredAt
  ];
  const events = Array.isArray(shipment.trackingEvents)
    ? shipment.trackingEvents
    : Array.isArray(shipment.events)
      ? shipment.events
      : [];
  for (const event of events) {
    if (normalizeShipmentStatus(event?.status) === "delivered") {
      candidates.push(event.eventTime || event.timestamp || event.createdAt);
    }
  }
  for (const value of candidates) {
    const date = parseDate(value);
    if (date) {
      return date;
    }
  }
  return null;
}

export function isDeliveredThisMonth(shipment, now = new Date()) {
  const deliveredDate = reliableDeliveredDate(shipment);
  return Boolean(
    deliveredDate &&
      deliveredDate.getFullYear() === now.getFullYear() &&
      deliveredDate.getMonth() === now.getMonth()
  );
}

export function customerDashboardMetrics({ quotes = [], shipments = [], invoices = [] }, now = new Date()) {
  return {
    readyToBook: quotes.filter((quote) => isQuoteReadyToBook(quote, shipments)).length,
    activeShipments: shipments.filter(isActiveShipment).length,
    openInvoices: invoices.filter(isOpenInvoice).length,
    deliveredThisMonth: shipments.filter((shipment) => isDeliveredThisMonth(shipment, now)).length
  };
}

export function quoteStatusLabelKey(quote, shipments = []) {
  if (isQuoteReadyToBook(quote, shipments)) {
    return "Ready to Book";
  }
  const status = normalizeQuoteStatus(quote?.status);
  if (status === "booked" || quoteHasShipment(quote, shipments)) {
    return "Booked";
  }
  if (status === "expired") {
    return "Expired";
  }
  if (customerVisibleRates(quote).length === 0) {
    return "No Rates";
  }
  return "Status Pending";
}

export function shipmentStatusLabelKey(status) {
  return {
    booked: "Booked",
    pickup_scheduled: "Pickup Scheduled",
    picked_up: "Picked Up",
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    exception: "Exception",
    cancelled: "Cancelled",
    status_pending: "Status Pending"
  }[normalizeShipmentStatus(status)];
}

export function shipmentStatusVariant(status) {
  return {
    booked: "neutral",
    pickup_scheduled: "blue",
    picked_up: "blue",
    in_transit: "blue",
    out_for_delivery: "blue",
    delivered: "green",
    exception: "red",
    cancelled: "red",
    status_pending: "neutral"
  }[normalizeShipmentStatus(status)];
}

export function activeShipmentSortDate(shipment) {
  return parseDate(shipment?.estimatedDeliveryDate || shipment?.eta || shipment?.pickupDate?.date || shipment?.pickupDate || shipment?.createdAt);
}

export function recentByCreatedAt(items = []) {
  return [...items].sort((left, right) => (parseDate(right?.createdAt)?.getTime() || 0) - (parseDate(left?.createdAt)?.getTime() || 0));
}

export function dashboardAttentionItems({ quotes = [], shipments = [], invoices = [] }, now = new Date()) {
  const items = [];
  shipments.forEach((shipment) => {
    if (normalizeShipmentStatus(shipment.status) === "exception") {
      items.push({ type: "shipment_exception", priority: 1, date: shipment.updatedAt || shipment.createdAt, shipment });
    }
  });
  invoices.forEach((invoice) => {
    if (!isOpenInvoice(invoice)) {
      return;
    }
    const dueDate = parseDate(invoice.dueAt);
    if (!dueDate) {
      return;
    }
    const days = calendarDayDiff(now, dueDate);
    if (days < 0) {
      items.push({ type: "invoice_overdue", priority: 2, date: invoice.dueAt, invoice });
    } else if (days <= 7) {
      items.push({ type: "invoice_due_soon", priority: 3, date: invoice.dueAt, invoice });
    }
  });
  quotes.forEach((quote) => {
    if (isQuoteReadyToBook(quote, shipments)) {
      items.push({ type: "ready_quote", priority: 4, date: quote.createdAt, quote });
    }
  });
  return items.sort((left, right) => left.priority - right.priority || ((parseDate(left.date)?.getTime() || 0) - (parseDate(right.date)?.getTime() || 0)));
}

export function customerDashboardViewModel(data, now = new Date()) {
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  const shipments = Array.isArray(data?.shipments) ? data.shipments : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  return {
    metrics: customerDashboardMetrics({ quotes, shipments, invoices }, now),
    activeShipments: shipments
      .filter(isActiveShipment)
      .sort((left, right) => (activeShipmentSortDate(left)?.getTime() || 0) - (activeShipmentSortDate(right)?.getTime() || 0)),
    attentionItems: dashboardAttentionItems({ quotes, shipments, invoices }, now),
    recentQuotes: recentByCreatedAt(quotes)
  };
}

export function parseDate(value) {
  if (!value) {
    return null;
  }
  const raw = typeof value === "object" && value.date ? value.date : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDayDiff(from, to) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}
