// middleware/errorHandler.js

// Wrap async route handlers to auto-catch errors
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Global error handler (register last in Express)
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Duplicate entry',
      detail: err.detail || 'A record with that identifier already exists.',
    });
  }
  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Referenced record not found',
      detail: err.detail,
    });
  }
  // PostgreSQL check constraint
  if (err.code === '23514') {
    return res.status(400).json({
      error: 'Invalid value for field',
      detail: err.detail,
    });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// 404 handler
const notFound = (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
};

module.exports = { asyncHandler, errorHandler, notFound };
