<?php
// /api/* 요청을 모두 받는 라우터. 루트 .htaccess 가 /api/ 로 시작하는 주소를 이 파일로 보낸다.
require __DIR__ . '/lib.php';
require __DIR__ . '/ai.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$apiPos = strpos($uri, '/api/');
$path = '/' . trim($apiPos === false ? '' : substr($uri, $apiPos + 5), '/');

try {
    if ($method === 'GET' && $path === '/health') {
        send_json(200, ['success' => true, 'message' => 'Web Builder API is running']);
    }

    if ($method === 'GET' && $path === '/health/db') {
        db()->query('SELECT 1');
        send_json(200, ['success' => true, 'message' => 'Database connection is working']);
    }

    // ---- 인증 (회원가입 없음: 관리자 계정은 config.php 의 ADMIN_EMAIL / ADMIN_PASSWORD 로 만든다) ----
    if ($method === 'POST' && $path === '/auth/login') {
        $body = request_body();
        $email = normalize_email((string) ($body->email ?? ''));
        $password = $body->password ?? '';
        if ($error = validate_credentials($email, $password)) fail(400, $error);

        $stmt = db()->prepare('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        // Node 의 bcryptjs 가 만든 $2a$/$2b$ 해시도 PHP password_verify 로 확인된다.
        if (!$user || !password_verify($password, $user['password_hash'])) {
            fail(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
        }
        $token = jwt_sign(['userId' => (int) $user['id'], 'email' => $user['email']]);
        send_json(200, ['success' => true, 'token' => $token, 'user' => ['id' => (int) $user['id'], 'email' => $user['email']]]);
    }

    if ($method === 'GET' && $path === '/auth/me') {
        send_json(200, ['success' => true, 'user' => require_auth()]);
    }

    // ---- 공개 홈: 가장 최근 수정된 페이지 하나 ----
    if ($method === 'GET' && $path === '/public/home') {
        $row = db()->query('SELECT ' . PAGE_COLUMNS . ' FROM pages ORDER BY is_home DESC, updated_at DESC, id DESC LIMIT 1')->fetch();
        send_json(200, ['success' => true, 'page' => $row ? to_page($row) : null]);
    }

    // 서브 페이지: /about 같은 주소
    if ($method === 'GET' && preg_match('#^/public/pages/([A-Za-z0-9-]+)$#', $path, $match)) {
        $page = get_page_by_slug(strtolower($match[1]));
        $page ? send_json(200, ['success' => true, 'page' => $page]) : fail(404, '페이지를 찾을 수 없습니다.');
    }

    // ---- 파일관리자 ----
    if ($path === '/files' || preg_match('#^/files/(main|sub)/([A-Za-z0-9._-]+)$#', $path, $match)) {
        require_auth();
        require __DIR__ . '/files.php';
        handle_files($method, $match[1] ?? null, $match[2] ?? null);
    }

    // ---- 페이지 (관리자 공용) ----
    if ($path === '/pages' || preg_match('#^/pages/(\d+)$#', $path, $match)) {
        $user = require_auth();
        $id = isset($match[1]) ? (int) $match[1] : null;

        if ($method === 'GET' && $id === null) {
            $rows = db()->query('SELECT ' . PAGE_COLUMNS . ' FROM pages ORDER BY is_home DESC, updated_at DESC')->fetchAll();
            send_json(200, ['success' => true, 'pages' => array_map('to_page', $rows)]);
        }

        if ($method === 'GET') {
            $page = get_page($id);
            $page ? send_json(200, ['success' => true, 'page' => $page]) : fail(404, '페이지를 찾을 수 없습니다.');
        }

        if ($method === 'POST' && $id === null) {
            $body = request_body();
            $config = $body->config ?? null;
            if ($error = validate_config($config)) fail(400, $error);
            $name = trim((string) ($body->name ?? $config->name ?? '')) ?: 'Untitled';
            // 첫 페이지는 자동으로 메인 페이지가 된다.
            $hasHome = (int) db()->query('SELECT COUNT(*) FROM pages WHERE is_home = 1')->fetchColumn() > 0;
            $stmt = db()->prepare('INSERT INTO pages (user_id, name, is_home, config) VALUES (?, ?, ?, ?)');
            $stmt->execute([$user['id'], $name, $hasHome ? 0 : 1, encode_config($config)]);
            $newId = (int) db()->lastInsertId();
            db()->prepare('UPDATE pages SET slug = ? WHERE id = ?')->execute(["page-$newId", $newId]);
            send_json(201, ['success' => true, 'message' => '페이지를 저장했습니다.', 'page' => get_page($newId)]);
        }

        if ($method === 'PUT' && $id !== null) {
            $body = request_body();
            $existing = get_page($id);
            if (!$existing) fail(404, '페이지를 찾을 수 없습니다.');
            $config = property_exists($body, 'config') ? $body->config : null;
            if ($config !== null && ($error = validate_config($config))) fail(400, $error);

            if (isset($body->slug) && $body->slug !== $existing['slug']) {
                $slug = strtolower(trim((string) $body->slug));
                if ($error = validate_slug($slug)) fail(400, $error);
                $duplicate = get_page_by_slug($slug);
                if ($duplicate && $duplicate['id'] !== $id) fail(409, '이미 다른 페이지가 쓰는 주소입니다.');
                db()->prepare('UPDATE pages SET slug = ? WHERE id = ?')->execute([$slug, $id]);
            }
            if (($body->isHome ?? null) === true) {
                db()->prepare('UPDATE pages SET is_home = (id = ?)')->execute([$id]);
            }
            if (property_exists($body, 'name') || $config !== null) {
                $name = trim((string) ($body->name ?? $config->name ?? '')) ?: $existing['name'];
                $stmt = db()->prepare('UPDATE pages SET name = ?, config = ? WHERE id = ?');
                $stmt->execute([$name, encode_config($config ?? $existing['config']), $id]);
            }
            send_json(200, ['success' => true, 'message' => '페이지를 수정했습니다.', 'page' => get_page($id)]);
        }

        if ($method === 'DELETE' && $id !== null) {
            $existing = get_page($id);
            $stmt = db()->prepare('DELETE FROM pages WHERE id = ?');
            $stmt->execute([$id]);
            // 메인 페이지를 지우면 가장 최근 수정된 페이지를 새 메인으로 지정한다.
            if ($existing && $existing['isHome']) db()->exec('UPDATE pages SET is_home = 1 ORDER BY updated_at DESC LIMIT 1');
            $stmt->rowCount() > 0
                ? send_json(200, ['success' => true, 'message' => '페이지를 삭제했습니다.'])
                : fail(404, '페이지를 찾을 수 없습니다.');
        }
    }

    // ---- AI ----
    if ($method === 'GET' && $path === '/ai/usage') {
        ai_usage(require_auth());
    }

    if ($method === 'POST' && $path === '/ai/revise') {
        ai_propose(require_auth(), request_body());
    }

    fail(404, '요청한 주소를 찾을 수 없습니다.');
} catch (Throwable $error) {
    error_log('API error: ' . $error->getMessage());
    fail(500, '서버 오류가 발생했습니다.');
}
