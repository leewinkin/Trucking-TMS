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

## Local Sign-In

The app now starts on a login screen.

Seeded demo accounts:

- Admin: `admin@local.test` / `Admin123!`
- Customer: `customer@local.test` / `Customer123!`

Admins can manage customers, tariffs, quotes, shipments, and invoices.
Customer users can only see their own customer record, tariffs, quotes, shipments, and invoices.

## Mothership Sandbox Token

Create a backend-only `.env.local` file:

```text
DATABASE_URL=postgres://postgres:your_password@localhost:5432/trucking_tms
APP_SECRET=choose-a-local-secret
MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta
MOTHERSHIP_API_TOKEN=your_sandbox_token_here
```

Never put the token in `public/`, frontend JavaScript, screenshots, or customer-visible logs.

## SpeedShip LTL Sandbox

SpeedShip LTL uses backend-only credentials. Add one of these setups to `.env.local`:

```text
SPEEDSHIP_API_BASE_URL=https://speedship.staging-wwex.com/svc
SPEEDSHIP_API_AUTH_URL=https://auth.staging-wwex.com/oauth/token
SPEEDSHIP_API_AUDIENCE=staging-wwex-apig
SPEEDSHIP_API_CLIENT_ID=your_speedship_client_id
SPEEDSHIP_API_CLIENT_SECRET=your_speedship_client_secret
```

If you have a direct sandbox token instead of OAuth client credentials, you can set:

```text
SPEEDSHIP_API_TOKEN=your_speedship_token
```

`SPEEDSHIP_API_KEY` is optional. If SpeedShip gives you a sandbox API key later, the app will send it as `x-api-key`, but OAuth client credentials are the main setup for this sandbox test.

The quote form now uses the LTL flow only. It sends the freight class and total freight weight to SpeedShip, then keeps booking local inside this prototype.

## SpeedShip LTL Production

When you are ready to switch from sandbox to live SpeedShip quoting, replace the sandbox values in `.env.local` with the production endpoints and credentials:

```text
SPEEDSHIP_API_BASE_URL=https://www.speedship.com/svc
SPEEDSHIP_API_AUTH_URL=https://auth.wwex.com/oauth/token
SPEEDSHIP_API_AUDIENCE=wwex-apig
SPEEDSHIP_API_CLIENT_ID=your_speedship_client_id
SPEEDSHIP_API_CLIENT_SECRET=your_speedship_client_secret
```

If WWEX provides a production API key for the quote flow, you can also set:

```text
SPEEDSHIP_API_KEY=your_speedship_api_key
```

Leave `SPEEDSHIP_API_TOKEN` unset unless WWEX explicitly gives you a direct bearer token. The app already supports the production OAuth flow and will start using the live endpoint after the env file is updated and the server restarts.

## FedEx Freight

FedEx Freight LTL uses backend-only OAuth credentials plus a freight account number. Add these values to `.env.local`:

```text
FEDEX_FREIGHT_BASE_URL=https://apis-sandbox.fedex.com
FEDEX_FREIGHT_AUTH_URL=https://apis-sandbox.fedex.com/oauth/token
FEDEX_FREIGHT_CLIENT_ID=your_fedex_client_id
FEDEX_FREIGHT_CLIENT_SECRET=your_fedex_client_secret
FEDEX_FREIGHT_ACCOUNT_NUMBER=your_fedex_freight_account_number
```

For production FedEx Freight, switch the base URL and token URL to:

```text
FEDEX_FREIGHT_BASE_URL=https://apis.fedex.com
FEDEX_FREIGHT_AUTH_URL=https://apis.fedex.com/oauth/token
```

FedEx Freight rate replies can include transit days and estimated delivery dates, which the app will display in the rate cards.

## Current Capabilities

- Email/password login
- Customer-scoped permissions
- Add customers
- Save tariff rules
- Create demo quotes
- Apply fixed or percentage markup
- Create local bookings from quoted rates
- Create draft invoices from bookings
- Store all business data in PostgreSQL when `DATABASE_URL` is set
- Optionally call Mothership sandbox quotes when the backend token is configured
- Optionally call SpeedShip LTL sandbox quotes when SpeedShip credentials are configured
- Optionally call FedEx Freight quotes when the backend FedEx credentials are configured

## Current Safety Defaults

- Quote mode defaults to demo rates.
- Booking defaults to local-only booking.
- Mothership booking is only available when you explicitly select Mothership sandbox in the quote form.
