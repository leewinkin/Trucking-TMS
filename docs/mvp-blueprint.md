# TMS MVP Blueprint

## Product Goal

Build a web-based trucking shipment ordering TMS where customers can quote, book, track shipments, and view invoices, while the company can manage customer accounts, customer-specific tariffs, and carrier API integrations.

## User Roles

### Company Admin

- Create and manage customer accounts
- Invite customer users
- Set tariff rules per customer
- View all quotes, bookings, tracking events, and invoices
- Override shipment pricing when needed
- View carrier API errors and booking failures

### Customer User

- Create shipment quotes
- Book shipments
- View their own shipment history
- Track booked shipments
- View and download invoices

### Accounting User

- View invoices
- Mark invoices as sent, paid, voided, or adjusted
- Export invoice data

## MVP Screens

### Customer Portal

- Login
- Dashboard
- New Quote
- Quote Results
- Booking Confirmation
- Shipment Detail
- Tracking
- Invoices
- Account/Profile

### Admin Portal

- Admin Dashboard
- Customers
- Customer Detail
- Tariff Rules
- Quotes
- Bookings
- Shipment Detail
- Invoices
- Carrier API Logs
- Settings

## Quote Workflow

1. Customer enters pickup, delivery, freight, and accessorial details.
2. Frontend sends quote request to your backend.
3. Backend validates shipment details.
4. Backend calls Mothership quote API using your private API token.
5. Backend stores the raw carrier quote for audit.
6. Backend applies the customer's tariff.
7. Backend returns customer-facing quote options.
8. Customer selects a quote and proceeds to booking.

## Booking Workflow

1. Customer confirms selected quote.
2. Backend revalidates quote if required by carrier rules.
3. Backend calls Mothership booking API.
4. Backend stores carrier shipment ID, confirmation number, cost, sell price, and status.
5. Backend returns booking confirmation to customer.
6. Backend creates invoice record.

## Tracking Workflow

1. Customer opens shipment detail page.
2. Frontend requests tracking from your backend.
3. Backend calls Mothership tracking API or returns cached tracking events.
4. Customer sees shipment status, events, pickup, delivery, and reference numbers.

## Invoice Workflow

1. Booking creates a draft invoice.
2. Admin or accounting can review invoice.
3. Customer can view invoice when it is released.
4. Later versions can support payment, aging, exports, and accounting integrations.

## Tariff Rules

Each customer should support one or more tariff rules.

### Basic Rule Types

- Fixed markup: cost plus a fixed dollar amount
- Percentage markup: cost multiplied by a markup percentage
- Minimum margin: enforce minimum profit per shipment
- Manual override: admin-entered final sell price

### Suggested Formula

```text
carrier_cost = Mothership returned cost
markup_amount = fixed_amount OR carrier_cost * markup_percentage
sell_price = carrier_cost + markup_amount
final_sell_price = max(sell_price, carrier_cost + minimum_margin)
```

### Future Rule Options

- Different markup by customer
- Different markup by service type
- Different markup by origin/destination state
- Different markup by weight range
- Different markup by accessorial type
- Customer-specific minimum charge

## Core Data Model

### Customer

- id
- company_name
- billing_email
- payment_terms
- status
- created_at

### User

- id
- customer_id
- name
- email
- role
- status
- created_at

### TariffRule

- id
- customer_id
- rule_type
- fixed_amount
- markup_percentage
- minimum_margin
- applies_to
- status
- created_at

### Quote

- id
- customer_id
- created_by_user_id
- origin
- destination
- freight_details
- accessorials
- carrier
- carrier_quote_id
- carrier_cost
- sell_price
- margin
- status
- raw_carrier_response
- created_at

### Shipment

- id
- customer_id
- quote_id
- carrier
- carrier_shipment_id
- confirmation_number
- origin
- destination
- freight_details
- carrier_cost
- sell_price
- margin
- status
- pickup_date
- delivery_date
- created_at

### TrackingEvent

- id
- shipment_id
- status
- event_time
- location
- description
- raw_carrier_response

### Invoice

- id
- shipment_id
- customer_id
- invoice_number
- amount
- status
- issued_at
- due_at
- paid_at

## Future Carrier Adapter Pattern

Build carrier APIs behind one internal interface:

```text
quote(shipmentRequest) -> normalizedQuote[]
book(quoteSelection) -> normalizedBooking
track(carrierShipmentId) -> normalizedTracking
cancel(carrierShipmentId) -> normalizedCancelResult
```

Initial adapter:

- Mothership

Future adapters:

- Speedship
- Priority1

The frontend should never know which carrier API format is being used.

## MVP Acceptance Criteria

- Admin can create a customer.
- Admin can assign a tariff rule to that customer.
- Customer can request a shipment quote.
- System can apply tariff and show customer sell price.
- Customer can book a shipment.
- Customer can see booking details and tracking.
- Customer can view invoice records.
- Carrier API token is never exposed to the frontend.

