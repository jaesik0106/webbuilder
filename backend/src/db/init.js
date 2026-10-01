const pool = require("./pool");

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      config JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pages_user_id (user_id),
      CONSTRAINT fk_pages_user FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      page_id BIGINT UNSIGNED NULL,
      prompt VARCHAR(2000) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ai_usage_user_id (user_id),
      CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
}

// 이미 만들어진 pages 테이블에 메인/서브 페이지 구분 칸을 추가한다.
async function addColumnIfMissing(table, column, definition) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (rows[0].count === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateDb() {
  await addColumnIfMissing("pages", "slug", "VARCHAR(60) NULL UNIQUE AFTER name");
  await addColumnIfMissing("pages", "is_home", "TINYINT(1) NOT NULL DEFAULT 0 AFTER slug");
  await pool.query("UPDATE pages SET slug = CONCAT('page-', id) WHERE slug IS NULL");
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM pages WHERE is_home = 1");
  if (count === 0) {
    await pool.query("UPDATE pages SET is_home = 1 ORDER BY updated_at DESC LIMIT 1");
  }
}

module.exports = { initDb, migrateDb };
