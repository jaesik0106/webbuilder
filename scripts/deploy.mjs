// 닷홈 같은 아파치 + PHP 웹호스팅에 FTP 로 배포한다.
//   npm run deploy            빌드 → deploy/ 폴더 준비 → FTP 업로드
//   npm run deploy -- --dry-run   업로드 없이 deploy/ 폴더만 만든다
// 접속 정보는 backend/.env 에서 읽는다. 실제 서버용 DB 값은 PROD_ 를 붙여 따로 둘 수 있다 (예: PROD_DB_NAME).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')

function readEnv(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = readEnv(path.join(root, 'backend', '.env'))
const prod = (key, fallback) => env[`PROD_${key}`] || env[key] || fallback || ''

function phpString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')]
  })
}

// 1. 화면 빌드
console.log('1/3 화면을 빌드합니다...')
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

// 2. 올릴 폴더 준비: dist + PHP API + config.php + .htaccess
console.log('2/3 deploy 폴더를 준비합니다...')
const out = path.join(root, 'deploy')
fs.rmSync(out, { recursive: true, force: true })
copyDir(path.join(root, 'dist'), out)
fs.mkdirSync(path.join(out, 'api'), { recursive: true })
// php-api 의 PHP 파일 전부 (config.sample.php 는 견본이라 제외) + .htaccess
const apiFiles = fs.readdirSync(path.join(root, 'php-api')).filter((name) => name.endsWith('.php') && name !== 'config.sample.php')
for (const file of [...apiFiles, '.htaccess']) {
  fs.copyFileSync(path.join(root, 'php-api', file), path.join(out, 'api', file))
}
fs.copyFileSync(path.join(root, 'php-api', 'site.htaccess'), path.join(out, '.htaccess'))

const configKeys = {
  DB_HOST: prod('DB_HOST', 'localhost'),
  DB_PORT: prod('DB_PORT', '3306'),
  DB_NAME: prod('DB_NAME'),
  DB_USER: prod('DB_USER'),
  DB_PASSWORD: prod('DB_PASSWORD'),
  JWT_SECRET: prod('JWT_SECRET'),
  ADMIN_EMAIL: prod('ADMIN_EMAIL'),
  ADMIN_PASSWORD: prod('ADMIN_PASSWORD'),
  DEVELOPER_EMAIL: prod('DEVELOPER_EMAIL'),
  DEVELOPER_PASSWORD: prod('DEVELOPER_PASSWORD'),
  STORAGE_QUOTA_MB: prod('STORAGE_QUOTA_MB', '0'),
  AI_PROVIDER: prod('AI_PROVIDER', 'gemini'),
  AI_API_KEY: prod('AI_API_KEY'),
  AI_MODEL: prod('AI_MODEL', 'claude-sonnet-4-5'),
}
if (!configKeys.DB_NAME || !configKeys.DB_USER || !configKeys.JWT_SECRET) {
  console.error('backend/.env 에 DB_NAME, DB_USER, JWT_SECRET (또는 PROD_ 값)이 필요합니다.')
  process.exit(1)
}
const configPhp = `<?php\n// npm run deploy 가 만든 파일입니다. 저장소에 올리지 마세요.\nreturn [\n${Object.entries(configKeys)
  .map(([key, value]) => `    '${key}' => ${phpString(value)},`)
  .join('\n')}\n];\n`
fs.writeFileSync(path.join(out, 'api', 'config.php'), configPhp)

const files = listFiles(out)
console.log(`   ${files.length}개 파일 준비 완료: ${out}`)
if (dryRun) {
  console.log('--dry-run 이라 업로드는 하지 않았습니다.')
  process.exit(0)
}

// 3. FTP 업로드 (Windows 기본 curl 사용, 비밀번호는 임시 설정 파일로 넘겨 명령줄에 남기지 않는다)
const host = env.FTP_HOST
const user = env.FTP_USER
const password = env.FTP_PASSWORD
if (!host || !user || !password) {
  console.error('backend/.env 에 FTP_HOST, FTP_USER, FTP_PASSWORD 가 필요합니다.')
  process.exit(1)
}
const port = env.FTP_PORT || '21'
const remoteDir = `/${(env.FTP_REMOTE_DIR || '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '')
const curlConfig = path.join(os.tmpdir(), `webbuilder-ftp-${process.pid}.cfg`)
fs.writeFileSync(curlConfig, `user = "${user.replace(/"/g, '\\"')}:${password.replace(/"/g, '\\"')}"\n`, { mode: 0o600 })

console.log(`3/3 ${host}${remoteDir || '/'} 로 업로드합니다...`)
try {
  for (const [index, file] of files.entries()) {
    const url = `ftp://${host}:${port}${remoteDir}/${file.split('/').map(encodeURIComponent).join('/')}`
    const args = ['-sS', '--ftp-create-dirs', '-K', curlConfig, '-T', path.join(out, file), url]
    if (env.FTP_SECURE === 'true') args.unshift('--ssl-reqd')
    execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    process.stdout.write(`   (${index + 1}/${files.length}) ${file}\n`)
  }
  console.log('배포를 마쳤습니다.')
} finally {
  fs.rmSync(curlConfig, { force: true })
}
