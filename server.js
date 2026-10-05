const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const SITES_DIR = path.resolve(__dirname, 'sites');

// Keep the public directory explicit and available even on a fresh deployment.
if (!fs.existsSync(SITES_DIR)) {
  fs.mkdirSync(SITES_DIR, { recursive: true });
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(morgan(':remote-addr - :method :url :status :res[content-length] - :response-time ms'));

// Reject malformed or unsafe public paths before Express attempts filesystem access.
app.use((req, res, next) => {
  const requestPath = req.path;
  const segments = requestPath.split('/').filter(Boolean);
  const hasTraversal = segments.some((segment) => segment === '.' || segment === '..');
  const hasBackslash = requestPath.includes('\\');
  const targetsHiddenFile = segments.some((segment) => segment.startsWith('.'));

  if (hasTraversal || hasBackslash || targetsHiddenFile) {
    return res.status(404).json({ error: 'File not found' });
  }

  const resolvedPath = path.resolve(SITES_DIR, `.${requestPath}`);
  if (resolvedPath !== SITES_DIR && !resolvedPath.startsWith(`${SITES_DIR}${path.sep}`)) {
    return res.status(404).json({ error: 'File not found' });
  }

  return next();
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Qveno Hosting Server',
  });
});

app.get('/', (req, res) => {
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Qveno Hosting Server</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f7fb; color: #172033; }
    main { width: min(92vw, 560px); padding: 2.5rem; border: 1px solid #dce3ee; border-radius: 16px; background: #fff; box-shadow: 0 14px 40px rgba(23, 32, 51, .08); }
    h1 { margin: 0 0 1rem; font-size: clamp(1.7rem, 5vw, 2.3rem); }
    p { margin: .7rem 0; line-height: 1.6; }
    .status { color: #16834b; font-weight: 700; }
    @media (prefers-color-scheme: dark) { body { background: #101522; color: #eef3fb; } main { background: #182033; border-color: #2b3853; } }
  </style>
</head>
<body>
  <main>
    <h1>Qveno Hosting Server</h1>
    <p class="status">Server is online</p>
    <p>Powered by Node.js + Express</p>
  </main>
</body>
</html>`);
});

const cacheableExtensions = new Set([
  '.css', '.js', '.mjs', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.svg', '.ico', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.otf',
]);

app.use(express.static(SITES_DIR, {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
  redirect: false,
  setHeaders: (res, filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.html' || extension === '.htm') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (cacheableExtensions.has(extension)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  },
}));

app.use((req, res) => {
  res.status(404).json({ error: 'File not found' });
});

app.use((err, req, res, next) => {
  console.error('Request error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Qveno Hosting Server listening on http://${HOST}:${PORT}`);
});
