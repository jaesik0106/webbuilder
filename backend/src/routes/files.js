const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { requireAuth } = require("../middleware/auth");

// 파일관리자: 이미지를 backend/uploads/<폴더> 에 저장하고 /uploads/<폴더>/파일이름 으로 보여 준다.
// 폴더는 메인 페이지용(main)과 서브 페이지용(sub) 두 개만 쓴다.
// 추가 패키지 없이, 화면이 파일 내용을 그대로 보내면(raw body) 저장한다.
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const MAX_BYTES = 10 * 1024 * 1024;
// SVG 는 스크립트를 담을 수 있어서 받지 않는다.
const ALLOWED = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/i;
const FOLDERS = ["main", "sub"];

for (const folder of FOLDERS) fs.mkdirSync(path.join(UPLOAD_DIR, folder), { recursive: true });

function folderOf(value) {
  return FOLDERS.includes(value) ? value : null;
}

const router = express.Router();
router.use(requireAuth);

function toFile(folder, name) {
  const stat = fs.statSync(path.join(UPLOAD_DIR, folder, name));
  return { name, folder, url: `/uploads/${folder}/${name}`, size: stat.size, createdAt: stat.mtime.toISOString() };
}

router.get("/", (req, res) => {
  try {
    const folders = folderOf(req.query.folder) ? [req.query.folder] : FOLDERS;
    const files = folders
      .flatMap((folder) => fs
        .readdirSync(path.join(UPLOAD_DIR, folder))
        .filter((name) => FILE_NAME.test(name) && Object.values(ALLOWED).includes(path.extname(name).slice(1).toLowerCase()))
        .map((name) => toFile(folder, name)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, files });
  } catch (error) {
    console.error("List files failed", error.message);
    res.status(500).json({ success: false, message: "파일 목록을 불러오지 못했습니다." });
  }
});

router.post("/", express.raw({ type: "*/*", limit: MAX_BYTES }), (req, res) => {
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const ext = ALLOWED[type];
  if (!ext) {
    return res.status(400).json({ success: false, message: "PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다." });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ success: false, message: "파일 내용이 비어 있습니다." });
  }

  // 원래 이름에서 영문/숫자만 남기고, 겹치지 않게 시간과 무작위 값을 붙인다.
  const base = String(req.query.name || "image")
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
  const folder = folderOf(req.query.folder) || "main";
  const name = `${base}-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}.${ext}`;

  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, folder, name), req.body);
    return res.status(201).json({ success: true, file: toFile(folder, name) });
  } catch (error) {
    console.error("Upload failed", error.message);
    return res.status(500).json({ success: false, message: "파일을 저장하지 못했습니다." });
  }
});

router.delete("/:folder/:name", (req, res) => {
  const folder = folderOf(req.params.folder);
  const name = req.params.name;
  const file = folder ? path.join(UPLOAD_DIR, folder, name) : "";
  if (!folder || !FILE_NAME.test(name) || !fs.existsSync(file)) {
    return res.status(404).json({ success: false, message: "파일을 찾을 수 없습니다." });
  }
  fs.unlinkSync(file);
  return res.json({ success: true, message: "파일을 삭제했습니다." });
});

// 너무 큰 파일은 express.raw 가 413 으로 막는다.
router.use((error, req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "10MB 이하 이미지만 올릴 수 있습니다." });
  }
  return next(error);
});

module.exports = { router, UPLOAD_DIR };
