# Mothership Integration Plan

Source docs:

- https://developers.mothership.com/reference/overview
- https://developers.mothership.com/reference/authentication
- https://developers.mothership.com/reference/createquote
- https://developers.mothership.com/reference/createshipment
- https://developers.mothership.com/reference/getshipmentdetails
- https://developers.mothership.com/reference/fetchshipmenttracking

## Environment

Sandbox base URL:

```text
https://sandbox.api.mothership.com/beta
```

Production base URL:

```text
https://api.mothership.com/beta
```

Required backend environment variables:

```text
MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta
MOTHERSHIP_API_TOKEN=
```

The API token must be stored only on the backend.

## Authentication

Mothership uses bearer token authentication.

```http
Authorization: Bearer {MOTHERSHIP_API_TOKEN}
Content-Type: application/json
```

Unauthenticated requests return `401`.

## MVP API Endpoints To Build In Our Backend

These are internal TMS endpoints. The frontend calls these, not Mothership directly.

### Create Customer Quote

```http
POST /api/quotes
```

Responsibilities:

1. Validate customer shipment input.
2. Load customer tariff rule.
3. Call Mothership `POST /quotes`.
4. Store raw Mothership quote response for audit.
5. Apply markup rules to each returned rate.
6. Return customer-facing rates.

### Book Shipment

```http
POST /api/shipments
```

Responsibilities:

1. Confirm user owns the quote.
2. Confirm selected rate belongs to quote.
3. Call Mothership `POST /shipments` with `quoteId` and `rateId`.
4. Store carrier shipment ID, carrier cost, customer sell price, and margin.
5. Create invoice record.
6. Return booking confirmation.

### Get Shipment Detail

```http
GET /api/shipments/:id
```

Responsibilities:

1. Confirm user can access shipment.
2. Return local shipment detail.
3. Optionally refresh carrier detail using Mothership `GET /shipments/{shipmentId}`.

### Get Tracking

```http
GET /api/shipments/:id/tracking
```

Responsibilities:

1. Confirm user can access shipment.
2. Call Mothership `GET /tracking/{shipmentId}` or use cached events.
3. Normalize tracking events.
4. Return customer-facing tracking history.

## Mothership Quote Request Shape

Mothership `POST /quotes` requires:

- `pickup`
- `delivery`
- `freight`
- `pickupReadyDate`

Example normalized request from our frontend:

```json
{
  "pickup": {
    "name": "Pickup Warehouse",
    "address": {
      "street": "2800 East Observatory Road",
      "city": "Los Angeles",
      "state": "CA",
      "zip": "90027"
    },
    "phoneNumber": "+15555555555",
    "emails": ["shipping@example.com"],
    "openTime": "0800",
    "closeTime": "1700",
    "accessorials": ["liftgate"]
  },
  "delivery": {
    "name": "Delivery Warehouse",
    "address": {
      "street": "5905 Wilshire Boulevard",
      "city": "Los Angeles",
      "state": "CA",
      "zip": "90036"
    },
    "phoneNumber": "+15555555555",
    "emails": [],
    "openTime": "0900",
    "closeTime": "1600",
    "accessorials": ["residential"]
  },
  "pickupReadyDate": {
    "date": "2026-05-12",
    "time": "0930"
  },
  "freight": [
    {
      "quantity": 2,
      "type": "Pallet",
      "weight": 50,
      "length": 48,
      "width": 42,
      "height": 46,
      "description": "General merchandise"
    }
  ]
}
```

Optional fields to support later:

- `rateResponseTimeoutMs`
- `applyAvailableCredits`
- `declaredFreightValue`

Reference / PO handling:

- The TMS stores the customer-entered `referenceNumber` on the quote, shipment, and invoice records.
- Mothership's current public `POST /quotes` documentation does not list a Reference / PO field.
- Mothership's current public `POST /shipments` documentation lists only `quoteId` and `rateId`.
- Until Mothership confirms an API field for customer reference data, do not send undocumented PO fields to Mothership. Keep the value in the TMS and show it in staff audit views.

## Quote Response Handling

Mothership returns a quote ID and available rates. Each rate can include:

- rate ID
- provider
- provider SCAC
- price
- services
- transit days
- truck/equipment data
- warnings
- purchase eligibility metadata

Our TMS should store:

- Mothership quote ID
- raw carrier response
- each carrier rate
- carrier cost
- customer sell price
- margin
- warnings
- whether the rate is bookable

Customer should see:

- service/provider
- pickup estimate
- delivery estimate
- transit time
- customer price after tariff
- warnings that affect booking

Customer should not see:

- raw carrier API payload
- backend token
- internal cost/margin, unless an admin user is viewing

## Booking Request Shape

Mothership `POST /shipments` requires:

```json
{
  "quoteId": "MOTHERSHIP_QUOTE_ID",
  "rateId": "SELECTED_RATE_ID"
}
```

The app stores the outbound booking request and carrier response on the local shipment audit record. For Mothership, the audit also carries the TMS Reference / PO as local context because the documented carrier booking request does not expose a reference field.

Risk: booking purchases the shipment against the organization's payment source. Keep booking behind an explicit customer confirmation screen.

## Tracking

For tracking, use:

```http
GET /tracking/{shipmentId}
```

Also support:

```http
GET /shipments/{shipmentId}
```

Mothership docs recommend polling shipment detail no more than once every 5 minutes, or using webhooks when available.

## Error Handling

Mothership uses conventional HTTP codes:

- `400`: invalid request or validation/business error
- `401`: missing or invalid token
- `403`: authenticated but forbidden
- `429`: rate limit or too many shipment creations
- `500`: Mothership server error

Our backend should normalize these to customer-safe messages:

- No rate found
- Address or freight details need correction
- Shipment could not be booked
- Carrier service temporarily unavailable

Admin logs should keep full error details for support.

## Key Product Risks

- Booking may charge the default payment source, so confirmation must be clear.
- Quote prices may change if booking requires revalidation.
- API token must never appear in frontend bundles, browser logs, or customer-visible errors.
- Customer markup must be applied server-side.
- Tracking should be cached or webhook-driven to avoid excessive polling.
- Raw carrier errors should be hidden from customers but visible to admins.
