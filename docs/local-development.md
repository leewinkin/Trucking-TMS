# Local Development

This prototype runs locally with Node.js and does not require a database install yet.

## Start The App

```powershell
npm.cmd run dev
```

Then open:

```text
http://localhost:3000
```

## Data Storage

Local prototype data is stored in:

```text
.local-db.json
```

That file is ignored by git because it can contain customer names, quote history, shipment details, and raw carrier responses.

## Mothership Sandbox Token

Create a backend-only `.env.local` file:

```text
MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta
MOTHERSHIP_API_TOKEN=your_sandbox_token_here
```

Never put the token in `public/`, frontend JavaScript, screenshots, or customer-visible logs.

## Current Capabilities

- Add customers
- Save tariff rules
- Create demo quotes
- Apply fixed, percentage, or hybrid markup
- Create local bookings from quoted rates
- Create draft invoices from bookings
- Optionally call Mothership sandbox quotes when the backend token is configured

## Current Safety Defaults

- Quote mode defaults to demo rates.
- Booking defaults to local-only booking.
- Mothership booking requires a deliberate backend flag and is not enabled from the UI yet.

