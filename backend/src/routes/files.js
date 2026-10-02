const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { requireAuth } = require("../middleware/auth");

/**
 * 파일관리자 (10PAGE 파일 관리자 참고). backend/uploads/<폴더>/파일이름 에 저장하고 /uploads/... 로 보여 준다.
 * - 시스템 폴더(main, sub, logo, slide)는 지우거나 이름을 바꿀 수 없다. 새 폴더는 한 단계만 만든다.
 * - 이름은 영문 소문자로 바꾸고 시간+무작위 값을 붙여 겹치지 않게 저장한다 (같은 이름 때문에 예전 그림이 캐시로 보이는 문제 방지).
 * - 지우면 uploads/.trash 로 옮기고 30일 동안 되살릴 수 있다. 30일이 지나면 목록을 볼 때 정리한다.
 * - 파일 내용의 앞부분(시그니처)으로 실제 형식을 확인한다. SVG 는 스크립트를 담을 수 있어서 받지 않는다.
 * php-api/files.php 와 같은 규칙이어야 한다.
 */
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const TRASH_DIR = path.join(UPLOAD_DIR, ".trash");
const SYSTEM_FOLDERS = ["main", "sub", "logo", "slide"];
const FOLDER_NAME = /^[a-z0-9_-]{1,40}$/;
const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/i;
const TRASH_DAYS = 30;
const MB = 1024 * 1024;

