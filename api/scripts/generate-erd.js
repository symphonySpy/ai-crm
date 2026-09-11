'use strict';

// Generates docs/erd.md from the live database.
//
// Same reasoning as the data dictionary: a diagram maintained by hand is a diagram that
// disagrees with the schema within a week. This reads information_schema, so the
// relationships shown are the foreign keys that actually exist.
//
// The attribute lists are filtered on purpose. Rendering all 100+ columns produces a
// picture nobody can read; the goal here is the map, not the inventory. Keys, enums and
// the handful of columns that carry business meaning are shown, and the data dictionary
// holds the full column list — see docs/data-dictionary.md.
//
//   npm run docs:erd

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../src/models');
const { TABLE_ORDER, TABLES } = require('./data-dictionary-descriptions');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'erd.md');

// Columns worth showing beyond keys and enums: the ones a reader needs to understand
// what the table is for.
const NOTABLE = new Set([
  'name', 'email', 'title', 'value_thb', 'body', 'note', 'industry', 'phone',
  'line_user_id', 'line_message_id', 'webhook_event_id', 'is_active', 'needs_triage',
  'degraded', 'attempt_count', 'occurred_at', 'sent_at', 'received_at', 'last_contact_at',
  'entity_id', 'old_json', 'new_json', 'payload', 'context_snapshot', 'raw_payload',
]);

// Never shown: bookkeeping that is identical everywhere, and the point-in-time copies,
// which would triple the height of every box without changing what the diagram says.
const isNoise = (col) =>
  ['created_at', 'updated_at', 'created_by', 'updated_by'].includes(col) ||
  col.endsWith('_data_json') ||
  col.endsWith('_master_json');

const mermaidType = (type) => {
  if (type.startsWith('enum(')) return 'enum';
  if (type === 'char(36)') return 'uuid';
  if (type.startsWith('varchar')) return 'string';
  if (type.startsWith('bigint')) return 'bigint';
  if (type.startsWith('int')) return 'int';
  if (type.startsWith('tinyint(1)')) return 'boolean';
  if (type.startsWith('tinyint')) return 'int';
  if (type.startsWith('datetime')) return 'datetime';
  if (type === 'json') return 'json';
  if (type === 'text') return 'text';
  return type.replace(/[^a-z0-9]/gi, '_');
};

const q = (sql, replacements) =>
  sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

async function main() {
  const schema = sequelize.config.database;

  const columns = await q(
    `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ct, IS_NULLABLE nullable, COLUMN_KEY ckey
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schema AND TABLE_NAME <> 'SequelizeMeta'
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    { schema },
  );

  const foreignKeys = await q(
    `SELECT k.TABLE_NAME t, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt
     FROM information_schema.KEY_COLUMN_USAGE k
     WHERE k.TABLE_SCHEMA = :schema AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    { schema },
  );

  const fkSet = new Set(foreignKeys.map((f) => `${f.t}.${f.c}`));
  const nullable = new Map(columns.map((c) => [`${c.t}.${c.c}`, c.nullable === 'YES']));

  const byTable = new Map();
  for (const c of columns) {
    if (!byTable.has(c.t)) byTable.set(c.t, []);
    byTable.get(c.t).push(c);
  }

  const lines = [];
  const w = (line = '') => lines.push(line);

  w('# แผนภาพความสัมพันธ์ (ERD)');
  w();
  w('สร้างอัตโนมัติจากฐานข้อมูลจริงด้วย `npm run docs:erd` ความสัมพันธ์ที่เห็นคือ foreign key ที่มีอยู่จริง');
  w('ไม่ใช่ที่ตั้งใจจะมี ให้สร้างใหม่ทุกครั้งหลังเพิ่ม migration');
  w();
  w('แผนภาพนี้แสดง**คีย์ สถานะ และคอลัมน์ที่สื่อความหมายทางธุรกิจ** เท่านั้น');
  w('คอลัมน์บันทึกเวลา ผู้แก้ไข และ snapshot JSON ถูกซ่อนไว้เพื่อให้อ่านออก');
  w('รายการคอลัมน์ทั้งหมดพร้อมคำอธิบายอยู่ใน [data-dictionary.md](data-dictionary.md)');
  w();
  w('---');
  w();
  w('## โครงสร้างและความสัมพันธ์');
  w();
  w('```mermaid');
  w('erDiagram');

  // Relationships first, so the reader sees the shape before the detail.
  const seen = new Set();
  for (const fk of foreignKeys) {
    const key = `${fk.rt}->${fk.t}.${fk.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A nullable foreign key means the child may exist without a parent, which mermaid
    // spells as "zero or one" on the parent side.
    const left = nullable.get(`${fk.t}.${fk.c}`) ? '|o' : '||';
    w(`  ${fk.rt.toUpperCase()} ${left}--o{ ${fk.t.toUpperCase()} : "${fk.c}"`);
  }
  w();

  for (const table of TABLE_ORDER) {
    const cols = (byTable.get(table) || []).filter(
      (c) =>
        !isNoise(c.c) &&
        (c.ckey === 'PRI' || fkSet.has(`${table}.${c.c}`) || c.ct.startsWith('enum(') || NOTABLE.has(c.c)),
    );
    w(`  ${table.toUpperCase()} {`);
    for (const c of cols) {
      const marks = [];
      if (c.ckey === 'PRI') marks.push('PK');
      else if (fkSet.has(`${table}.${c.c}`)) marks.push('FK');
      else if (c.ckey === 'UNI') marks.push('UK');
      w(`    ${mermaidType(c.ct)} ${c.c}${marks.length ? ' ' + marks.join(',') : ''}`);
    }
    w('  }');
  }
  w('```');
  w();
  w('---');
  w();
  w('## หน้าที่ของแต่ละตาราง');
  w();
  w('| ตาราง | หน้าที่ |');
  w('|---|---|');
  for (const t of TABLE_ORDER) w(`| \`${t}\` | ${TABLES[t].purpose} |`);
  w();

  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${lines.length} lines)`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
