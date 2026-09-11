'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { ok } = require('../lib/api-response');
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

router.get('/contacts', validate({ query: listQuery }), async (req, res, next) => {
  try {
    const result = await directory.listContacts(req.query);
    return ok(res, result, `Found ${result.pagination.total} contact(s)`);
  } catch (err) {
    return next(err);
  }
});

router.get('/contacts/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const contact = await directory.getContact(req.params.id);
    return ok(res, { contact }, 'Contact detail');
  } catch (err) {
    return next(err);
  }
});

router.get('/companies', validate({ query: listQuery }), async (req, res, next) => {
  try {
    const result = await directory.listCompanies(req.query);
    return ok(res, result, `Found ${result.pagination.total} company(ies)`);
  } catch (err) {
    return next(err);
  }
});

router.get('/companies/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const company = await directory.getCompany(req.params.id);
    return ok(res, { company }, 'Company detail');
  } catch (err) {
    return next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await directory.listActiveUsers();
    return ok(res, { rows: users }, `Found ${users.length} active user(s)`);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
