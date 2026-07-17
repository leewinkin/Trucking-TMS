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
- Runs an additive Phase 1 organization migration/backfill on startup

## Phase 1 Organization Tables

The startup schema now includes the multi-tenant foundation tables:

- `organizations`
- `organization_users`
- `agent_customer_relationships`

The migration also adds nullable organization ownership fields while keeping the legacy fields in place:

- `quotes.customer_organization_id`
- `quotes.agent_organization_id`
- `quotes.created_by_user_id`
- `quotes.created_by_organization_id`
- `shipments.customer_organization_id`
- `shipments.agent_organization_id`
- `shipments.created_by_user_id`
- `shipments.created_by_organization_id`
- `invoices.customer_organization_id`
- `invoices.agent_organization_id`

Existing `customer_id`, `role`, quote, shipment, and invoice fields remain authoritative during the compatibility period. Current login, quoting, booking, shipment, and invoice behavior should remain unchanged.

## Migration Behavior

On startup, the app runs an idempotent organization migration:

- Creates exactly one internal organization when one does not exist.
- Creates one customer organization per existing customer using `legacy_customer_id` as the stable mapping.
- Creates active organization memberships for current internal and customer users.
- Backfills quote, shipment, and invoice organization ownership from legacy customer IDs.
- Reports records with missing or invalid customer ownership for internal review instead of guessing ownership.

The server logs an `Organization migration summary` with created, updated, skipped, and unresolved counts. Running the app repeatedly should not create duplicate organizations or duplicate active memberships.

## Rollback / Compatibility

Phase 1 is additive. To roll back usage of the new model, keep using the existing legacy fields and ignore `organizationContext` in `/api/me`. Do not drop the new tables until data ownership has been reviewed, because they are used for compatibility backfill and future tenant scoping.
