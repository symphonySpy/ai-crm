const { DataTypes, Model } = require('sequelize');
const { AI_SUGGESTION_STATUSES, AI_SUGGESTION_KINDS } = require('../constants/enums');

// A22: this table is the boundary between what the model proposes and what the system
// does. The AI writes here and nowhere else. Nothing leaves for a customer and no lead
// changes until a human moves status off 'proposed'.
//
// context_snapshot is a deliberate point-in-time stamp of the lead data the model was
// shown. Without it, "why did the AI score this 82?" becomes unanswerable the moment
// the lead is edited. It is one of only two places in this schema that freezes a copy
// of data instead of joining to the live row (the other is activities.from_stage /
// to_stage) — everywhere else, current values are the correct answer.
module.exports = (sequelize) => {
  class AiSuggestion extends Model {
    static associate(db) {
      AiSuggestion.belongsTo(db.Lead, { as: 'lead', foreignKey: 'lead_id' });
      AiSuggestion.belongsTo(db.User, { as: 'requestedBy', foreignKey: 'requested_by' });
      AiSuggestion.belongsTo(db.User, { as: 'decidedBy', foreignKey: 'decided_by' });
    }
  }

  AiSuggestion.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      lead_id: { type: DataTypes.UUID, allowNull: false },
      kind: {
        type: DataTypes.ENUM(...AI_SUGGESTION_KINDS),
        allowNull: false,
        defaultValue: 'copilot_bundle',
      },
      // A23: summary, score with per-criterion reasons, next_best_action, draft_line_reply.
      payload: { type: DataTypes.JSON, allowNull: false },
      context_snapshot: { type: DataTypes.JSON, allowNull: false },
      model: { type: DataTypes.STRING(80), allowNull: true },
      prompt_version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'v1' },
      // A25: true when the rule-based fallback produced this instead of the model.
      degraded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: {
        type: DataTypes.ENUM(...AI_SUGGESTION_STATUSES),
        allowNull: false,
        defaultValue: 'proposed',
      },
      // A27: a human always asks for the suggestion — it is never generated on inbound.
      requested_by: { type: DataTypes.UUID, allowNull: false },
      decided_by: { type: DataTypes.UUID, allowNull: true },
      decided_at: { type: DataTypes.DATE, allowNull: true },
      // The lead as it stood when this suggestion was generated. Complements
      // context_snapshot, which records what the model was actually shown.
      lead_data_json: { type: DataTypes.JSON, allowNull: true },
    },
    { sequelize, modelName: 'AiSuggestion', tableName: 'ai_suggestions' },
  );

  return AiSuggestion;
};
