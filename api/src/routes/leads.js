'use strict';

const express = require('express');
const { z } = require('zod');
const { LEAD_STAGES, LEAD_SOURCES } = require('../constants/enums');
const { validate } = require('../middleware/validate');
const { ok, created } = require('../lib/api-response');
const leads = require('../services/lead-service');

// Routes are HTTP adapters and nothing else: check the input, call a service, shape a
// response. Every decision about what the system does lives in src/services, so the
// rules can be read — and tested — without an HTTP request in the way.
//
// Each handler wraps its work in try/catch and hands the error to next(). Express 4
// does not forward a rejected promise on its own, so without this a database failure
// becomes a request that never answers instead of a 500 carrying a request id.
const router = express.Router();

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  ownerId: uuid.optional(),
  // Query strings carry text, so the boolean is parsed here rather than left for the
  // service to guess at.
  needsTriage: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped deliberately: an uncapped page size is a denial of service waiting for
  // someone to type ?limit=999999 against a table with thousands of rows.
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['created_at', 'value_thb', 'last_contact_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const createBody = z.object({
  contact_id: uuid,
  company_id: uuid.nullish(),
  owner_id: uuid.nullish(),
  title: z.string().trim().min(1).max(200),
  value_thb: z.number().int().min(0).max(2147483647).default(0),
  source: z.enum(LEAD_SOURCES).default('manual'),
});

const stageBody = z.object({
  stage: z.enum(LEAD_STAGES),
  note: z.string().trim().max(1000).optional(),
});

const ownerBody = z.object({ owner_id: uuid.nullable() });
const noteBody = z.object({ note: z.string().trim().min(1).max(2000) });

router.get('/', validate({ query: listQuery }), async (req, res, next) => {
  try {
    const result = await leads.listLeads(req.query);
    return ok(res, result, `Found ${result.pagination.total} lead(s)`);
  } catch (err) {
    return next(err);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    return ok(res, await leads.pipelineSummary(), 'Pipeline summary');
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    return ok(res, await leads.getLeadDetail(req.params.id), 'Lead detail');
  } catch (err) {
    return next(err);
  }
});

router.post('/', validate({ body: createBody }), async (req, res, next) => {
  try {
    const lead = await leads.createLead({ input: req.body, actor: req.user });
    return created(res, { lead }, 'Lead created');
  } catch (err) {
    return next(err);
  }
});

router.patch(
  '/:id/stage',
  validate({ params: idParam, body: stageBody }),
  async (req, res, next) => {
    try {
      const lead = await leads.changeStage({
        leadId: req.params.id,
        toStage: req.body.stage,
        note: req.body.note,
        actor: req.user,
      });
      return ok(res, { lead }, `Stage changed to ${lead.stage}`);
    } catch (err) {
      return next(err);
    }
  },
);

router.patch(
  '/:id/owner',
  validate({ params: idParam, body: ownerBody }),
  async (req, res, next) => {
    try {
      const lead = await leads.assignOwner({
        leadId: req.params.id,
        ownerId: req.body.owner_id,
        actor: req.user,
      });
      return ok(
        res,
        { lead },
        lead.owner_id ? 'Owner assigned' : 'Owner cleared; lead returned to triage',
      );
    } catch (err) {
      return next(err);
    }
  },
);

router.post(
  '/:id/notes',
  validate({ params: idParam, body: noteBody }),
  async (req, res, next) => {
    try {
      const activity = await leads.addNote({
        leadId: req.params.id,
        note: req.body.note,
        actor: req.user,
      });
      return created(res, { activity }, 'Note added');
    } catch (err) {
      return next(err);
    }
  },
);

module.exports = router;
