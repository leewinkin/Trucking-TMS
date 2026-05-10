# Cloud Deployment Notes

The app is now deployment-friendly because the data store can switch to PostgreSQL through `DATABASE_URL`.

## Docker

Build:

```powershell
docker build -t trucking-tms .
```

Run with a database URL:

```powershell
docker run --rm -p 3000:3000 `
  -e DATABASE_URL=postgres://postgres:password@host.docker.internal:5432/trucking_tms `
  -e MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta `
  -e MOTHERSHIP_API_TOKEN=your_token_here `
  trucking-tms
```

## What To Set In Cloud

- `PORT` if the host assigns one
- `DATABASE_URL` for PostgreSQL
- `MOTHERSHIP_API_BASE_URL`
- `MOTHERSHIP_API_TOKEN`

## Important Note

PostgreSQL is now the primary store when `DATABASE_URL` is set. The JSON fallback exists only as a temporary bridge for local transition and should not be used for production.
