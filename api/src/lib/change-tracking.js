'use strict';

const { TRACKED_FIELDS } = require('../constants/tracked-fields');

const ENTITY_TYPE_BY_TABLE = {
  companies: 'company',
  contacts: 'contact',
  leads: 'lead',
};

const serialise = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
};

/**
 * Record changes to tracked fields into field_change_log.
 *
 * Attached as an afterUpdate hook, inside the caller's transaction when there is one —
 * so history and the change it describes either both land or neither does. A log entry
 * that survives a rolled-back update would describe something that never happened.
 *
 * Pass the acting user through the query options:
 *
 *   await lead.update({ owner_id: id }, { actorId: req.user.id, transaction: t });
 *
 * A missing actorId is recorded as null, meaning "the system did this" — the same
 * convention as activities.actor_id. It is deliberately not an error: inbound LINE
 * processing genuinely has no user behind it.
 *
 * KNOWN LIMIT: Model.update({...}, { where }) runs a bulk UPDATE and does not fire
 * instance hooks, so those changes are not recorded. Either pass individualHooks: true
 * or use instance.update() on the paths that matter. Every write path in this codebase
 * uses instance.update(); the guard below exists so a future bulk write fails loudly in
 * development rather than silently skipping history.
 */
function attachChangeTracking(db) {
  for (const [tableName, fields] of Object.entries(TRACKED_FIELDS)) {
    const model = Object.values(db).find(
      (m) => m && m.tableName === tableName && typeof m.addHook === 'function',
    );
    if (!model) throw new Error(`change tracking: no model found for table "${tableName}"`);

    const entityType = ENTITY_TYPE_BY_TABLE[tableName];

    model.addHook('afterUpdate', async (instance, options) => {
      const entries = [];
      for (const field of fields) {
        if (!instance.changed(field)) continue;
        const oldValue = serialise(instance.previous(field));
        const newValue = serialise(instance.get(field));
        if (oldValue === newValue) continue;
        entries.push({
          entity_type: entityType,
          entity_id: instance.get('id'),
          field,
          old_value: oldValue,
          new_value: newValue,
          changed_by: options.actorId || null,
          changed_at: new Date(),
        });
      }
      if (entries.length) {
        await db.FieldChangeLog.bulkCreate(entries, { transaction: options.transaction });
      }
    });

    model.addHook('beforeBulkUpdate', (options) => {
      if (options.individualHooks) return;
      const touched = Object.keys(options.fields || {});
      const tracked = touched.filter((f) => fields.includes(f));
      if (tracked.length && process.env.NODE_ENV !== 'production') {
        throw new Error(
          `change tracking: bulk update on "${tableName}" touches tracked field(s) ` +
            `${tracked.join(', ')} without individualHooks, so no history would be written. ` +
            'Use instance.update() or pass individualHooks: true.',
        );
      }
    });
  }
}

module.exports = { attachChangeTracking, ENTITY_TYPE_BY_TABLE };
