# Local Development

This prototype now prefers PostgreSQL for local development.

## Start The App

First install dependencies:

```powershell
npm.cmd install
```

Then start the server:

```powershell
npm.cmd run dev
```

Then open:

```text
http://localhost:3000
```

## Data Storage

Use PostgreSQL locally by setting `DATABASE_URL` in `.env.local`. The app will auto-create the tables and seed a demo customer on first start.

If you are still setting up PostgreSQL, the app can temporarily fall back to `.local-db.json`, but that should only be a bridge while you get the database running.

## Mothership Sandbox Token

Create a backend-only `.env.local` file:

```text
DATABASE_URL=postgres://postgres:your_password@localhost:5432/trucking_tms
MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta
MOTHERSHIP_API_TOKEN=your_sandbox_token_here
```

Never put the token in `public/`, frontend JavaScript, screenshots, or customer-visible logs.

## Current Capabilities

- Add customers
- Save tariff rules
- Create demo quotes
- Apply fixed or percentage markup
- Create local bookings from quoted rates
- Create draft invoices from bookings
- Store all business data in PostgreSQL when `DATABASE_URL` is set
- Optionally call Mothership sandbox quotes when the backend token is configured

## Current Safety Defaults

- Quote mode defaults to demo rates.
- Booking defaults to local-only booking.
- Mothership booking requires a deliberate backend flag and is not enabled from the UI yet.
