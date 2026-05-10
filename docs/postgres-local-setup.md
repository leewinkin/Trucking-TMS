# PostgreSQL Local Setup

This is the recommended local data store for the TMS now.

## Option 1: Local PostgreSQL Install

1. Install PostgreSQL on your computer.
2. Create a database named `trucking_tms`.
3. Create `.env.local` in the repo root with:

```text
DATABASE_URL=postgres://postgres:your_password@localhost:5432/trucking_tms
MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta
MOTHERSHIP_API_TOKEN=your_sandbox_token_here
```

4. Install dependencies:

```powershell
npm.cmd install
```

5. Start the app:

```powershell
npm.cmd run dev
```

## Option 2: Transitional JSON Fallback

If `DATABASE_URL` is not set, the app still falls back to `.local-db.json` so you do not lose the current prototype while setting up PostgreSQL. That fallback is temporary and should not be the long-term storage plan.

## What The App Does Automatically

- Creates the required tables on startup
- Seeds a demo customer and tariff rule if the database is empty
- Keeps quote, shipment, tracking, and invoice records in PostgreSQL

