# Trucking TMS Starter

This workspace is the starting point for a company-use trucking shipment ordering TMS.

The first build should focus on a clean MVP:

- Customer accounts and user login
- Admin customer management
- Customer-specific tariff rules
- Customer-scoped permissions
- Shipment quoting through your backend
- Booking through Mothership
- Tracking lookup
- Invoice display and download

## Important Security Rule

Do not put Mothership, Speedship, Priority1, or any carrier API token in frontend code.

The frontend should call your own backend. Your backend stores carrier tokens in environment variables, calls each carrier API, normalizes the response, applies your customer tariff, and returns only customer-safe data to the frontend.

## Suggested First Stack

Recommended starting stack:

- Frontend: Next.js or React
- Backend: Node.js/Express, NestJS, or Next.js API routes for MVP
- Database: PostgreSQL
- Auth: Clerk, Auth0, Supabase Auth, or custom email/password
- File storage: S3-compatible storage for invoice PDFs and documents

For a first version, I recommend keeping frontend and backend in one app until the workflows are proven.

## First Milestone

Build a working quote-to-book flow for Mothership only:

1. Admin signs in and creates a customer.
2. Admin sets that customer's tariff rule.
3. Customer signs in and submits shipment details.
4. Backend requests your cost from Mothership.
5. Backend applies the customer's tariff.
6. Customer sees the final sell rate.
7. Customer books the shipment.
8. Customer can view booking status and tracking.

Speedship and Priority1 should be added later behind the same internal carrier adapter interface.

## Files

- `docs/mvp-blueprint.md`: MVP scope, roles, screens, workflows, and data model.
- `docs/api-integration-checklist.md`: What to collect from each API before integration.
- `docs/mothership-integration.md`: Mothership-specific endpoints, backend contracts, and risks.
- `docs/first-build-checklist.md`: First implementation phases.
- `docs/local-development.md`: How to run the local prototype.
- `docs/postgres-local-setup.md`: Local PostgreSQL setup and migration notes.
- `docs/cloud-deployment.md`: Docker and cloud deployment notes.
- `.env.example`: Safe environment variable template for backend secrets.
- `Dockerfile`: Container image for cloud deploys.
- `.dockerignore`: Files excluded from the container build.

## Run Locally

```powershell
npm.cmd run dev
```

Then open `http://localhost:3000`.
