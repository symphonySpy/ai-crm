-- Runs once, on first start of an empty data volume.
--
-- The MySQL image creates exactly one database (MYSQL_DATABASE). The test suite runs
-- against a second one so that `npm test` can insert, assert on counts and delete
-- without ever touching the data a reviewer is looking at in the UI.
CREATE DATABASE IF NOT EXISTS ai_crm_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON ai_crm_test.* TO 'ai_crm'@'%';
FLUSH PRIVILEGES;
