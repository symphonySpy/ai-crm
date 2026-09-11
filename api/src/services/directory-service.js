'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { notFound } = require('../middleware/errors');

/**
 * Paginated, searchable list of reference data.
 *
 * A14: deactivated rows are hidden by default rather than deleted, so the everyday list
 * shows what is current while the history behind it stays intact and reachable.
 */
async function list(Model, { q, includeInactive, page, limit, searchFields, include = [] }) {
  const where = {};
  if (!includeInactive) where.is_active = true;
  if (q) {
    const like = { [Op.like]: `%${q}%` };
    where[Op.or] = searchFields.map((field) => ({ [field]: like }));
  }

  const { rows, count } = await Model.findAndCountAll({
    where,
    include,
    order: [['name', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return {
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  };
}

const listContacts = (params) =>
  list(db.Contact, {
    ...params,
    searchFields: ['name', 'phone', 'email'],
    include: [{ model: db.Company, as: 'company', attributes: ['id', 'name'] }],
  });

const listCompanies = (params) =>
  list(db.Company, { ...params, searchFields: ['name', 'industry'] });

async function getContact(id) {
  const contact = await db.Contact.findByPk(id, {
    include: [
      { model: db.Company, as: 'company', attributes: ['id', 'name', 'industry'] },
      {
        model: db.Lead,
        as: 'leads',
        attributes: ['id', 'title', 'stage', 'value_thb', 'created_at'],
      },
    ],
  });
  if (!contact) throw notFound('Contact');
  return contact;
}

async function getCompany(id) {
  const company = await db.Company.findByPk(id, {
    include: [{ model: db.Contact, as: 'contacts', attributes: ['id', 'name', 'phone'] }],
  });
  if (!company) throw notFound('Company');
  return company;
}

/**
 * Active users, for the owner dropdown.
 *
 * The attribute list is explicit rather than "everything except the hash". Naming what
 * goes out means a column added later — a personal phone number, a note — does not
 * silently start appearing in an endpoint every signed-in user can read.
 */
const listActiveUsers = () =>
  db.User.findAll({
    where: { is_active: true },
    attributes: ['id', 'name', 'email', 'role'],
    order: [['name', 'ASC']],
  });

module.exports = { listContacts, listCompanies, getContact, getCompany, listActiveUsers };
