'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { ok, created } = require('../lib/api-response');
const outbound = require('../services/line-outbound-service');
const conversation = require('../services/conversation-service');
const { notFound } = require('../middleware/errors');
const db = require('../models');

// A lead's conversation: reading it back, sending into it, and the decisions attached to
// sending. Separate from routes/leads.js because this is the one part of the API that
// reaches a customer, and it is worth being able to see all of it in one file.
const router = express.Router();

const uuid = z.string().uuid();

const sendBody = z.object({
  text: z.string().trim().min(1).max(2000),
  // Present when the text came from a copilot draft. Approving the send is what moves
  // that suggestion out of 'proposed' (A22).
  suggestion_id: uuid.nullish(),
});

const olderQuery = z.object({
  // The oldest message the client already has. Required: "messages older than nothing"
  // is the latest window, which GET /api/leads/:id already returns.
  before: uuid,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(conversation.MAX_PAGE_SIZE)
    .default(conversation.CONVERSATION_PAGE_SIZE),
});

// Scrolling back through a long conversation, one window at a time.
router.get(
  '/leads/:id/messages',
  validate({ params: z.object({ id: uuid }), query: olderQuery }),
  async (req, res, next) => {
    try {
      // 404 for an unknown lead rather than an empty page: an empty result would read as
      // "this customer never wrote anything" when the truth is "wrong URL".
      const exists = await db.Lead.count({ where: { id: req.params.id } });
      if (!exists) throw notFound('Lead');

      const { rows, hasOlder } = await conversation.messagesBefore({
        leadId: req.params.id,
        before: req.query.before,
        limit: req.query.limit,
      });
      return ok(res, { rows, hasOlder }, 'Messages');
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/leads/:id/messages',
  validate({ params: z.object({ id: uuid }), body: sendBody }),
  async (req, res, next) => {
    try {
      const result = await outbound.sendReply({
        leadId: req.params.id,
        text: req.body.text,
        suggestionId: req.body.suggestion_id || null,
        actor: req.user,
        log: req.log,
      });

      // 201 either way: the message exists and is on the timeline. Whether LINE accepted
      // it yet is a property of the message, not of the request — and a failed send that
      // returned an error status would invite the client to retry, creating a second
      // message for the same intent.
      return created(
        res,
        { message: result.message },
        result.delivered ? 'Message sent' : 'Message saved but delivery failed; it will be retried',
      );
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/ai-suggestions/:id/reject',
  validate({ params: z.object({ id: uuid }) }),
  async (req, res, next) => {
    try {
      const suggestion = await outbound.rejectSuggestion({
        suggestionId: req.params.id,
        actor: req.user,
      });
      return ok(res, { suggestion }, 'Suggestion rejected');
    } catch (err) {
      return next(err);
    }
  },
);

module.exports = router;
