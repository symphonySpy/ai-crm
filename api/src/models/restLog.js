const { DataTypes, Model, Op } = require('sequelize');

// One row per API call. Written by middleware/rest-log.js and by nothing else.
module.exports = (sequelize) => {
  class RestLog extends Model {
    static associate(db) {
      RestLog.belongsTo(db.User, { as: 'user', foreignKey: 'user_id' });
    }

    /**
     * Delete rows older than the retention window.
     *
     * Returns the number removed so a scheduled run can report it. Called by
     * `npm run logs:prune`; see scripts/prune-rest-log.js for why this is a deliberate
     * command rather than something the application does on its own.
     */
    static prune({ olderThanDays = 90 } = {}) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      return RestLog.destroy({ where: { created_at: { [Op.lt]: cutoff } } });
    }
  }

  RestLog.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      request_id: { type: DataTypes.STRING(64), allowNull: false },
      method: { type: DataTypes.STRING(10), allowNull: false },
      path: { type: DataTypes.STRING(512), allowNull: false },
      route: { type: DataTypes.STRING(255), allowNull: true },
      status_code: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
      duration_ms: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      // When the call started and finished. created_at is separate on purpose: the row
      // is written after the response is sent, so created_at minus response_date is how
      // far the logging is lagging.
      request_date: { type: DataTypes.DATE(3), allowNull: false },
      response_date: { type: DataTypes.DATE(3), allowNull: false },
      query_json: { type: DataTypes.JSON, allowNull: true },
      request_body: { type: DataTypes.JSON, allowNull: true },
      response_body: { type: DataTypes.JSON, allowNull: true },
      user_id: { type: DataTypes.UUID, allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      // Declared explicitly rather than left to `timestamps: true`. Sequelize's implicit
      // createdAt uses DataTypes.DATE with no precision, which formats the value without
      // fractional seconds — so a DATETIME(3) column silently received .000 and
      // created_at appeared to land BEFORE the response it describes.
      createdAt: { type: DataTypes.DATE(3), allowNull: false, field: 'created_at' },
    },
    {
      sequelize,
      modelName: 'RestLog',
      tableName: 'rest_log',
      // Append-only: a log entry that can be edited is not evidence of anything.
      updatedAt: false,
      timestamps: true,
    },
  );

  return RestLog;
};
