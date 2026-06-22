// Centralized error handler. Routes call next(err) (or throw inside an
// async wrapper) and this formats a consistent JSON error response while
// keeping logging in one place.
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path}:`, err);
  } else {
    console.warn(`[warn] ${req.method} ${req.path}: ${err.message}`);
  }

  res.status(status).json({ error: err.message || 'Internal server error.' });
}

// Wraps an async route handler so rejected promises are forwarded to
// errorHandler via next(), instead of needing try/catch in every route.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
