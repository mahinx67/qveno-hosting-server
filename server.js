const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const SITES_DIR = path.resolve(__dirname, 'sites');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

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
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(morgan(':remote-addr - :method :url :status :res[content-length] - :response-time ms'));
app.use(express.json({ limit: '100kb' }));

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

function apiError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

function hasValidApiKey(req) {
  const configuredKey = process.env.QVENO_UPLOAD_API_KEY;
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!configuredKey || !match) return false;

  const suppliedKey = Buffer.from(match[1]);
  const expectedKey = Buffer.from(configuredKey);
  return suppliedKey.length === expectedKey.length
    && crypto.timingSafeEqual(suppliedKey, expectedKey);
}

function sanitizeFilename(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 180) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed !== path.basename(trimmed) || /[\\/]/.test(trimmed)) return null;
  if (trimmed.startsWith('.') || trimmed.includes('..')) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) return null;

  const extension = path.extname(trimmed).toLowerCase();
  if (extension !== '.html' && extension !== '.htm') return null;
  return trimmed;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 3 },
});

app.post('/api/upload', (req, res, next) => {
  if (!hasValidApiKey(req)) return apiError(res, 401, 'Unauthorized');

  return upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return apiError(res, 413, 'File too large');
      return apiError(res, 400, 'Invalid upload');
    }
    if (err) return next(err);
    if (!req.file) return apiError(res, 400, 'A file is required');

    const requestedFilename = req.body.filename || req.file.originalname;
    const filename = sanitizeFilename(requestedFilename);
    if (!filename) return apiError(res, 400, 'Invalid file type or filename');

    const filePath = path.resolve(SITES_DIR, filename);
    if (filePath !== SITES_DIR && !filePath.startsWith(`${SITES_DIR}${path.sep}`)) {
      return apiError(res, 400, 'Invalid filename');
    }

    try {
      fs.writeFileSync(filePath, req.file.buffer, { flag: 'wx', mode: 0o644 });
    } catch (writeError) {
      if (writeError.code === 'EEXIST') {
        return apiError(res, 409, 'A file with this name already exists.');
      }
      console.error('Upload error:', writeError.message);
      return apiError(res, 500, 'Unable to save file');
    }

    const baseUrl = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({
      success: true,
      filename,
      url: `${baseUrl}/${encodeURIComponent(filename)}`,
    });
  });
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
  if (req.path.startsWith('/api/')) return apiError(res, 500, 'Internal server error');
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Qveno Hosting Server listening on http://${HOST}:${PORT}`);
});
