'use strict';

// Fills created_by / updated_by from the acting user, on every table that has them.
//
//   await lead.update({ stage: 'Won' }, { actorId: req.user.id });
//
// Doing this in a hook rather than at each call site is not just convenience: a column
// that depends on every developer remembering to set it is a column that is wrong on
// the paths nobody thought about, and those are exactly the paths a support question
// eventually lands on.
//
// A missing actorId leaves the columns null, meaning the system acted. That is a real
// state, not a defect — inbound LINE processing has no user behind it — so it is
// recorded honestly rather than filled with a placeholder account.

const AUTHORSHIP_TABLES = [
  'users',
  'companies',
  'contacts',
  'leads',
  'activities',
  'messages',
  'ai_suggestions',
  'line_webhook_events',
];

function attachAuthorship(db) {
  for (const tableName of AUTHORSHIP_TABLES) {
    const model = Object.values(db).find(
      (m) => m && m.tableName === tableName && typeof m.addHook === 'function',
    );
    if (!model) throw new Error(`authorship: no model found for table "${tableName}"`);
    if (!model.rawAttributes.created_by || !model.rawAttributes.updated_by) {
      throw new Error(`authorship: "${tableName}" is missing created_by/updated_by`);
    }

    model.addHook('beforeCreate', (instance, options) => {
      const actor = options.actorId || null;
      // A seeder or an import may set authorship explicitly; do not overwrite it.
      if (!instance.get('created_by')) instance.set('created_by', actor);
      if (!instance.get('updated_by')) instance.set('updated_by', actor);
    });

    model.addHook('beforeUpdate', (instance, options) => {
      // Only stamp when something else actually changed, so a no-op save does not
      // rewrite authorship and leave a misleading trail.
      if (!instance.changed()) return;
      instance.set('updated_by', options.actorId || null);
    });
  }
}

module.exports = { attachAuthorship, AUTHORSHIP_TABLES };
