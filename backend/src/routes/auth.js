const express = require("express");
const authService = require("../services/authService");
const { requireAuth } = require("../middleware/auth");
const pool = require("../db/pool");

const router = express.Router();

// 회원가입은 없다. 첫 계정은 .env 의 DEVELOPER_* / ADMIN_* 로 만들고, 그 뒤로는 제작자가 계정 관리(/api/users)에서 만든다.
router.post("/login", async (req, res) => {
  const email = authService.normalizeEmail(req.body.email);
  const password = req.body.password;
  const validationError = authService.validateCredentials(email, password);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const result = await authService.login(email, password);

    if (!result) {
      return res.status(401).json({
        success: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    return res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    console.error("Login failed", error.code || error.message);
    return res.status(500).json({
      success: false,
      message: "로그인에 실패했습니다.",
    });
  }
});

// 권한은 토큰이 아니라 DB 의 현재 값으로 알려 준다 (권한을 바꾼 뒤 다시 로그인하지 않아도 맞게).
router.get("/me", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT id, email, role FROM users WHERE id = ? LIMIT 1", [req.user.id]);
  if (!rows[0]) return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  res.json({
    success: true,
    user: { id: rows[0].id, email: rows[0].email, role: authService.normalizeRole(rows[0].role) },
  });
});

module.exports = router;
