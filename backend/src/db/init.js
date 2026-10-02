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
  // 방문자: 하루에 한 사람 한 번 (visitor_hash 는 IP+브라우저+날짜를 섞은 값, IP 는 저장하지 않음)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      visited_on DATE NOT NULL,
      visitor_hash CHAR(32) NOT NULL,
      path VARCHAR(200) NOT NULL DEFAULT '/',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_visits_day_visitor (visited_on, visitor_hash)
    ) DEFAULT CHARSET=utf8mb4
  `);

  // 사이트 설정 (키-값)과 변경 이력
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      k VARCHAR(64) NOT NULL,
      v LONGTEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (k)
    ) DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      k VARCHAR(64) NOT NULL,
      v LONGTEXT NULL,
      user_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_site_settings_history_k (k)
    ) DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing("pages", "slug", "VARCHAR(60) NULL UNIQUE AFTER name");
  await addColumnIfMissing("pages", "is_home", "TINYINT(1) NOT NULL DEFAULT 0 AFTER slug");
  await pool.query("UPDATE pages SET slug = CONCAT('page-', id) WHERE slug IS NULL");
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM pages WHERE is_home = 1");
  if (count === 0) {
    await pool.query("UPDATE pages SET is_home = 1 ORDER BY updated_at DESC LIMIT 1");
  }
  await addColumnIfMissing("ai_usage", "before_config", "LONGTEXT NULL AFTER status");

  // 계정 권한: developer(제작자, 코드 편집과 계정 관리) / admin(고객 관리자, 노코드 편집만).
  // 칸을 처음 만들 때 있던 계정은 지금까지 제작사가 쓰던 계정이므로 제작자로 둔다.
  const [roleRows] = await pool.query(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
  );
  if (roleRows[0].count === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER password_hash");
    await pool.query("UPDATE users SET role = 'developer'");
  }
}

module.exports = { initDb, migrateDb };
