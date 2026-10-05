# Qveno Hosting Server

A Node.js + Express server that publicly serves files from `sites/` and provides a protected HTML upload API for the Qveno main website.

## Features

- Static hosting from `sites/`
- Status page at `/`
- JSON health check at `/health`
- Authenticated `POST /api/upload` endpoint
- Only `.html` and `.htm` uploads
- 10 MB upload limit
- Safe filename validation and path-traversal protection
- Duplicate filenames are rejected instead of overwritten
- CORS, compression, Helmet security headers, and request logging
- Render-compatible `PORT` and `0.0.0.0` binding

## Project structure

```text
qveno-hosting-server/
├── server.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
├── .github/
│   └── workflows/
│       └── keep-alive.yml
└── sites/
    └── index.html
```

## Local installation

Requirements: Node.js 18 or newer and npm.

```bash
npm install
QVENO_UPLOAD_API_KEY=replace-with-a-long-random-secret npm start
```

The server listens on `http://localhost:3000`. Override the port with `PORT=8080` if needed.

## Public routes

- `GET /` — status page
- `GET /health` — health JSON
- `GET /index.html` — static file from `sites/index.html`
- `GET /filename.html` — static file from `sites/filename.html`

## Upload API

### Authentication

Set this environment variable on the server:

```text
QVENO_UPLOAD_API_KEY=your-long-random-secret
```

Clients must send it as a Bearer token. Never expose the key in browser JavaScript or commit it to GitHub.

### Request

```bash
curl -X POST https://qveno.onrender.com/api/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@portfolio.html" \
  -F "filename=portfolio.html" \
  -F "projectName=My Portfolio"
```

The `file` field is required. `filename` is optional and defaults to the uploaded file's original name. `projectName` is accepted for client compatibility but is not used as a filesystem path.

### Successful response

```json
{
  "success": true,
  "filename": "portfolio.html",
  "url": "https://qveno.onrender.com/portfolio.html"
}
```

The returned file is immediately available at the returned URL. A filename that already exists returns HTTP `409` and is never overwritten.

### Error responses

```json
{"success":false,"error":"Unauthorized"}
```

```json
{"success":false,"error":"Invalid file type or filename"}
```

```json
{"success":false,"error":"File too large"}
```

The API rejects missing or invalid Bearer tokens, path traversal, absolute paths, hidden files, unsafe characters, non-HTML extensions, files larger than 10 MB, and duplicate filenames.

## CORS

For development, an unset `ALLOWED_ORIGINS` allows all origins. For production, set a comma-separated list of trusted origins:

```text
ALLOWED_ORIGINS=https://your-qveno-main-website.example
```

You can optionally set `PUBLIC_BASE_URL=https://qveno.onrender.com` to force a stable public URL. If it is unset, the API builds the URL from the actual request host.

## Render deployment

Render settings:

| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Plan | Free or your preferred plan |

In the Render dashboard for the `qveno` service, add these environment variables:

```text
QVENO_UPLOAD_API_KEY=<strong-random-secret>
ALLOWED_ORIGINS=https://your-qveno-main-website.example
PUBLIC_BASE_URL=https://qveno.onrender.com
```

Render supplies `PORT` automatically. The server binds to `0.0.0.0`.

## Important storage limitation

This implementation writes uploads to the Render service's local `sites/` directory, as required by the initial API specification. Render Free instances have ephemeral filesystems: files can be lost after a service restart, redeploy, or instance replacement. For durable production uploads, replace the disk write with Cloudflare R2, Amazon S3, or another persistent object-storage service.

## Security notes

- Keep `QVENO_UPLOAD_API_KEY` only in Render and your main website backend environment.
- Do not call the upload API directly from untrusted browser code with the secret.
- Route uploads through your main website backend, which authenticates the user and adds the Bearer token server-side.
- This API intentionally accepts only HTML files; CSS, JavaScript, images, and project bundles are not accepted by this first version.
