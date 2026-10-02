const pool = require("../db/pool");

/**
 * 사이트 설정 (10PAGE 의 사이트 설정 / CSS 스타일시트 참고). 키-값으로 site_settings 표에 저장한다.
 * - CODE_KEYS(추가 CSS, 스크립트, 추가 메타태그)는 코드라서 제작자만 바꿀 수 있다.
 * - HISTORY_KEYS 는 저장할 때마다 이전 값을 남겨 최근 10건을 되돌릴 수 있다.
 * PHP 쪽(php-api/settings.php)과 키, 규칙이 같아야 한다.
 */
const KEYS = [
  "siteTitle", "siteUrl", "titleSeparator", "siteDescription", "keywords",
  "logoType", "logoText", "logoImage", "favicon", "ogImage",
  "naverVerification", "googleVerification", "extraMeta", "robots",
  "customCss", "headTop", "headBottom", "bodyTop", "bodyBottom",
  "adminMemo", "menu", "popups",
];
const CODE_KEYS = ["customCss", "headTop", "headBottom", "bodyTop", "bodyBottom", "extraMeta"];
const HISTORY_KEYS = ["customCss", "headTop", "headBottom", "bodyTop", "bodyBottom", "extraMeta", "robots"];
// 방문자 화면에 내려보내지 않는 값
const PRIVATE_KEYS = ["adminMemo", "robots"];
const MAX_LENGTH = 200000;
const HISTORY_LIMIT = 10;

const DEFAULT_ROBOTS = "User-agent: *\nAllow: /\n";

async function getAll() {
  const [rows] = await pool.query("SELECT k, v FROM site_settings");
  const settings = Object.fromEntries(KEYS.map((key) => [key, ""]));
  for (const row of rows) if (KEYS.includes(row.k)) settings[row.k] = row.v ?? "";
  return settings;
}

async function getPublic() {
  const all = await getAll();
  for (const key of PRIVATE_KEYS) delete all[key];
  return all;
}

/** 메뉴 JSON 정리: 최대 4단계, 주소는 사이트 안 주소, #, http(s), mailto, tel 만 (src/lib/site-menu.ts 와 같음) */
function cleanMenu(items, depth = 1) {
  if (!Array.isArray(items) || depth > 4) return [];
  return items.filter((item) => item && typeof item === "object").slice(0, 50).map((item) => {
    const href = String(item.href ?? "#").trim();
    return {
      id: typeof item.id === "string" && item.id ? item.id.slice(0, 40) : `m-${Math.random().toString(36).slice(2, 10)}`,
      label: String(item.label ?? "").slice(0, 60),
      href: /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(href) ? href.slice(0, 500) : "#",
      target: item.target === "_blank" ? "_blank" : "_self",
      ...(item.hidden === true ? { hidden: true } : {}),
      children: cleanMenu(item.children, depth + 1),
    };
  });
}

const SAFE_HREF = /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i;
const POPUP_POSITIONS = ["center", "left-top", "right-top", "left-bottom", "right-bottom"];

function clampNumber(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

/** 팝업 JSON 정리 (src/lib/site-popups.ts 와 같음). 내용은 글자만, 링크와 이미지는 안전한 주소만. */
function cleanPopups(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && typeof item === "object").slice(0, 20).map((item) => {
    const link = String(item.link ?? "").trim();
    const image = String(item.image ?? "").trim();
    return {
      id: String(item.id || "").slice(0, 40) || `p-${Math.random().toString(36).slice(2, 8)}`,
      title: String(item.title ?? "").slice(0, 100),
      active: item.active === true,
      startAt: String(item.startAt ?? "").slice(0, 20),
      endAt: String(item.endAt ?? "").slice(0, 20),
      permanent: item.permanent === true,
      position: POPUP_POSITIONS.includes(item.position) ? item.position : "left-top",
      offsetX: clampNumber(item.offsetX, 40, 0, 2000),
      offsetY: clampNumber(item.offsetY, 120, 0, 2000),
      width: clampNumber(item.width, 400, 200, 1200),
      image: /^(\/(?!\/)|https:\/\/)/i.test(image) ? image.slice(0, 500) : "",
      text: String(item.text ?? "").slice(0, 2000),
      link: link && SAFE_HREF.test(link) ? link.slice(0, 500) : "",
      linkTarget: item.linkTarget === "_blank" ? "_blank" : "_self",
    };
  });
}

