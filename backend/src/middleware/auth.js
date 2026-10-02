const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "로그인이 필요합니다.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.userId, email: payload.email, role: payload.role === "developer" ? "developer" : "admin" };
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "로그인이 필요합니다.",
    });
  }
}

// 제작자 전용 (계정 관리, 코드 편집). 토큰이 아니라 DB 의 현재 권한으로 확인한다.
async function requireDeveloper(req, res, next) {
  try {
    const [rows] = await pool.query("SELECT role FROM users WHERE id = ? LIMIT 1", [req.user.id]);
    if (rows[0]?.role === "developer") return next();
    return res.status(403).json({ success: false, message: "제작자 계정만 할 수 있습니다." });
  } catch (error) {
    console.error("Role check failed", error.code || error.message);
    return res.status(500).json({ success: false, message: "권한을 확인하지 못했습니다." });
  }
}

module.exports = { requireAuth, requireDeveloper };
