# Qveno Hosting Server

A small production-ready Node.js + Express server that publicly serves files placed in the `sites/` directory. It is designed for direct deployment to Render and does not include an upload API, database, or authentication system.

## What it does

- Serves every non-hidden file inside `sites/` at the same URL path.
- Provides a simple server status page at `/`.
- Provides a JSON health check at `/health`.
- Returns a JSON 404 response when a file does not exist.
- Blocks directory traversal, hidden files, and access outside `sites/`.
- Adds security headers, CORS, compression, request logging, and sensible cache headers.

## Project structure

```text
qveno-hosting-server/
├── server.js
├── package.json
├── .gitignore
├── README.md
└── sites/
    └── index.html
```

## Local installation

Requirements: Node.js 18 or newer and npm.

```bash
cd qveno-hosting-server
npm install
npm start
```

The server listens on `http://localhost:3000` locally. You can override the port:

```bash
PORT=8080 npm start
```

The server binds to `0.0.0.0`, which is required by Render.

## Local URLs

- Status page: `http://localhost:3000/`
- Health check: `http://localhost:3000/health`
- Sample hosted file: `http://localhost:3000/index.html`

## Add hosted files

Put files inside `sites/` and preserve the URL path you want. For example:

```text
sites/hello.html
sites/portfolio.html
sites/css/style.css
sites/assets/logo.png
```

They become available at:

```text
http://localhost:3000/hello.html
http://localhost:3000/portfolio.html
http://localhost:3000/css/style.css
http://localhost:3000/assets/logo.png
```

After deployment, replace the local origin with your Render domain:

```text
https://YOUR-RENDER-DOMAIN.onrender.com/hello.html
```

Only files already present in `sites/` are served. This first version intentionally does not provide a file-upload endpoint.

## CORS configuration

For development, when `ALLOWED_ORIGINS` is not set, all origins are allowed. In production, set a comma-separated list of trusted origins in Render, for example:

```text
ALLOWED_ORIGINS=https://your-qveno-frontend.example,https://www.example.com
```

## Deploy to Render

### Option A: deploy from GitHub

1. Create a new GitHub repository, for example `qveno-hosting-server`.
2. From this project directory, run:

   ```bash
   git init
   git add .
   git commit -m "Initial Qveno hosting server"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/qveno-hosting-server.git
   git push -u origin main
   ```

3. In the Render dashboard, choose **New +** → **Web Service**.
4. Connect the GitHub repository.
5. Use these settings:

   | Setting | Value |
   |---|---|
   | Environment | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance type | Your preferred Render plan |

6. Optionally add `ALLOWED_ORIGINS` under **Environment Variables**.
7. Click **Create Web Service**. Render supplies `PORT` automatically; the server uses it.

### Option B: deploy with Render Blueprint

Create a `render.yaml` in the repository if you want infrastructure-as-code. It is not required for this project; the dashboard settings above are sufficient.

## Security notes

- Keep secrets out of the repository; `.env` is ignored by Git.
- Hidden files and dot-directories are not publicly served.
- `package.json`, `server.js`, and other project files are outside `sites/` and therefore are not exposed as static content.
- Do not add an unrestricted upload endpoint without authentication, authorization, file-size limits, and content validation.

## Future API extension

Future routes can be added in separate modules (for example `routes/projects.js` and `routes/uploads.js`) and mounted before the static middleware. Add authentication and authorization before enabling any write operation. The current server remains intentionally read-only.
