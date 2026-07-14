export const pickupTimeErrorCodes = {
  invalidHours: "INVALID_PICKUP_HOURS",
  readyBeforeOpen: "INVALID_PICKUP_READY_TIME",
  readyAfterClose: "PICKUP_READY_AFTER_CLOSE",
  invalidTime: "INVALID_PICKUP_TIME"
};

export const mothershipPickupReadyBeforeOpenMessage =
  "No Mothership rates: pickup ready time is earlier than pickup opening time.";

export function normalizeQuoteTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{1,2})(?::?(\d{2}))$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return {
    value: `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`,
    minutes: hours * 60 + minutes
  };
}

export function validatePickupReadyWindow({ openTime, readyTime, closeTime }) {
  const open = normalizeQuoteTime(openTime);
  const ready = normalizeQuoteTime(readyTime);
  const close = normalizeQuoteTime(closeTime);

  if (!open || !ready || !close) {
    return {
      valid: false,
      code: pickupTimeErrorCodes.invalidTime,
      field: !open ? "pickupOpen" : !ready ? "pickupTime" : "pickupClose",
      normalized: { open, ready, close }
    };
  }

  if (open.minutes >= close.minutes) {
    return {
      valid: false,
      code: pickupTimeErrorCodes.invalidHours,
      field: "pickupClose",
      normalized: { open, ready, close }
    };
  }

  if (ready.minutes < open.minutes) {
    return {
      valid: false,
      code: pickupTimeErrorCodes.readyBeforeOpen,
      field: "pickupTime",
      normalized: { open, ready, close },
      suggestedReadyTime: open.value
    };
  }

  if (ready.minutes >= close.minutes) {
    return {
      valid: false,
      code: pickupTimeErrorCodes.readyAfterClose,
      field: "pickupTime",
      normalized: { open, ready, close }
    };
  }

  return {
    valid: true,
    code: null,
    field: null,
    normalized: { open, ready, close }
  };
}

export function isMothershipPickupReadyBeforeOpenFailure(message) {
  return /freight ready time is before pickup location operation hours|pickup ready time is earlier than pickup opening time/i.test(
    String(message || "")
  );
}

export function carrierStatusLine({ provider, rateCount = 0, message = "", isMothership = false }, translate = defaultTranslate) {
  const count = Number(rateCount);
  if (Number.isFinite(count) && count > 0) {
    return translate("{provider}: {count} rate(s) returned.", { provider, count });
  }

  if (isMothership && isMothershipPickupReadyBeforeOpenFailure(message)) {
    return translate(mothershipPickupReadyBeforeOpenMessage);
  }

  return translate("No {provider} rates: {message}", {
    provider,
    message: String(message || "Carrier returned no rates for this lane.").trim()
  });
}

function defaultTranslate(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}
