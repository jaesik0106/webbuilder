<?php
// 닷홈 같은 아파치 + PHP 웹호스팅용 백엔드 공용 함수.
// Node(Express) 백엔드(backend/)와 같은 API, 같은 응답 모양을 유지한다.

function config_value(string $key, $default = null)
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        $config = is_file($file) ? require $file : [];
    }
    return $config[$key] ?? $default;
}

function send_json(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): void
{
    send_json($status, ['success' => false, 'message' => $message]);
}

// 빈 객체 {} 가 [] 로 바뀌지 않도록 JSON 객체는 stdClass 로 읽는다.
function request_body(): stdClass
{
    $raw = file_get_contents('php://input');
    $data = ($raw === '' || $raw === false) ? null : json_decode($raw);
    return $data instanceof stdClass ? $data : new stdClass();
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            config_value('DB_HOST', 'localhost'),
            (int) config_value('DB_PORT', 3306),
            config_value('DB_NAME')
        );
        $pdo = new PDO($dsn, config_value('DB_USER'), config_value('DB_PASSWORD'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        init_db($pdo);
    }
    return $pdo;
}

// 처음 실행할 때 테이블을 만들고, 계정이 없으면 config 의 관리자 계정을 만든다.
function init_db(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        email VARCHAR(191) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
    ) DEFAULT CHARSET=utf8mb4");
    // 오래된 MySQL 도 지원하도록 config 는 JSON 대신 LONGTEXT 로 저장한다.
    $pdo->exec("CREATE TABLE IF NOT EXISTS pages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(255) NOT NULL,
        config LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_pages_user_id (user_id)
    ) DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ai_usage (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        page_id BIGINT UNSIGNED NULL,
        prompt VARCHAR(2000) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ai_usage_user_id (user_id)
    ) DEFAULT CHARSET=utf8mb4");

    // 메인/서브 페이지 구분 칸 (이미 만든 테이블에도 추가)
    $columns = $pdo->query('SHOW COLUMNS FROM pages')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('slug', $columns, true)) $pdo->exec('ALTER TABLE pages ADD COLUMN slug VARCHAR(60) NULL UNIQUE AFTER name');
    if (!in_array('is_home', $columns, true)) $pdo->exec('ALTER TABLE pages ADD COLUMN is_home TINYINT(1) NOT NULL DEFAULT 0 AFTER slug');
    $pdo->exec("UPDATE pages SET slug = CONCAT('page-', id) WHERE slug IS NULL");
    if ((int) $pdo->query('SELECT COUNT(*) FROM pages WHERE is_home = 1')->fetchColumn() === 0) {
        $pdo->exec('UPDATE pages SET is_home = 1 ORDER BY updated_at DESC LIMIT 1');
    }

    $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $email = normalize_email((string) config_value('ADMIN_EMAIL', ''));
    $password = (string) config_value('ADMIN_PASSWORD', '');
    if ($count === 0 && validate_credentials($email, $password) === null) {
        $stmt = $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
        $stmt->execute([$email, password_hash($password, PASSWORD_BCRYPT)]);
    }
}

function normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function validate_credentials(string $email, $password): ?string
{
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return '이메일 형식이 올바르지 않습니다.';
    if (!is_string($password) || strlen($password) < 8) return '비밀번호는 8자 이상이어야 합니다.';
    return null;
}

// ---- JWT (HS256). Node 백엔드가 만든 토큰과 서로 호환된다. ----

function b64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64url_decode(string $data): string
{
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

function jwt_sign(array $payload): string
{
    $header = b64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + 7 * 24 * 3600;
    $body = b64url_encode(json_encode($payload));
    $signature = b64url_encode(hash_hmac('sha256', "$header.$body", (string) config_value('JWT_SECRET'), true));
    return "$header.$body.$signature";
}

function jwt_verify(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $body, $signature] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', "$header.$body", (string) config_value('JWT_SECRET'), true));
    if (!hash_equals($expected, $signature)) return null;
    $payload = json_decode(b64url_decode($body), true);
    if (!is_array($payload) || (isset($payload['exp']) && $payload['exp'] < time())) return null;
    return $payload;
}

function bearer_token(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('apache_request_headers')) {
        $headers = array_change_key_case(apache_request_headers(), CASE_LOWER);
        $header = $headers['authorization'] ?? '';
    }
    return preg_match('/^Bearer\s+(.+)$/i', $header, $m) ? trim($m[1]) : '';
}

function require_auth(): array
{
    $payload = jwt_verify(bearer_token());
    if (!$payload || !isset($payload['userId'])) fail(401, '로그인이 필요합니다.');
    return ['id' => (int) $payload['userId'], 'email' => (string) ($payload['email'] ?? '')];
}

// ---- 페이지 ----

function iso_date($value): string
{
    $time = strtotime((string) $value);
    return $time ? gmdate('Y-m-d\TH:i:s.000\Z', $time) : (string) $value;
}

function to_page(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'slug' => $row['slug'] ?? null,
        'isHome' => (bool) ($row['is_home'] ?? false),
        'config' => json_decode($row['config']),
        'createdAt' => iso_date($row['created_at']),
        'updatedAt' => iso_date($row['updated_at']),
    ];
}

function validate_config($config): ?string
{
    if (!($config instanceof stdClass)) return '페이지 JSON 형식이 올바르지 않습니다.';
    if (property_exists($config, 'blocks') && !is_array($config->blocks)) return 'blocks는 배열이어야 합니다.';
    return null;
}

function encode_config($config): string
{
    return json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

const PAGE_COLUMNS = 'id, name, slug, is_home, config, created_at, updated_at';
const RESERVED_SLUGS = ['admin', 'login', 'page', 'settings', 'deploy', 'api', 'uploads', 'assets', 'new'];

function get_page($id): ?array
{
    $stmt = db()->prepare('SELECT ' . PAGE_COLUMNS . ' FROM pages WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $id]);
    $row = $stmt->fetch();
    return $row ? to_page($row) : null;
}

function get_page_by_slug(string $slug): ?array
{
    $stmt = db()->prepare('SELECT ' . PAGE_COLUMNS . ' FROM pages WHERE slug = ? LIMIT 1');
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    return $row ? to_page($row) : null;
}

function validate_slug(string $slug): ?string
{
    if (!preg_match('/^[a-z0-9][a-z0-9-]{0,59}$/', $slug)) return '주소는 영문 소문자, 숫자, -(하이픈)만 쓸 수 있습니다.';
    if (in_array($slug, RESERVED_SLUGS, true)) return '관리자 화면에서 쓰는 주소라 사용할 수 없습니다.';
    return null;
}
