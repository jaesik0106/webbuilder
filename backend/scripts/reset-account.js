// 로컬 계정의 이메일과 비밀번호를 다시 설정한다.
// 사용법: node scripts/reset-account.js <현재 이메일> [새 이메일]
// RESET_PASSWORD 환경 변수가 있으면 그 값으로, 없으면 무작위 비밀번호를 만들어 backend/test-account.local 파일에만 적는다 (화면에는 출력하지 않음).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pool = require("../src/db/pool");

async function main() {
  const [currentEmail, nextEmail] = process.argv.slice(2);
  if (!currentEmail) {
    console.error("사용법: node scripts/reset-account.js <현재 이메일> [새 이메일]");
    process.exit(1);
  }

  const email = (nextEmail || currentEmail).trim().toLowerCase();
  const chosen = process.env.RESET_PASSWORD;
  if (chosen !== undefined && chosen.length < 8) {
    console.error("비밀번호는 8자 이상이어야 합니다.");
    process.exit(1);
  }
  const password = chosen || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    "UPDATE users SET email = ?, password_hash = ? WHERE email = ?",
    [email, passwordHash, currentEmail]
  );
  if (result.affectedRows === 0) {
    console.error("해당 이메일의 계정을 찾지 못했습니다.");
    process.exit(1);
  }

  if (chosen) {
    console.log(`계정을 다시 설정했습니다: ${email}`);
    return;
  }

  const file = path.join(__dirname, "..", "test-account.local");
  fs.writeFileSync(file, `이메일: ${email}\n비밀번호: ${password}\n`);
  console.log(`계정을 다시 설정했습니다. 로그인 정보: ${file}`);
}

main()
  .catch((error) => {
    console.error("재설정 실패:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
