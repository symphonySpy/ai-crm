'use strict';

// Set a new password on the demo accounts, without touching any other data.
//
//   npm run demo:password                      # generates one and prints it once
//   SEED_PASSWORD='...' npm run demo:password  # or choose it yourself
//
// Exists because the seeder is destructive: re-running it to change a password would
// also delete the leads and conversations a demo depends on, including anything that
// arrived from LINE. This changes the hash on the existing rows and nothing else.
//
// Run it against the deployment the same way, with MYSQL_URL pointing at that database.

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/models');

const password = process.env.SEED_PASSWORD || crypto.randomBytes(12).toString('base64url');

async function main() {
  const hash = await bcrypt.hash(password, 10);

  const [count] = await db.User.update(
    { password_hash: hash },
    // Only the synthetic accounts. A script that rewrites every password in the table
    // is one typo away from locking out a real user.
    { where: { email: { [db.Sequelize.Op.like]: '%@demo.local' } } },
  );

  // Printed once, to the terminal, and written nowhere. It does not go through the
  // logger: logs get shipped, searched and kept, which is the opposite of what should
  // happen to a password.
  // eslint-disable-next-line no-console
  console.log(`\n  Updated ${count} demo account(s).\n  Password: ${password}\n`);

  await db.sequelize.close();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('failed to reset demo password:', err.message);
  await db.sequelize.close();
  process.exit(1);
});
