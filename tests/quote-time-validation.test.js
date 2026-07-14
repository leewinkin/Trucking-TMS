import assert from "node:assert/strict";
import {
  carrierStatusLine,
  mothershipPickupReadyBeforeOpenMessage,
  pickupTimeErrorCodes,
  validatePickupReadyWindow
} from "../public/quote-time-validation.js";

const cases = [
  {
    name: "a. open 10:00, ready 09:00, close 21:00 is blocked with correction",
    input: { openTime: "10:00", readyTime: "09:00", closeTime: "21:00" },
    expected: { valid: false, code: pickupTimeErrorCodes.readyBeforeOpen, suggestedReadyTime: "1000" }
  },
  {
    name: "b. open 10:00, ready 10:00, close 21:00 is allowed",
    input: { openTime: "10:00", readyTime: "10:00", closeTime: "21:00" },
    expected: { valid: true }
  },
  {
    name: "c. open 10:00, ready 10:30, close 21:00 is allowed",
    input: { openTime: "1000", readyTime: "10:30", closeTime: "2100" },
    expected: { valid: true }
  },
  {
    name: "d. open 10:00, ready 21:00, close 21:00 is blocked",
    input: { openTime: "1000", readyTime: "2100", closeTime: "2100" },
    expected: { valid: false, code: pickupTimeErrorCodes.readyAfterClose }
  },
  {
    name: "e. open 21:00, close 10:00 is blocked",
    input: { openTime: "2100", readyTime: "21:00", closeTime: "10:00" },
    expected: { valid: false, code: pickupTimeErrorCodes.invalidHours }
  }
];

for (const testCase of cases) {
  const result = validatePickupReadyWindow(testCase.input);
  assert.equal(result.valid, testCase.expected.valid, testCase.name);
  if (testCase.expected.code) {
    assert.equal(result.code, testCase.expected.code, testCase.name);
  }
  if (testCase.expected.suggestedReadyTime) {
    assert.equal(result.suggestedReadyTime, testCase.expected.suggestedReadyTime, testCase.name);
  }
}

assert.equal(
  carrierStatusLine({
    provider: "SpeedShip LTL",
    rateCount: 2,
    message: "",
    isMothership: false
  }),
  "SpeedShip LTL: 2 rate(s) returned.",
  "f. successful non-Mothership rates remain visible"
);

assert.equal(
  carrierStatusLine({
    provider: "Mothership",
    rateCount: 0,
    message: "Freight ready time is before pickup location operation hours",
    isMothership: true
  }),
  mothershipPickupReadyBeforeOpenMessage,
  "f. Mothership failure status is readable"
);

console.log("quote time validation tests passed");
