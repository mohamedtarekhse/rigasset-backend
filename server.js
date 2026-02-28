// server.js  –  RigAsset Pro API Server
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const fs           = require('fs');
const { pool }     = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// ── Routes ───────────────────────────────────────────────────
const authRoutes          = require('./routes/auth');
const assetsRoutes        = require('./routes/assets');
const rigsRoutes          = require('./routes/rigs');
const companiesRoutes     = require('./routes/companies');
const contractsRoutes     = require('./routes/contracts');
const maintenanceRoutes   = require('./routes/maintenance');
const transfersRoutes     = require('./routes/transfers');
const bomRoutes           = require('./routes/bom');
const usersRoutes         = require('./routes/users');
const notificationsRoutes = require('./routes/notifications');
const dashboardRoutes     = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & Parsing ───────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "https:"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      upgradeInsecureRequests: []
    }
  }
}));

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate Limiting ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Health Check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status:    'ok',
      service:   'RigAsset Pro API',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      db:        'connected',
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── API Routes ───────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/assets',        assetsRoutes);
app.use('/api/rigs',          rigsRoutes);
app.use('/api/companies',     companiesRoutes);
app.use('/api/contracts',     contractsRoutes);
app.use('/api/maintenance',   maintenanceRoutes);
app.use('/api/transfers',     transfersRoutes);
app.use('/api/bom',           bomRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/notifications', notificationsRoutes);

// ── API index ────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'RigAsset Pro API',
    version: '1.0.0',
    endpoints: [
      'POST   /api/auth/login',
      'POST   /api/auth/register',
      'POST   /api/auth/refresh',
      'POST   /api/auth/logout',
      'GET    /api/auth/me',
      'GET    /api/dashboard',
      'GET    /api/assets',
      'GET    /api/assets/summary',
      'GET    /api/assets/by-rig',
      'GET    /api/assets/:id',
      'POST   /api/assets',
      'PUT    /api/assets/:id',
      'DELETE /api/assets/:id',
      'GET    /api/assets/:id/history',
      'GET    /api/rigs',
      'GET    /api/rigs/:id',
      'POST   /api/rigs',
      'PUT    /api/rigs/:id',
      'DELETE /api/rigs/:id',
      'GET    /api/companies',
      'POST   /api/companies',
      'PUT    /api/companies/:id',
      'DELETE /api/companies/:id',
      'GET    /api/contracts',
      'GET    /api/contracts/expiring',
      'POST   /api/contracts',
      'PUT    /api/contracts/:id',
      'DELETE /api/contracts/:id',
      'GET    /api/maintenance',
      'GET    /api/maintenance/alerts',
      'GET    /api/maintenance/by-rig',
      'GET    /api/maintenance/:id',
      'POST   /api/maintenance',
      'PUT    /api/maintenance/:id',
      'POST   /api/maintenance/:id/complete',
      'GET    /api/maintenance/:id/logs',
      'DELETE /api/maintenance/:id',
      'GET    /api/transfers',
      'POST   /api/transfers',
      'POST   /api/transfers/:id/approve-ops',
      'POST   /api/transfers/:id/approve-mgr',
      'DELETE /api/transfers/:id',
      'GET    /api/bom',
      'GET    /api/bom/tree/:assetId',
      'POST   /api/bom',
      'PUT    /api/bom/:id',
      'DELETE /api/bom/:id',
      'GET    /api/users',
      'GET    /api/users/:id',
      'POST   /api/users',
      'PUT    /api/users/:id',
      'DELETE /api/users/:id',
      'GET    /api/notifications',
      'PUT    /api/notifications/read-all',
      'DELETE /api/notifications',
    ],
  });
});

// ── Web root ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.type('html').send('<!doctype html><html><head><meta charset="utf-8"><title>RigAsset Pro API</title></head><body><h1>RigAsset Pro API</h1><p>Service is running.</p></body></html>');
});

// ── Error handling ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 RigAsset Pro API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   API index   : http://localhost:${PORT}/api\n`);
});

module.exports = app;
