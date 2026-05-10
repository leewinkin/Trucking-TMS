# Cloud Deployment Notes

The local prototype is now deployment-friendly because the data file path can be configured with `DATA_FILE_PATH`.

## Docker

Build:

```powershell
docker build -t trucking-tms .
```

Run with a mounted data directory:

```powershell
docker run --rm -p 3000:3000 -v "${PWD}/data:/data" `
  -e DATA_FILE_PATH=/data/local-db.json `
  -e MOTHERSHIP_API_BASE_URL=https://sandbox.api.mothership.com/beta `
  -e MOTHERSHIP_API_TOKEN=your_token_here `
  trucking-tms
```

## What To Set In Cloud

- `PORT` if the host assigns one
- `DATA_FILE_PATH` to a writable path on the host or mounted volume
- `MOTHERSHIP_API_BASE_URL`
- `MOTHERSHIP_API_TOKEN`

## Important Note

This prototype still stores app data in a JSON file. That is fine for early testing, but a real production deployment should move to PostgreSQL or another managed database before you depend on it for live operations.

