const pool = require("../db/pool");

// 고객 서버마다 관리자 하나가 사이트 전체를 관리하므로 페이지는 계정 구분 없이 공용이다.
// userId 는 누가 만들었는지 기록하는 용도로만 남긴다.
// 페이지는 메인 1개(is_home)와 서브 페이지로 나뉘고, 서브 페이지는 주소(slug)로 열린다 (예: /about).

const COLUMNS = "id, name, slug, is_home, config, created_at, updated_at";
// 관리자 화면 주소와 겹치는 이름은 페이지 주소로 쓸 수 없다.
const RESERVED_SLUGS = new Set(["admin", "login", "page", "settings", "deploy", "api", "uploads", "assets", "new"]);

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
    slug: row.slug,
    isHome: Boolean(row.is_home),
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

function validateSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) {
    return "주소는 영문 소문자, 숫자, -(하이픈)만 쓸 수 있습니다.";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "관리자 화면에서 쓰는 주소라 사용할 수 없습니다.";
  }
  return null;
}

async function createPage(userId, name, config) {
  const pageName = String(name || config.name || "Untitled").trim() || "Untitled";
  // 첫 페이지는 자동으로 메인 페이지가 된다.
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM pages WHERE is_home = 1");
  const [result] = await pool.query(
    "INSERT INTO pages (user_id, name, is_home, config) VALUES (?, ?, ?, ?)",
    [userId, pageName, count === 0 ? 1 : 0, JSON.stringify(config)]
  );
  await pool.query("UPDATE pages SET slug = ? WHERE id = ?", [`page-${result.insertId}`, result.insertId]);

  return getPage(userId, result.insertId);
}

async function listPages() {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM pages ORDER BY is_home DESC, updated_at DESC`);

  return rows.map(toPage);
}

async function getPage(userId, pageId) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM pages WHERE id = ? LIMIT 1`, [pageId]);

  return rows[0] ? toPage(rows[0]) : null;
}

// 공개 홈: 메인으로 지정된 페이지. 아직 지정이 없으면 가장 최근 수정된 페이지.
async function getHomePage() {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM pages ORDER BY is_home DESC, updated_at DESC, id DESC LIMIT 1`
  );

  return rows[0] ? toPage(rows[0]) : null;
}

async function getPageBySlug(slug) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM pages WHERE slug = ? LIMIT 1`, [slug]);

  return rows[0] ? toPage(rows[0]) : null;
}

async function updatePage(userId, pageId, { name, config, slug, isHome } = {}) {
  const existing = await getPage(userId, pageId);
  if (!existing) {
    return null;
  }

  if (slug !== undefined && slug !== existing.slug) {
    const nextSlug = String(slug).trim().toLowerCase();
    const slugError = validateSlug(nextSlug);
    if (slugError) {
      const error = new Error(slugError);
      error.status = 400;
      throw error;
    }
    const duplicate = await getPageBySlug(nextSlug);
    if (duplicate && duplicate.id !== existing.id) {
      const error = new Error("이미 다른 페이지가 쓰는 주소입니다.");
      error.status = 409;
      throw error;
    }
    await pool.query("UPDATE pages SET slug = ? WHERE id = ?", [nextSlug, pageId]);
  }

  if (isHome === true) {
    await pool.query("UPDATE pages SET is_home = (id = ?)", [pageId]);
  }

  if (name !== undefined || config !== undefined) {
    const pageName = String(name || config?.name || existing.name).trim() || existing.name;
    const nextConfig = config || existing.config;
    await pool.query("UPDATE pages SET name = ?, config = ? WHERE id = ?", [pageName, JSON.stringify(nextConfig), pageId]);
  }

  return getPage(userId, pageId);
}

async function deletePage(userId, pageId) {
  const existing = await getPage(userId, pageId);
  const [result] = await pool.query("DELETE FROM pages WHERE id = ?", [pageId]);

  // 메인 페이지를 지우면 가장 최근 수정된 페이지를 새 메인으로 지정한다.
  if (existing?.isHome) {
    await pool.query("UPDATE pages SET is_home = 1 ORDER BY updated_at DESC LIMIT 1");
  }

  return result.affectedRows > 0;
}

module.exports = {
  validateConfig,
  createPage,
  listPages,
  getPage,
  getHomePage,
  getPageBySlug,
  updatePage,
  deletePage,
};
