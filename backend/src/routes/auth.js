const express = require("express");
const authService = require("../services/authService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// 고객 서버마다 관리자 계정 하나만 쓰므로 회원가입은 없다. 계정은 .env의 ADMIN_EMAIL/ADMIN_PASSWORD 또는 scripts/reset-account.js 로 만든다.
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

router.get("/me", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

module.exports = router;
