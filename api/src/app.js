'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./models');
const { requestContext } = require('./middleware/request-context');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { attachUser, requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const directoryRoutes = require('./routes/directory');

function createApp() {
  const app = express();

  // Running behind a platform proxy (Railway, Render). Without this, req.ip is the
  // proxy's address, which would make the login rate limiter treat every user in the
  // world as one client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);

  // NOTE for the LINE webhook, which is not mounted yet: its route must parse the RAW
  // body, because the signature is computed over the exact bytes LINE sent. Mounting
  // express.json() ahead of it would leave verification comparing a re-serialised copy,
  // which never matches — and the tempting "fix" for that is to disable verification.
  // The webhook router therefore installs express.raw() on its own path, before this.
  app.use(express.json({ limit: '1mb' }));

  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required: session cookies cannot be signed without it');
  }
  app.use(cookieParser(process.env.SESSION_SECRET));
  app.use(attachUser);

  // Liveness only. It deliberately does not touch the database: a health check that
  // fails when the database is briefly unreachable invites the platform to restart a
  // process that is working fine.
  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // Readiness, which does check the database, because "ready to serve traffic" is
  // exactly the question that depends on it.
  app.get('/ready', async (req, res) => {
    try {
      await db.sequelize.authenticate();
      res.json({ status: 'ready' });
    } catch (err) {
      req.log.error({ err }, 'readiness check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/leads', requireAuth, leadRoutes);
  app.use('/api', requireAuth, directoryRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
