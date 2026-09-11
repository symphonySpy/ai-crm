'use strict';

const { AUDITED_TABLES, isAuditable } = require('../constants/audit');

const serialise = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

/**
 * Record every update and soft delete into tbl_audit_history.
 *
 * Runs as an afterUpdate hook inside the caller's transaction when there is one, so the
 * audit entry and the change it describes either both land or neither does. An entry
 * that survived a rolled-back update would describe something that never happened.
 *
 * Pass the acting user through the query options:
 *
 *   await lead.update({ owner_id: id }, { actorId: req.user.id, transaction: t });
 *
 * A missing actorId is recorded as null, meaning "the system did this" — the same
 * convention as activities.actor_id, and deliberately not an error.
 *
 * KNOWN LIMIT: Model.update({...}, { where }) issues a bulk UPDATE and does not fire
 * instance hooks, so those changes would go unaudited. The beforeBulkUpdate guard below
 * throws outside production rather than letting the gap pass silently.
 */
function attachAuditHistory(db) {
  for (const tableName of AUDITED_TABLES) {
    const model = Object.values(db).find(
      (m) => m && m.tableName === tableName && typeof m.addHook === 'function',
    );
    if (!model) throw new Error(`audit history: no model found for table "${tableName}"`);

    const primaryKey = model.primaryKeyAttribute;

    model.addHook('afterUpdate', async (instance, options) => {
      const oldJson = {};
      const newJson = {};

      for (const field of Object.keys(instance.rawAttributes)) {
        if (!isAuditable(field) || !instance.changed(field)) continue;
        const before = serialise(instance.previous(field));
        const after = serialise(instance.get(field));
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        oldJson[field] = before;
        newJson[field] = after;
      }
      if (!Object.keys(newJson).length) return;

      // Flipping is_active is a deletion in every sense that matters to a user, so it
      // is filed as one rather than hiding inside a generic edit.
      let action = 'update';
      if (Object.prototype.hasOwnProperty.call(newJson, 'is_active')) {
        action = newJson.is_active ? 'restore' : 'soft_delete';
      }

      await db.AuditHistory.create(
        {
          table_name: tableName,
          entity_id: String(instance.get(primaryKey)),
          action,
          old_json: oldJson,
          new_json: newJson,
          changed_by: options.actorId || null,
          changed_at: new Date(),
        },
        { transaction: options.transaction },
      );
    });

    model.addHook('beforeBulkUpdate', (options) => {
      if (options.individualHooks) return;
      // options.fields is an ARRAY of attribute names here, while options.attributes
      // holds the values. Reading Object.keys() off the array yields indices, which is
      // how an earlier version of this guard silently matched nothing.
      const touched = [
        ...(Array.isArray(options.fields) ? options.fields : Object.keys(options.fields || {})),
        ...Object.keys(options.attributes || {}),
      ];
      const auditable = [...new Set(touched)].filter(isAuditable);
      if (auditable.length && process.env.NODE_ENV !== 'production') {
        throw new Error(
          `audit history: bulk update on "${tableName}" touches auditable field(s) ` +
            `${auditable.join(', ')} without individualHooks, so no audit entry would be ` +
            'written. Use instance.update() or pass individualHooks: true.',
        );
      }
    });
  }
}

module.exports = { attachAuditHistory };
