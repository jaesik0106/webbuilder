const express = require("express");
const crypto = require("crypto");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const files = require("./files");

// 방문자 기록과 대시보드 숫자 (10PAGE 대시보드 참고).
// 방문자는 하루에 한 번만 센다: (날짜, IP+브라우저+날짜를 섞은 값) 이 겹치면 넣지 않는다. IP 자체는 저장하지 않는다.
const publicRouter = express.Router();
const router = express.Router();
router.use(requireAuth);

function today() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜
}

publicRouter.post("/visit", async (req, res) => {
  try {
    const day = today();
    const raw = `${req.ip}|${req.get("user-agent") || ""}|${day}|${process.env.JWT_SECRET || ""}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
    const path = String(req.body?.path || "/").slice(0, 200);
    await pool.query("INSERT IGNORE INTO visits (visited_on, visitor_hash, path) VALUES (?, ?, ?)", [day, hash, path]);
    res.json({ success: true });
  } catch (error) {
    console.error("Visit log failed", error.code || error.message);
    res.json({ success: false });
  }
});

router.get("/", async (req, res) => {
  const day = today();
  const [daily] = await pool.query(
    "SELECT DATE_FORMAT(visited_on, '%Y-%m-%d') AS day, COUNT(*) AS count FROM visits WHERE visited_on > DATE_SUB(?, INTERVAL 30 DAY) GROUP BY visited_on",
    [day]
  );
  const counts = Object.fromEntries(daily.map((row) => [row.day, Number(row.count)]));
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: counts[key] || 0 });
  }
  const last30 = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM visits");
  const [[{ pages }]] = await pool.query("SELECT COUNT(*) AS pages FROM pages");
  const [recent] = await pool.query("SELECT id, name, slug, is_home, updated_at FROM pages ORDER BY updated_at DESC LIMIT 5");
  const quotaMb = Number(process.env.STORAGE_QUOTA_MB) || 0;
  res.json({
    success: true,
    visitors: { today: counts[day] || 0, last30, dailyAverage: Math.round((last30 / 30) * 10) / 10, total: Number(total), days },
    pages: Number(pages),
    recentPages: recent.map((row) => ({ id: row.id, name: row.name, slug: row.slug, isHome: !!row.is_home, updatedAt: row.updated_at })),
    storage: { used: files.dirSize(files.UPLOAD_DIR), quota: quotaMb * 1024 * 1024 },
  });
});

module.exports = { router, publicRouter };
