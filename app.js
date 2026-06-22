require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const healthRoute = require('./routes/health');
const authRoute = require('./routes/auth');
const generateRoute = require('./routes/generate');
const followUpRoute = require('./routes/followUp');
const historyRoute = require('./routes/history');
const { errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');

function createApp() {
  const app = express();

  // Vercel (and most PaaS) sit behind a reverse proxy — trust the first hop
  // so express-rate-limit and req.ip see the real client IP.
  app.set('trust proxy', 1);

  // ── Logging ──
  app.use(
    morgan(process.env.NODE_ENV === 'test' ? 'dev' : 'combined', {
      skip: () => process.env.NODE_ENV === 'test'
    })
  );

  // ── CORS ──
  // In production, restrict to a known origin via CORS_ORIGIN. Defaults to
  // open ('*') for local development convenience. credentials: true is required
  // so the browser will send/accept the httpOnly auth cookie cross-origin (it's
  // a no-op for the default same-origin deployment).
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: corsOrigin, credentials: true }));

  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  // ── Rate limiting ──
  // Applies to the AI-calling routes (expensive / abusable) and to auth
  // (brute-force protection on login/signup). History reads/deletes are left
  // unrestricted since they're cheap, authenticated, and user-scoped already.
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.AI_RATE_LIMIT_MAX) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in a few minutes.' }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in a few minutes.' }
  });

  // ── Routes ──
  app.use('/health', healthRoute);
  app.use('/api/auth/signup', authLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth', authRoute);
  app.use('/api/generate', aiLimiter, requireAuth, generateRoute);
  app.use('/api/follow-up', aiLimiter, requireAuth, followUpRoute);
  app.use('/api/history', requireAuth, historyRoute);

  // ── Catch-all: serve index.html for any unknown (non-API) routes ──
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ── Centralized error handler (must be last) ──
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
