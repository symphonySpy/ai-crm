'use strict';

// When the request arrived and when the response finished, as their own columns.
//
// duration_ms already said how long a call took, but not WHEN it sat. Those are
// different questions: "this endpoint takes 3 seconds" is a performance note, while
// "these forty requests all arrived at 09:15:02" is the shape of an incident. Having
// both ends recorded makes the second question answerable by ordering and grouping
// rather than by reconstructing arrival times from a duration.
//
// created_at stays and is NOT a duplicate of response_date. The row is inserted after
// the response has been sent, so the gap between the two is how far the logging itself
// is lagging — the first thing worth checking when rows start going missing under load.
//
// DATE(3) throughout: whole-second timestamps cannot order requests that arrive in the
// same second, which is precisely the traffic anyone is looking at when they open this
// table.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('rest_log', 'request_date', {
      type: Sequelize.DATE(3),
      allowNull: true,
      comment: 'When the request arrived.',
    });
    await queryInterface.addColumn('rest_log', 'response_date', {
      type: Sequelize.DATE(3),
      allowNull: true,
      comment: 'When the response finished sending.',
    });

    // Existing rows can be reconstructed exactly: the row was written at the end of the
    // call, and duration_ms says how long before that it started.
    await queryInterface.sequelize.query(`
      UPDATE rest_log
      SET response_date = created_at,
          request_date  = DATE_SUB(created_at, INTERVAL duration_ms * 1000 MICROSECOND)
      WHERE request_date IS NULL
    `);

    // Only enforced after the backfill, so the migration can run against a table that
    // already holds data.
    await queryInterface.changeColumn('rest_log', 'request_date', {
      type: Sequelize.DATE(3),
      allowNull: false,
    });
    await queryInterface.changeColumn('rest_log', 'response_date', {
      type: Sequelize.DATE(3),
      allowNull: false,
    });

    // "What was happening at 09:15?" reads off arrival time, not insert time.
    await queryInterface.addIndex('rest_log', ['request_date'], {
      name: 'idx_rest_log_request_date',
    });

    // A response cannot finish before its request arrived. Cheap to state, and it
    // catches a clock or timezone mistake at the moment it is introduced rather than
    // after a month of rows have been written with it.
    await queryInterface.sequelize.query(`
      ALTER TABLE rest_log
      ADD CONSTRAINT chk_rest_log_dates_ordered
      CHECK (response_date >= request_date)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE rest_log DROP CONSTRAINT chk_rest_log_dates_ordered',
    );
    await queryInterface.removeIndex('rest_log', 'idx_rest_log_request_date');
    await queryInterface.removeColumn('rest_log', 'response_date');
    await queryInterface.removeColumn('rest_log', 'request_date');
  },
};
