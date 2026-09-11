'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const directory = require('../services/directory-service');

// Contacts, companies and users — the reference data the lead screens hang off.
const router = express.Router();

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const route = (handler) => (req, res, next) => handler(req, res, next).catch(next);

router.get(
  '/contacts',
  validate({ query: listQuery }),
  route(async (req, res) => res.json(await directory.listContacts(req.query))),
);

router.get(
  '/contacts/:id',
  validate({ params: idParam }),
  route(async (req, res) => res.json({ contact: await directory.getContact(req.params.id) })),
);

router.get(
  '/companies',
  validate({ query: listQuery }),
  route(async (req, res) => res.json(await directory.listCompanies(req.query))),
);

router.get(
  '/companies/:id',
  validate({ params: idParam }),
  route(async (req, res) => res.json({ company: await directory.getCompany(req.params.id) })),
);

router.get(
  '/users',
  route(async (req, res) => res.json({ data: await directory.listActiveUsers() })),
);

module.exports = router;
