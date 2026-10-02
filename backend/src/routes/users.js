const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const authService = require("../services/authService");
const { requireAuth, requireDeveloper } = require("../middleware/auth");

// 계정 관리 (제작자 전용). 제작자 = 코드 편집과 계정 관리, 관리자 = 고객용 노코드 편집.
const router = express.Router();
router.use(requireAuth, requireDeveloper);

function toUser(row) {
  return { id: row.id, email: row.email, role: authService.normalizeRole(row.role), createdAt: row.created_at };
}

async function developerCount() {
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'developer'");
  return count;
}

router.get("/", async (req, res) => {
  const [rows] = await pool.query("SELECT id, email, role, created_at FROM users ORDER BY role = 'developer' DESC, id");
  res.json({ success: true, users: rows.map(toUser) });
});

router.post("/", async (req, res) => {
  const email = authService.normalizeEmail(req.body.email);
  const error = authService.validateCredentials(email, req.body.password);
  if (error) return res.status(400).json({ success: false, message: error });
  try {
    const id = await authService.createAccount(email, req.body.password, req.body.role);
    const [rows] = await pool.query("SELECT id, email, role, created_at FROM users WHERE id = ?", [id]);
    return res.status(201).json({ success: true, user: toUser(rows[0]) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "이미 있는 이메일입니다." });
    console.error("Create user failed", err.code || err.message);
    return res.status(500).json({ success: false, message: "계정을 만들지 못했습니다." });
  }
});

// 권한 바꾸기, 비밀번호 바꾸기
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT id, email, role, created_at FROM users WHERE id = ?", [id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: "계정을 찾을 수 없습니다." });

  if (req.body.role !== undefined) {
    const role = authService.normalizeRole(req.body.role);
    if (rows[0].role === "developer" && role !== "developer" && (await developerCount()) <= 1) {
      return res.status(400).json({ success: false, message: "제작자 계정은 하나 이상 있어야 합니다." });
    }
    await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  }
  if (req.body.password !== undefined) {
    const error = authService.validateCredentials(rows[0].email, req.body.password);
    if (error) return res.status(400).json({ success: false, message: error });
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(req.body.password, 10), id]);
  }
  const [next] = await pool.query("SELECT id, email, role, created_at FROM users WHERE id = ?", [id]);
  return res.json({ success: true, user: toUser(next[0]) });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === Number(req.user.id)) return res.status(400).json({ success: false, message: "지금 로그인한 계정은 지울 수 없습니다." });
  const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: "계정을 찾을 수 없습니다." });
  if (rows[0].role === "developer" && (await developerCount()) <= 1) {
    return res.status(400).json({ success: false, message: "제작자 계정은 하나 이상 있어야 합니다." });
  }
  // pages.user_id, ai_usage.user_id 는 "누가 만들었는지" 기록이라 지운 계정 대신 지금 계정으로 넘긴다.
  await pool.query("UPDATE pages SET user_id = ? WHERE user_id = ?", [req.user.id, id]);
  await pool.query("UPDATE ai_usage SET user_id = ? WHERE user_id = ?", [req.user.id, id]);
  await pool.query("DELETE FROM users WHERE id = ?", [id]);
  return res.json({ success: true });
});

module.exports = router;
