const express = require("express");
const pool = require("../db/pool");
const settings = require("../services/siteSettingsService");
const { requireAuth } = require("../middleware/auth");

// 사이트 설정 (관리자 공용, 코드 칸은 제작자만 저장)
const router = express.Router();
router.use(requireAuth);

async function isDeveloper(userId) {
  const [rows] = await pool.query("SELECT role FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0]?.role === "developer";
}

router.get("/", async (req, res) => {
  res.json({ success: true, settings: await settings.getAll(), codeKeys: settings.CODE_KEYS });
});

router.put("/", async (req, res) => {
  try {
    const next = await settings.update(req.body.settings, { userId: req.user.id, isDeveloper: await isDeveloper(req.user.id) });
    return res.json({ success: true, settings: next });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Save settings failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "설정을 저장하지 못했습니다." });
  }
});

router.get("/history/:key", async (req, res) => {
  res.json({ success: true, history: await settings.history(String(req.params.key)) });
});

module.exports = router;
