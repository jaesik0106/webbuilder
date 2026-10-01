const pool = require("../db/pool");

// 고객 서버마다 관리자 하나가 사이트 전체를 관리하므로 페이지는 계정 구분 없이 공용이다.
// userId 는 누가 만들었는지 기록하는 용도로만 남긴다.
function parseConfig(config) {
  if (typeof config === "string") {
    return JSON.parse(config);
  }

  return config;
}

function toPage(row) {
  return {
    id: row.id,
    name: row.name,
    config: parseConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "페이지 JSON 형식이 올바르지 않습니다.";
  }

  if (config.blocks !== undefined && !Array.isArray(config.blocks)) {
    return "blocks는 배열이어야 합니다.";
  }

  return null;
}

async function createPage(userId, name, config) {
  const pageName = String(name || config.name || "Untitled").trim() || "Untitled";
  const [result] = await pool.query(
    "INSERT INTO pages (user_id, name, config) VALUES (?, ?, ?)",
    [userId, pageName, JSON.stringify(config)]
  );

  return getPage(userId, result.insertId);
}

async function listPages(userId) {
  const [rows] = await pool.query(
    "SELECT id, name, config, created_at, updated_at FROM pages ORDER BY updated_at DESC"
  );

  return rows.map(toPage);
}

async function getPage(userId, pageId) {
  const [rows] = await pool.query(
    "SELECT id, name, config, created_at, updated_at FROM pages WHERE id = ? LIMIT 1",
    [pageId]
  );

  return rows[0] ? toPage(rows[0]) : null;
}

// 단일 로컬 앱: 가장 최근 수정된 페이지 하나를 공개 홈으로 쓴다.
async function getLatestPage() {
  const [rows] = await pool.query(
    "SELECT id, name, config, created_at, updated_at FROM pages ORDER BY updated_at DESC, id DESC LIMIT 1"
  );

  return rows[0] ? toPage(rows[0]) : null;
}

async function updatePage(userId, pageId, name, config) {
  const existing = await getPage(userId, pageId);
  if (!existing) {
    return null;
  }

  const pageName = String(name || config?.name || existing.name).trim() || existing.name;
  const nextConfig = config || existing.config;
  await pool.query(
    "UPDATE pages SET name = ?, config = ? WHERE id = ?",
    [pageName, JSON.stringify(nextConfig), pageId]
  );

  return getPage(userId, pageId);
}

async function deletePage(userId, pageId) {
  const [result] = await pool.query(
    "DELETE FROM pages WHERE id = ?",
    [pageId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  validateConfig,
  createPage,
  listPages,
  getPage,
  getLatestPage,
  updatePage,
  deletePage,
};
