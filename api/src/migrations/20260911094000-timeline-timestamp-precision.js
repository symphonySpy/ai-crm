'use strict';

// Millisecond precision on the columns a timeline is ordered by.
//
// Found by reading a real lead timeline: "message received" appeared ABOVE "lead
// created", even though the lead has to exist before a message can hang off it. Both
// rows are written inside one transaction, so they share a second — and a DATETIME that
// stores whole seconds cannot order them. MySQL then returns them in whatever order it
// likes, which for a salesperson reading a conversation is simply wrong.
//
// The same applies to the message thread: two messages in the same second are a normal
// occurrence in a chat, and ordering them by a second-resolution column makes a reply
// appear before the question.
//
// Precision alone is not enough — Sequelize must be told as well, or it formats values
// without fractional seconds and the widened column receives .000 anyway. The models
// declare DATE(3) for these fields for that reason.

const COLUMNS = [
  ['activities', 'occurred_at', false],
  ['activities', 'created_at', false],
  ['messages', 'created_at', false],
  ['messages', 'updated_at', false],
  ['messages', 'sent_at', true],
  ['ai_suggestions', 'created_at', false],
  ['ai_suggestions', 'updated_at', false],
  ['ai_suggestions', 'decided_at', true],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [table, column, nullable] of COLUMNS) {
      await queryInterface.changeColumn(table, column, {
        type: Sequelize.DATE(3),
        allowNull: !nullable ? false : true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    for (const [table, column, nullable] of COLUMNS) {
      await queryInterface.changeColumn(table, column, {
        type: Sequelize.DATE,
        allowNull: !nullable ? false : true,
      });
    }
  },
};
