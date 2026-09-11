'use strict';

// Generates docs/data-dictionary.md from the live database.
//
// Writing a data dictionary by hand guarantees it will be wrong within a week. This
// reads information_schema instead, so the document can only ever describe the schema
// that actually exists. Business meaning comes from data-dictionary-descriptions.js;
// the generator refuses to finish if a column has no description, which is what stops
// the file from going stale after a migration.
//
//   npm run docs:datadict

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../src/models');
const { TABLE_ORDER, TABLES, COLUMNS, CHECKS, CLOSING_NOTES } =
  require('./data-dictionary-descriptions');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'data-dictionary.md');

const q = async (sql, replacements) =>
  (await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT }))
  || [];

// MySQL hands back a normalised clause carrying charset introducers and escaped
// quotes (_utf8mb4\'sent\'). Strip that noise so the document shows SQL a person can
// read, without changing what the constraint actually says.
const prettyClause = (clause) =>
  clause
    .replace(/_utf8mb4/g, '')
    .replace(/\\'/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const prettyType = (type) => {
  if (type.startsWith('enum(')) {
    return 'enum: ' + type.slice(5, -1).replace(/'/g, '`').replace(/,/g, ' · ');
  }
  if (type === 'char(36)') return 'char(36) (UUID)';
  return type;
};

async function main() {
  const schema = sequelize.config.database;

  const columns = await q(
    `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ct, IS_NULLABLE nullable,
            COLUMN_DEFAULT cdefault, COLUMN_KEY ckey
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = :schema AND TABLE_NAME <> 'SequelizeMeta'
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    { schema },
  );

  const foreignKeys = await q(
    `SELECT k.TABLE_NAME t, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt,
            k.REFERENCED_COLUMN_NAME rc, r.DELETE_RULE del
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
     WHERE k.TABLE_SCHEMA = :schema AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    { schema },
  );

  const indexes = await q(
    `SELECT TABLE_NAME t, INDEX_NAME name, NON_UNIQUE nonUnique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = :schema AND TABLE_NAME <> 'SequelizeMeta'
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
     ORDER BY TABLE_NAME, INDEX_NAME`,
    { schema },
  );

  const checks = await q(
    `SELECT tc.TABLE_NAME t, cc.CONSTRAINT_NAME name, cc.CHECK_CLAUSE clause
     FROM information_schema.CHECK_CONSTRAINTS cc
     JOIN information_schema.TABLE_CONSTRAINTS tc
       ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
      AND tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
     WHERE cc.CONSTRAINT_SCHEMA = :schema
     ORDER BY tc.TABLE_NAME`,
    { schema },
  );

  const counts = {};
  for (const table of TABLE_ORDER) {
    const [row] = await q(`SELECT COUNT(*) n FROM \`${table}\``);
    counts[table] = Number(row.n);
  }

  // Fail loudly on drift rather than emitting a document with silent gaps.
  const described = new Set(Object.keys(COLUMNS));
  const missing = columns
    .map((c) => `${c.t}.${c.c}`)
    .filter((key) => !described.has(key));
  const unknownTables = [...new Set(columns.map((c) => c.t))]
    .filter((t) => !TABLE_ORDER.includes(t));
  if (missing.length || unknownTables.length) {
    console.error('Data dictionary is out of date. Add descriptions for:');
    for (const m of missing) console.error('  column  ' + m);
    for (const t of unknownTables) console.error('  table   ' + t);
    console.error('\nEdit scripts/data-dictionary-descriptions.js, then re-run.');
    process.exitCode = 1;
    return;
  }

  const byTable = new Map();
  for (const c of columns) {
    if (!byTable.has(c.t)) byTable.set(c.t, []);
    byTable.get(c.t).push(c);
  }
  const fkFor = new Map(foreignKeys.map((f) => [`${f.t}.${f.c}`, f]));

  const out = [];
  const w = (line = '') => out.push(line);

  w('# พจนานุกรมข้อมูล (Data dictionary)');
  w();
  w('เอกสารนี้ **สร้างอัตโนมัติจากฐานข้อมูลจริง** ด้วย `npm run docs:datadict` ไม่ได้พิมพ์ด้วยมือ');
  w('จึงไม่มีทางคลาดเคลื่อนจาก schema ที่รันอยู่ ให้สร้างใหม่ทุกครั้งหลังเพิ่ม migration');
  w();
  w('MySQL 8.0 · charset `utf8mb4` · collation `utf8mb4_unicode_ci` · เวลาทั้งหมดเก็บเป็น UTC (A10)');
  w('รหัส `A##` ในคำอธิบายอ้างถึงสมมติฐานใน [assumptions.md](assumptions.md)');
  w();
  w('---');
  w();
  w('## สรุปตาราง');
  w();
  w('| ตาราง | หน้าที่ | จำนวนแถว (ข้อมูลสาธิต) | คอลัมน์ |');
  w('|---|---|---:|---:|');
  for (const t of TABLE_ORDER) {
    w(`| \`${t}\` | ${TABLES[t].purpose} | ${counts[t].toLocaleString('en-US')} | ${byTable.get(t).length} |`);
  }
  w();

  for (const t of TABLE_ORDER) {
    w('---');
    w();
    w(`## \`${t}\``);
    w();
    w(TABLES[t].purpose);
    w();
    w(`> ${TABLES[t].note}`);
    w();
    w('| คอลัมน์ | ชนิด | ว่างได้ | ค่าเริ่มต้น | คีย์ | คำอธิบาย |');
    w('|---|---|:---:|---|---|---|');
    for (const c of byTable.get(t)) {
      const keyBits = [];
      if (c.ckey === 'PRI') keyBits.push('PK');
      else if (c.ckey === 'UNI') keyBits.push('UK');
      const fk = fkFor.get(`${t}.${c.c}`);
      if (fk) keyBits.push(`FK → \`${fk.rt}.${fk.rc}\` (del: ${fk.del})`);
      w(`| \`${c.c}\` | ${prettyType(c.ct)} | ${c.nullable === 'NO' ? '—' : '✓'} | ${
        c.cdefault === null || c.cdefault === '' ? '' : `\`${c.cdefault}\``
      } | ${keyBits.join(' · ')} | ${COLUMNS[`${t}.${c.c}`]} |`);
    }
    w();

    const tableChecks = checks.filter((x) => x.t === t);
    if (tableChecks.length) {
      w('**CHECK constraints**');
      w();
      for (const chk of tableChecks) {
        w(`- \`${chk.name}\` — ${CHECKS[chk.name] || ''}`);
        w('  ```sql');
        w(`  ${prettyClause(chk.clause)}`);
        w('  ```');
      }
      w();
    }

    const secondary = indexes.filter((x) => x.t === t && x.name !== 'PRIMARY');
    if (secondary.length) {
      w('**ดัชนี**');
      w();
      w('| ชื่อ | คอลัมน์ | unique |');
      w('|---|---|:---:|');
      for (const i of secondary) {
        w(`| \`${i.name}\` | \`${i.cols.split(',').join('`, `')}\` | ${
          Number(i.nonUnique) === 0 ? '✓' : '—'
        } |`);
      }
      w();
    }
  }

  w('---');
  w();
  w('## หมายเหตุการออกแบบที่ควรทราบ');
  w();
  for (const note of CLOSING_NOTES) w(`- ${note}`);
  w();

  fs.writeFileSync(OUT, out.join('\n') + '\n', 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${out.length} lines)`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
