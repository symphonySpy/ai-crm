'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { notFound, badRequest } = require('../middleware/errors');

/**
 * Reading a lead's conversation, newest first, in windows.
 *
 * Every read here orders by (created_at, id) DESCENDING and limits. The earlier version
 * ordered ascending and limited, which returns the OLDEST rows: once a conversation
 * passed 200 messages the newest ones were cut off, so a returning customer's message
 * never appeared on screen and the AI copilot summarised a stretch of the conversation
 * from weeks earlier. Both looked correct, because both showed real messages from the
 * right customer.
 *
 * `id` is the tie-breaker. created_at is DATETIME(3), and a burst of LINE events can
 * share a millisecond; without a second key the order of those rows is whatever the
 * storage engine returns, and a cursor could skip or repeat them between pages.
 * Uses idx_messages_lead_created (lead_id, created_at).
 */

const CONVERSATION_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const NEWEST_FIRST = [
  ['createdAt', 'DESC'],
  ['id', 'DESC'],
];

/**
 * Fetch one more row than asked for. Whether it came back is the answer to "is there
 * anything older?" — without a second COUNT query, and without the race where a COUNT
 * and a SELECT see different data.
 */
async function window({ where, limit }) {
  const rows = await db.Message.findAll({ where, order: NEWEST_FIRST, limit: limit + 1 });
  const hasOlder = rows.length > limit;
  // Returned oldest-to-newest, which is the order a conversation is read in.
  return { rows: rows.slice(0, limit).reverse(), hasOlder };
}

/** The most recent messages of a lead — what the conversation screen opens on. */
const latestMessages = (leadId, limit = CONVERSATION_PAGE_SIZE) =>
  window({ where: { lead_id: leadId }, limit });

/**
 * Messages strictly older than the `before` message.
 *
 * A cursor rather than ?page=N. New messages keep arriving while someone scrolls back,
 * and every arrival would shift page boundaries by one — page 2 would repeat the last
 * message of page 1, or skip one. A cursor names a fixed point in the conversation.
 */
async function messagesBefore({ leadId, before, limit = CONVERSATION_PAGE_SIZE }) {
  const cursor = await db.Message.findByPk(before, { attributes: ['id', 'lead_id', 'createdAt'] });
  if (!cursor) throw notFound('Message');
  // A cursor from another lead would otherwise quietly return that lead's history under
  // this lead's URL — harmless-looking, and exactly how data ends up on the wrong screen.
  if (cursor.lead_id !== leadId) throw badRequest('Cursor message belongs to another lead');

  return window({
    where: {
      lead_id: leadId,
      [Op.or]: [
        { createdAt: { [Op.lt]: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
      ],
    },
    limit: Math.min(limit, MAX_PAGE_SIZE),
  });
}

/** Inbound and outbound totals for the whole conversation, not for a window of it. */
async function countByDirection(leadId) {
  const rows = await db.Message.findAll({
    where: { lead_id: leadId },
    attributes: ['direction', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'n']],
    group: ['direction'],
    raw: true,
  });
  const counts = { inbound: 0, outbound: 0 };
  for (const row of rows) counts[row.direction] = Number(row.n);
  return counts;
}

module.exports = {
  CONVERSATION_PAGE_SIZE,
  MAX_PAGE_SIZE,
  latestMessages,
  messagesBefore,
  countByDirection,
};
