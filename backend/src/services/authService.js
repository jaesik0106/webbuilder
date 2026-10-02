const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (!EMAIL_PATTERN.test(email)) {
    return "이메일 형식이 올바르지 않습니다.";
  }

  if (typeof password !== "string" || password.length < 8) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }

  return null;
}

const ROLES = ["developer", "admin"];

function normalizeRole(role) {
  return ROLES.includes(role) ? role : "admin";
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: normalizeRole(user.role) },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function createAccount(email, password, role) {
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
    [email, passwordHash, normalizeRole(role)]
  );
  return result.insertId;
}

/**
 * 처음 계정 만들기 (.env):
 * - DEVELOPER_EMAIL / DEVELOPER_PASSWORD: 제작자 계정이 하나도 없으면 만든다.
 * - ADMIN_EMAIL / ADMIN_PASSWORD: 계정이 하나도 없으면 고객 관리자 계정으로 만든다.
 */
async function ensureAdmin() {
  let created = false;
  const devEmail = normalizeEmail(process.env.DEVELOPER_EMAIL);
  const devPassword = process.env.DEVELOPER_PASSWORD;
  if (devEmail && !validateCredentials(devEmail, devPassword)) {
    const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'developer' OR email = ?", [devEmail]);
    if (count === 0) {
      await createAccount(devEmail, devPassword, "developer");
      console.log("Admin: 제작자 계정을 만들었습니다.");
      created = true;
    }
  }

  const [rows] = await pool.query("SELECT COUNT(*) AS count FROM users");
  if (rows[0].count > 0) return created;

  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (validateCredentials(email, password)) {
    console.warn("Admin: 계정이 없습니다. .env 에 ADMIN_EMAIL 과 8자 이상의 ADMIN_PASSWORD 를 넣고 서버를 다시 시작하세요.");
    return false;
  }

  await createAccount(email, password, "admin");
  console.log("Admin: 첫 관리자 계정을 만들었습니다.");
  return true;
}

async function login(email, password) {
  const [rows] = await pool.query(
    "SELECT id, email, password_hash, role FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  const user = rows[0];

  if (!user) {
    return null;
  }

  const matched = await bcrypt.compare(password, user.password_hash);
  if (!matched) {
    return null;
  }

  return {
    token: signToken(user),
    user: { id: user.id, email: user.email, role: normalizeRole(user.role) },
  };
}

module.exports = {
  ROLES,
  normalizeRole,
  createAccount,
  normalizeEmail,
  validateCredentials,
  ensureAdmin,
  login,
};
