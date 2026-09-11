'use strict';

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { ok, created } = require('../lib/api-response');
const copilot = require('../services/ai-copilot-service');

const router = express.Router();

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

// A20: every call costs money at the provider, and a button is easy to hold down.
// Twenty generations per user per five minutes is far above real use and far below
// anything that would produce a surprising bill.
const generateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Per user rather than per IP: an office behind one address would otherwise share
  // a single allowance between everyone in it. The unauthenticated fallback goes
  // through ipKeyGenerator, which groups an IPv6 address by its /64 prefix — a raw
  // req.ip would let one client rotate through the addresses it already owns.
  keyGenerator: (req) => (req.user ? req.user.id : ipKeyGenerator(req.ip)),
  message: {
    success: false,
    code: 429,
    message: 'ขอคำแนะนำถี่เกินไป กรุณารอสักครู่',
    errors: null,
    data: null,
  },
});

router.post(
  '/leads/:id/ai-suggestions',
  generateLimiter,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const suggestion = await copilot.generateSuggestion({
        leadId: req.params.id,
        actor: req.user,
        log: req.log,
      });

      // 201 whether or not the model answered. A degraded suggestion is still a real
      // suggestion that was created and stored; reporting it as an error would invite
      // the client to retry into an outage that has not ended.
      return created(
        res,
        { suggestion },
        suggestion.degraded
          ? 'สร้างคำแนะนำในโหมดสำรอง (ไม่ได้ใช้โมเดลภาษา และไม่มีร่างข้อความ)'
          : 'สร้างคำแนะนำแล้ว รอการอนุมัติ',
      );
    } catch (err) {
      return next(err);
    }
  },
);

router.get(
  '/leads/:id/ai-suggestions',
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const rows = await copilot.listForLead(req.params.id);
      return ok(res, { rows }, `พบคำแนะนำ ${rows.length} รายการ`);
    } catch (err) {
      return next(err);
    }
  },
);

module.exports = router;
