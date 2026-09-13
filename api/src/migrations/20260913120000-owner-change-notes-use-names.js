'use strict';

/**
 * Rewrite existing owner-change timeline notes from user ids to user names.
 *
 * Before this, assignOwner wrote "Owner set to <uuid> (was <uuid>)", which is what a
 * salesperson saw on the lead screen. New entries are written with names by
 * lead-service.ownerChangeNote; this brings the entries already in the table into the
 * same form, so a lead's history does not switch language halfway down the timeline.
 *
 * One honest caveat: these names are the users' names NOW, not at the time of the
 * change, which new entries capture. For the rows this touches the difference is nil —
 * no user has been renamed — but it is the reason this is a one-off backfill rather
 * than a pattern to repeat.
 *
 * Only the two exact legacy formats are touched. Anything else in a note is left alone.
 */

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const SET_RE = new RegExp(`^Owner set to (${UUID})(?: \\(was (${UUID})\\))?$`);
const CLEARED = 'Owner cleared; returned to triage';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    const rows = await sequelize.query(
      `SELECT id, note FROM activities
        WHERE type = 'owner_changed'
          AND (note LIKE 'Owner set to %' OR note = :cleared)`,
      { replacements: { cleared: CLEARED }, type: sequelize.QueryTypes.SELECT },
    );
    if (!rows.length) return;

    const users = await sequelize.query('SELECT id, name FROM users', {
      type: sequelize.QueryTypes.SELECT,
    });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    // A missing user cannot happen through the app (users are deactivated, never
    // deleted), but a backfill should not fail the deploy over one odd row.
    const name = (id) => nameOf.get(id) || 'ผู้ใช้ที่ไม่พบในระบบ';

    await sequelize.transaction(async (transaction) => {
      for (const row of rows) {
        let note = null;
        if (row.note === CLEARED) {
          note = 'ปล่อยคืนคิวรอคัดกรอง';
        } else {
          const m = SET_RE.exec(row.note);
          if (m) note = `มอบหมายให้ ${name(m[1])}${m[2] ? ` (เดิม: ${name(m[2])})` : ''}`;
        }
        if (note) {
          await sequelize.query('UPDATE activities SET note = :note WHERE id = :id', {
            replacements: { note, id: row.id },
            transaction,
          });
        }
      }
    });
  },

  // Irreversible by design: turning a readable name back into an id serves nobody, and
  // the id is still recoverable from the audit history of the lead's owner_id column.
  async down() {},
};
