'use strict';

const express = require('express');
const { z } = require('zod');
const { LEAD_STAGES, LEAD_SOURCES } = require('../constants/enums');
const { validate } = require('../middleware/validate');
const leads = require('../services/lead-service');

// Routes are HTTP adapters and nothing else: check the input, call a service, shape a
// response. Every decision about what the system does lives in src/services, so the
// rules can be read — and tested — without an HTTP request in the way.
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

// Express 4 does not forward a rejected promise to the error handler, so every async
// handler is wrapped. Without this a database failure becomes a hung request instead of
// a 500 with a request id.
const route = (handler) => (req, res, next) => handler(req, res, next).catch(next);

router.get(
  '/',
  validate({ query: listQuery }),
  route(async (req, res) => res.json(await leads.listLeads(req.query))),
);

router.get(
  '/summary',
  route(async (req, res) => res.json(await leads.pipelineSummary())),
);

router.get(
  '/:id',
  validate({ params: idParam }),
  route(async (req, res) => res.json(await leads.getLeadDetail(req.params.id))),
);

router.post(
  '/',
  validate({ body: createBody }),
  route(async (req, res) => {
    const lead = await leads.createLead({ input: req.body, actor: req.user });
    res.status(201).json({ lead });
  }),
);

router.patch(
  '/:id/stage',
  validate({ params: idParam, body: stageBody }),
  route(async (req, res) => {
    const lead = await leads.changeStage({
      leadId: req.params.id,
      toStage: req.body.stage,
      note: req.body.note,
      actor: req.user,
    });
    res.json({ lead });
  }),
);

router.patch(
  '/:id/owner',
  validate({ params: idParam, body: ownerBody }),
  route(async (req, res) => {
    const lead = await leads.assignOwner({
      leadId: req.params.id,
      ownerId: req.body.owner_id,
      actor: req.user,
    });
    res.json({ lead });
  }),
);

router.post(
  '/:id/notes',
  validate({ params: idParam, body: noteBody }),
  route(async (req, res) => {
    const activity = await leads.addNote({
      leadId: req.params.id,
      note: req.body.note,
      actor: req.user,
    });
    res.status(201).json({ activity });
  }),
);

module.exports = router;