// 형식별 확장자, 최대 크기, 내용 시그니처 검사
const TYPES = {
  "image/png": { ext: "png", max: 10 * MB, check: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  "image/jpeg": { ext: "jpg", max: 10 * MB, check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { ext: "gif", max: 10 * MB, check: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  "image/webp": { ext: "webp", max: 10 * MB, check: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  "image/x-icon": { ext: "ico", max: 1 * MB, check: (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 },
  "image/vnd.microsoft.icon": { ext: "ico", max: 1 * MB, check: (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 },
  "application/pdf": { ext: "pdf", max: 30 * MB, check: (b) => b.subarray(0, 4).toString("latin1") === "%PDF" },
  "video/mp4": { ext: "mp4", max: 100 * MB, check: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  "video/webm": { ext: "webm", max: 100 * MB, check: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};
const EXTENSIONS = [...new Set(Object.values(TYPES).map((t) => t.ext))];

for (const folder of SYSTEM_FOLDERS) fs.mkdirSync(path.join(UPLOAD_DIR, folder), { recursive: true });
fs.mkdirSync(TRASH_DIR, { recursive: true });

class FileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function folders() {
  const custom = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && FOLDER_NAME.test(entry.name) && !SYSTEM_FOLDERS.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
  return [...SYSTEM_FOLDERS, ...custom];
}

function folderOf(value) {
  return typeof value === "string" && folders().includes(value) ? value : null;
}

function isFileName(name) {
  return FILE_NAME.test(name) && EXTENSIONS.includes(path.extname(name).slice(1).toLowerCase());
}

function toFile(folder, name) {
  const stat = fs.statSync(path.join(UPLOAD_DIR, folder, name));
  return { name, folder, url: `/uploads/${folder}/${name}`, size: stat.size, createdAt: stat.mtime.toISOString() };
}

function filesIn(folder) {
  return fs.readdirSync(path.join(UPLOAD_DIR, folder)).filter(isFileName).map((name) => toFile(folder, name));
}

/** 원래 이름에서 영문/숫자만 남긴 기본 이름 */
function baseName(raw) {
  return String(raw || "file")
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "file";
}

function uniqueName(base, ext) {
  return `${base}-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}.${ext}`;
}

function existingFile(folderValue, name) {
  const folder = folderOf(folderValue);
  const file = folder && isFileName(name) ? path.join(UPLOAD_DIR, folder, name) : "";
  if (!file || !fs.existsSync(file)) throw new FileError(404, "파일을 찾을 수 없습니다.");
  return { folder, file };
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

// ---- 휴지통: 파일 이름은 "<지운 시각>~<폴더>~<원래 이름>" ----
const TRASH_NAME = /^(\d{13})~([a-z0-9_-]{1,40})~([a-z0-9][a-z0-9._-]{0,120})$/i;

function trashEntries() {
  const now = Date.now();
  const entries = [];
  for (const id of fs.readdirSync(TRASH_DIR)) {
    const match = TRASH_NAME.exec(id);
    if (!match) continue;
    const deletedAt = Number(match[1]);
    const full = path.join(TRASH_DIR, id);
    if (now - deletedAt > TRASH_DAYS * 24 * 3600 * 1000) {
      fs.unlinkSync(full);
      continue;
    }
    entries.push({ id, folder: match[2], name: match[3], size: fs.statSync(full).size, deletedAt: new Date(deletedAt).toISOString() });
  }
  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function trashFile(id) {
  if (!TRASH_NAME.test(id) || !fs.existsSync(path.join(TRASH_DIR, id))) throw new FileError(404, "휴지통에서 파일을 찾을 수 없습니다.");
  return path.join(TRASH_DIR, id);
}

const router = express.Router();
router.use(requireAuth);

function handle(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (error) {
      if (error instanceof FileError) return res.status(error.status).json({ success: false, message: error.message });
      console.error("File manager failed", error.message);
      return res.status(500).json({ success: false, message: "파일 작업을 하지 못했습니다." });
    }
  };
}

// 파일 목록: ?folder= 가 없으면 모든 폴더
router.get("/", handle((req, res) => {
  const list = folderOf(req.query.folder) ? [req.query.folder] : folders();
  const files = list.flatMap(filesIn).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ success: true, files });
}));

// 폴더 목록과 사용 용량
router.get("/folders", handle((req, res) => {
  const list = folders().map((name) => {
    const files = filesIn(name);
    return { name, system: SYSTEM_FOLDERS.includes(name), count: files.length, size: files.reduce((sum, f) => sum + f.size, 0) };
  });
  const quotaMb = Number(process.env.STORAGE_QUOTA_MB) || 0;
  res.json({ success: true, folders: list, usage: { used: dirSize(UPLOAD_DIR), quota: quotaMb * MB } });
}));

router.post("/folders", handle((req, res) => {
  const name = String(req.body?.name || "").trim().toLowerCase();
  if (!FOLDER_NAME.test(name)) throw new FileError(400, "폴더 이름은 영문 소문자, 숫자, -, _ 로 40자까지 쓸 수 있습니다.");
  if (folders().includes(name) || ["trash", "folders"].includes(name)) throw new FileError(409, "이미 있거나 쓸 수 없는 폴더 이름입니다.");
  fs.mkdirSync(path.join(UPLOAD_DIR, name));
  res.status(201).json({ success: true, folder: name });
}));

router.delete("/folders/:name", handle((req, res) => {
  const name = folderOf(req.params.name);
  if (!name) throw new FileError(404, "폴더를 찾을 수 없습니다.");
  if (SYSTEM_FOLDERS.includes(name)) throw new FileError(400, "시스템 폴더는 지울 수 없습니다.");
  if (fs.readdirSync(path.join(UPLOAD_DIR, name)).length > 0) throw new FileError(400, "빈 폴더만 지울 수 있습니다.");
  fs.rmdirSync(path.join(UPLOAD_DIR, name));
  res.json({ success: true });
}));

// 올리기: 화면이 파일 내용을 그대로 보낸다 (raw body)
router.post("/", express.raw({ type: "*/*", limit: 100 * MB }), handle((req, res) => {
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const rule = TYPES[type];
  if (!rule) throw new FileError(400, "이미지(PNG, JPG, GIF, WEBP, ICO), PDF, 동영상(MP4, WEBM)만 올릴 수 있습니다.");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new FileError(400, "파일 내용이 비어 있습니다.");
  if (req.body.length > rule.max) throw new FileError(413, `이 형식은 ${rule.max / MB}MB 까지 올릴 수 있습니다.`);
  if (!rule.check(req.body)) throw new FileError(400, "파일 내용이 확장자와 맞지 않습니다.");

  const folder = folderOf(req.query.folder) || "main";
  const name = uniqueName(baseName(req.query.name), rule.ext);
  fs.writeFileSync(path.join(UPLOAD_DIR, folder, name), req.body);
  res.status(201).json({ success: true, file: toFile(folder, name) });
}));

// 휴지통 (아래 /:folder/:name 보다 먼저 둔다)
router.get("/trash", handle((req, res) => {
  res.json({ success: true, files: trashEntries() });
}));

router.post("/trash/:id/restore", handle((req, res) => {
  const source = trashFile(req.params.id);
  const [, , folderName, name] = TRASH_NAME.exec(req.params.id);
  // 원래 폴더가 없어졌으면 main 으로, 같은 이름이 있으면 새 이름으로 되살린다
  const folder = folderOf(folderName) || "main";
  let target = path.join(UPLOAD_DIR, folder, name);
  if (fs.existsSync(target)) target = path.join(UPLOAD_DIR, folder, uniqueName(baseName(name), path.extname(name).slice(1)));
  fs.renameSync(source, target);
  res.json({ success: true, file: toFile(folder, path.basename(target)) });
}));

router.delete("/trash/:id", handle((req, res) => {
  fs.unlinkSync(trashFile(req.params.id));
  res.json({ success: true });
}));

// 이름 바꾸기, 다른 폴더로 옮기기: { name?, folder? }
router.put("/:folder/:name", handle((req, res) => {
  const { folder, file } = existingFile(req.params.folder, req.params.name);
  const ext = path.extname(req.params.name).slice(1).toLowerCase();
  const nextFolder = req.body?.folder === undefined ? folder : folderOf(req.body.folder);
  if (!nextFolder) throw new FileError(400, "옮길 폴더를 찾을 수 없습니다.");
  const nextName = req.body?.name === undefined ? req.params.name : `${baseName(req.body.name)}.${ext}`;
  if (!isFileName(nextName)) throw new FileError(400, "파일 이름은 영문, 숫자, -, _ 로 쓸 수 있습니다.");
  const target = path.join(UPLOAD_DIR, nextFolder, nextName);
  if (target !== file && fs.existsSync(target)) throw new FileError(409, "같은 이름의 파일이 이미 있습니다.");
  fs.renameSync(file, target);
  res.json({ success: true, file: toFile(nextFolder, nextName) });
}));

// 지우기 = 휴지통으로 옮기기
router.delete("/:folder/:name", handle((req, res) => {
  const { folder, file } = existingFile(req.params.folder, req.params.name);
  fs.renameSync(file, path.join(TRASH_DIR, `${Date.now()}~${folder}~${req.params.name}`));
  res.json({ success: true, message: "휴지통으로 옮겼습니다. 30일 안에 되살릴 수 있습니다." });
}));

// 너무 큰 파일은 express.raw 가 413 으로 막는다.
router.use((error, req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "100MB 이하 파일만 올릴 수 있습니다." });
  }
  return next(error);
});

module.exports = { router, UPLOAD_DIR, dirSize };
