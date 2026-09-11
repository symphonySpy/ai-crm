'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./models');
const { requestContext } = require('./middleware/request-context');
const { restLog, captureMount } = require('./middleware/rest-log');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { attachUser, requireAuth } = require('./middleware/auth');
const { ok, fail } = require('./lib/api-response');
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

  // Records every API call to rest_log — request, response, status, duration. Mounted
  // after attachUser so the row knows who called, and after express.json so it sees the
  // parsed body. Writes happen once the response has been sent (middleware/rest-log.js).
  app.use(restLog);

  // Liveness only. It deliberately does not touch the database: a health check that
  // fails when the database is briefly unreachable invites the platform to restart a
  // process that is working fine.
  app.get('/health', (req, res) => ok(res, { uptime: process.uptime() }, 'Service is alive'));

  // Readiness, which does check the database, because "ready to serve traffic" is
  // exactly the question that depends on it.
  app.get('/ready', async (req, res) => {
    try {
      await db.sequelize.authenticate();
      return ok(res, { database: 'reachable' }, 'Ready to serve traffic');
    } catch (err) {
      req.log.error({ err }, 'readiness check failed');
      return fail(res, {
        code: 503,
        message: 'Database is unreachable',
        requestId: req.id,
      });
    }
  });

  // captureMount records where each router is mounted while req.baseUrl is still set;
  // see middleware/rest-log.js for why that has to happen on the way in.
  app.use('/api/auth', captureMount, authRoutes);
  app.use('/api/leads', captureMount, requireAuth, leadRoutes);
  app.use('/api', captureMount, requireAuth, directoryRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