/** 소유확인 값은 영문, 숫자, -, _ 만 남긴다 (meta content 로 들어가므로). */
function clean(key, value) {
  const text = String(value ?? "").slice(0, MAX_LENGTH);
  if (key === "naverVerification" || key === "googleVerification") return text.replace(/[^A-Za-z0-9_-]/g, "");
  if (key === "logoType") return ["image", "text", "both"].includes(text) ? text : "image";
  if (key === "popups") {
    try {
      return text ? JSON.stringify(cleanPopups(JSON.parse(text))) : "";
    } catch {
      return "";
    }
  }
  if (key === "menu") {
    try {
      return text ? JSON.stringify(cleanMenu(JSON.parse(text))) : "";
    } catch {
      return "";
    }
  }
  return text;
}

/** 바뀐 값만 저장한다. 코드 키를 제작자가 아닌 계정이 바꾸려 하면 오류. */
async function update(changes, { userId, isDeveloper }) {
  const current = await getAll();
  const next = {};
  for (const [key, value] of Object.entries(changes || {})) {
    if (!KEYS.includes(key)) continue;
    const cleaned = clean(key, value);
    if (cleaned === current[key]) continue;
    if (CODE_KEYS.includes(key) && !isDeveloper) {
      const error = new Error("추가 CSS, 스크립트, 메타태그는 제작자 계정만 바꿀 수 있습니다.");
      error.status = 403;
      throw error;
    }
    next[key] = cleaned;
  }

  for (const [key, value] of Object.entries(next)) {
    if (HISTORY_KEYS.includes(key) && current[key] !== "") {
      await pool.query("INSERT INTO site_settings_history (k, v, user_id) VALUES (?, ?, ?)", [key, current[key], userId]);
      // 최근 10건만 남긴다
      await pool.query(
        "DELETE FROM site_settings_history WHERE k = ? AND id NOT IN (SELECT id FROM (SELECT id FROM site_settings_history WHERE k = ? ORDER BY id DESC LIMIT ?) AS keep)",
        [key, key, HISTORY_LIMIT]
      );
    }
    await pool.query("INSERT INTO site_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [key, value]);
  }
  return getAll();
}

async function history(key) {
  if (!HISTORY_KEYS.includes(key)) return [];
  const [rows] = await pool.query(
    "SELECT h.id, h.v, h.created_at, u.email FROM site_settings_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.k = ? ORDER BY h.id DESC LIMIT ?",
    [key, HISTORY_LIMIT]
  );
  return rows.map((row) => ({ id: row.id, value: row.v, createdAt: row.created_at, email: row.email || "" }));
}

async function robotsTxt() {
  const all = await getAll();
  return all.robots.trim() ? all.robots : DEFAULT_ROBOTS;
}

function xmlEscape(text) {
  return String(text).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}

/** sitemap.xml: 메인(/) + 주소가 있는 서브 페이지. 대표 URL 이 없으면 요청 주소를 쓴다. */
async function sitemapXml(fallbackOrigin) {
  const all = await getAll();
  const origin = (all.siteUrl.trim() || fallbackOrigin).replace(/\/+$/, "");
  const [pages] = await pool.query("SELECT slug, is_home, updated_at FROM pages ORDER BY is_home DESC, id");
  const urls = pages.map((page) => ({
    loc: page.is_home ? `${origin}/` : `${origin}/${page.slug}`,
    lastmod: new Date(page.updated_at).toISOString().slice(0, 10),
  }));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

module.exports = { KEYS, CODE_KEYS, HISTORY_KEYS, getAll, getPublic, update, history, robotsTxt, sitemapXml };
