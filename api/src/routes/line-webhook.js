'use strict';

const express = require('express');
const { verifyLineSignature } = require('../lib/line/signature');
const { processEvent } = require('../services/line-inbound-service');

const router = express.Router();

/**
 * LINE Messaging API webhook.
 *
 * Mounted BEFORE express.json in app.js, with express.raw here, because the signature is
 * computed over the exact bytes LINE sent. A parsed and re-serialised body differs by
 * whitespace and key order, so verification would never pass — and the tempting fix for
 * that is to switch verification off.
 */
router.post(
  '/',
  express.raw({ type: '*/*', limit: '2mb' }),
  async (req, res) => {
    const signature = req.get('x-line-signature');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    let valid;
    try {
      valid = verifyLineSignature({
        rawBody,
        signature,
        channelSecret: process.env.LINE_CHANNEL_SECRET,
      });
    } catch (err) {
      // Thrown only when the secret is missing. That is a deployment fault, not a bad
      // request, and it must not be reported as "your signature was wrong".
      req.log.error({ err: err.message }, 'LINE webhook is not configured');
      return res.status(500).json({ success: false, code: 500, message: 'Webhook not configured' });
    }

    if (!valid) {
      // Nothing is persisted for a request that fails verification — an unauthenticated
      // caller must not be able to write rows into this system, not even log rows.
      req.log.warn({ ip: req.ip, hasSignature: Boolean(signature) }, 'LINE signature rejected');
      return res.status(401).json({ success: false, code: 401, message: 'Invalid signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      req.log.warn('LINE webhook body was not valid JSON');
      return res.status(400).json({ success: false, code: 400, message: 'Malformed body' });
    }

    const events = Array.isArray(payload.events) ? payload.events : [];

    // A31: acknowledge first, work second. LINE treats a slow response as a failure and
    // redelivers, so doing the database work before answering turns one slow event into
    // a retry storm. The events are already in hand; processing them after the response
    // cannot lose them, and every one is written to line_webhook_events before anything
    // else happens to it.
    res.status(200).json({ success: true, code: 200, message: 'Accepted', data: { received: events.length } });

    for (const event of events) {
      try {
        await processEvent({ event, destination: payload.destination, log: req.log });
      } catch (err) {
        // processEvent records its own failures; this catch exists so one bad event
        // cannot abandon the rest of the batch.
        req.log.error({ err, webhookEventId: event.webhookEventId }, 'unhandled LINE event error');
      }
    }
  },
);

module.exports = router;
