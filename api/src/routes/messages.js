'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { ok, created } = require('../lib/api-response');
const outbound = require('../services/line-outbound-service');

// Outbound messaging and the decisions attached to it. Separate from routes/leads.js
// because this is the one part of the API that reaches a customer, and it is worth being
// able to see all of it in one file.
const router = express.Router();

const uuid = z.string().uuid();

const sendBody = z.object({
  text: z.string().trim().min(1).max(2000),
  // Present when the text came from a copilot draft. Approving the send is what moves
  // that suggestion out of 'proposed' (A22).
  suggestion_id: uuid.nullish(),
});

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
