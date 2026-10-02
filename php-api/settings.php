<?php
// 사이트 설정. backend/src/services/siteSettingsService.js 와 같은 키, 같은 규칙.

const SETTING_KEYS = [
    'siteTitle', 'siteUrl', 'titleSeparator', 'siteDescription', 'keywords',
    'logoType', 'logoText', 'logoImage', 'favicon', 'ogImage',
    'naverVerification', 'googleVerification', 'extraMeta', 'robots',
    'customCss', 'headTop', 'headBottom', 'bodyTop', 'bodyBottom',
    'adminMemo', 'menu', 'popups',
];
// 코드라서 제작자만 바꿀 수 있는 칸
const SETTING_CODE_KEYS = ['customCss', 'headTop', 'headBottom', 'bodyTop', 'bodyBottom', 'extraMeta'];
// 저장할 때 이전 값을 남기는 칸 (최근 10건)
const SETTING_HISTORY_KEYS = ['customCss', 'headTop', 'headBottom', 'bodyTop', 'bodyBottom', 'extraMeta', 'robots'];
const SETTING_PRIVATE_KEYS = ['adminMemo', 'robots'];

function ensure_settings_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS site_settings (
        k VARCHAR(64) NOT NULL,
        v LONGTEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (k)
    ) DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS site_settings_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        k VARCHAR(64) NOT NULL,
        v LONGTEXT NULL,
        user_id BIGINT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_site_settings_history_k (k)
    ) DEFAULT CHARSET=utf8mb4");
}

function settings_all(): array
{
    ensure_settings_tables();
    $settings = array_fill_keys(SETTING_KEYS, '');
    foreach (db()->query('SELECT k, v FROM site_settings')->fetchAll() as $row) {
        if (in_array($row['k'], SETTING_KEYS, true)) $settings[$row['k']] = (string) ($row['v'] ?? '');
    }
    return $settings;
}

function settings_public(): array
{
    $all = settings_all();
    foreach (SETTING_PRIVATE_KEYS as $key) unset($all[$key]);
    return $all;
}

// 메뉴 JSON 정리: 최대 4단계, 주소는 사이트 안 주소, #, http(s), mailto, tel 만
function settings_clean_menu($items, int $depth = 1): array
{
    if (!is_array($items) || $depth > 4) return [];
    $out = [];
    foreach (array_slice($items, 0, 50) as $item) {
        if (!is_array($item)) continue;
        $href = trim((string) ($item['href'] ?? '#'));
        $entry = [
            'id' => is_string($item['id'] ?? null) && $item['id'] !== '' ? substr($item['id'], 0, 40) : 'm-' . bin2hex(random_bytes(4)),
            'label' => mb_substr((string) ($item['label'] ?? ''), 0, 60),
            'href' => preg_match('~^(/(?!/)|#|https?://|mailto:|tel:)~i', $href) ? substr($href, 0, 500) : '#',
            'target' => ($item['target'] ?? '') === '_blank' ? '_blank' : '_self',
        ];
        if (($item['hidden'] ?? false) === true) $entry['hidden'] = true;
        $entry['children'] = settings_clean_menu($item['children'] ?? [], $depth + 1);
        $out[] = $entry;
    }
    return $out;
}

// 팝업 JSON 정리 (siteSettingsService.js 의 cleanPopups 와 같음)
function settings_clean_popups($list): array
{
    if (!is_array($list)) return [];
    $clamp = fn ($v, int $fallback, int $min, int $max) => is_int($v) || is_float($v) ? (int) min($max, max($min, round($v))) : $fallback;
    $out = [];
    foreach (array_slice($list, 0, 20) as $item) {
        if (!is_array($item)) continue;
        $link = trim((string) ($item['link'] ?? ''));
        $image = trim((string) ($item['image'] ?? ''));
        $out[] = [
            'id' => substr((string) ($item['id'] ?? ''), 0, 40) ?: 'p-' . bin2hex(random_bytes(3)),
            'title' => mb_substr((string) ($item['title'] ?? ''), 0, 100),
            'active' => ($item['active'] ?? false) === true,
            'startAt' => substr((string) ($item['startAt'] ?? ''), 0, 20),
            'endAt' => substr((string) ($item['endAt'] ?? ''), 0, 20),
            'permanent' => ($item['permanent'] ?? false) === true,
            'position' => in_array($item['position'] ?? '', ['center', 'left-top', 'right-top', 'left-bottom', 'right-bottom'], true) ? $item['position'] : 'left-top',
            'offsetX' => $clamp($item['offsetX'] ?? null, 40, 0, 2000),
            'offsetY' => $clamp($item['offsetY'] ?? null, 120, 0, 2000),
            'width' => $clamp($item['width'] ?? null, 400, 200, 1200),
            'image' => preg_match('~^(/(?!/)|https://)~i', $image) ? substr($image, 0, 500) : '',
            'text' => mb_substr((string) ($item['text'] ?? ''), 0, 2000),
            'link' => $link !== '' && preg_match('~^(/(?!/)|#|https?://|mailto:|tel:)~i', $link) ? substr($link, 0, 500) : '',
            'linkTarget' => ($item['linkTarget'] ?? '') === '_blank' ? '_blank' : '_self',
        ];
    }
    return $out;
}

function settings_clean(string $key, $value): string
{
    if ($key === 'popups') {
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? json_encode(settings_clean_popups($decoded), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
    }
    if ($key === 'menu') {
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? json_encode(settings_clean_menu($decoded), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
    }
    $text = mb_substr((string) $value, 0, 200000);
    if ($key === 'naverVerification' || $key === 'googleVerification') return preg_replace('/[^A-Za-z0-9_-]/', '', $text);
    if ($key === 'logoType') return in_array($text, ['image', 'text', 'both'], true) ? $text : 'image';
    return $text;
}

function settings_update($changes, array $user): array
{
    $current = settings_all();
    $stmt = db()->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$user['id']]);
    $isDeveloper = $stmt->fetchColumn() === 'developer';

    $next = [];
    foreach ((array) $changes as $key => $value) {
        if (!in_array($key, SETTING_KEYS, true)) continue;
        $cleaned = settings_clean($key, $value);
        if ($cleaned === $current[$key]) continue;
        if (in_array($key, SETTING_CODE_KEYS, true) && !$isDeveloper) {
            fail(403, '추가 CSS, 스크립트, 메타태그는 제작자 계정만 바꿀 수 있습니다.');
        }
        $next[$key] = $cleaned;
    }

    foreach ($next as $key => $value) {
        if (in_array($key, SETTING_HISTORY_KEYS, true) && $current[$key] !== '') {
            db()->prepare('INSERT INTO site_settings_history (k, v, user_id) VALUES (?, ?, ?)')->execute([$key, $current[$key], $user['id']]);
            db()->prepare('DELETE FROM site_settings_history WHERE k = ? AND id NOT IN (SELECT id FROM (SELECT id FROM site_settings_history WHERE k = ? ORDER BY id DESC LIMIT 10) AS keep)')
                ->execute([$key, $key]);
        }
        db()->prepare('INSERT INTO site_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)')->execute([$key, $value]);
    }
    return settings_all();
}

function settings_history(string $key): array
{
    if (!in_array($key, SETTING_HISTORY_KEYS, true)) return [];
    ensure_settings_tables();
    $stmt = db()->prepare('SELECT h.id, h.v, h.created_at, u.email FROM site_settings_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.k = ? ORDER BY h.id DESC LIMIT 10');
    $stmt->execute([$key]);
    return array_map(fn ($row) => [
        'id' => (int) $row['id'], 'value' => (string) $row['v'], 'createdAt' => iso_date($row['created_at']), 'email' => (string) ($row['email'] ?? ''),
    ], $stmt->fetchAll());
}

function send_text(string $type, string $body): void
{
    header("Content-Type: $type; charset=utf-8");
    echo $body;
    exit;
}

function robots_txt(): string
{
    $robots = settings_all()['robots'];
    return trim($robots) !== '' ? $robots : "User-agent: *\nAllow: /\n";
}

function sitemap_xml(): string
{
    $settings = settings_all();
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $origin = rtrim(trim($settings['siteUrl']) !== '' ? trim($settings['siteUrl']) : $https . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), '/');
    $rows = db()->query('SELECT slug, is_home, updated_at FROM pages ORDER BY is_home DESC, id')->fetchAll();
    $lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    foreach ($rows as $row) {
        $loc = $row['is_home'] ? "$origin/" : "$origin/" . $row['slug'];
        $lastmod = substr(iso_date($row['updated_at']), 0, 10);
        $lines[] = '  <url><loc>' . htmlspecialchars($loc, ENT_XML1 | ENT_QUOTES) . "</loc><lastmod>$lastmod</lastmod></url>";
    }
    $lines[] = '</urlset>';
    return implode("\n", $lines) . "\n";
}

function handle_settings(string $method, ?string $historyKey, array $user): void
{
    if ($method === 'GET' && $historyKey !== null) send_json(200, ['success' => true, 'history' => settings_history($historyKey)]);
    if ($method === 'GET') send_json(200, ['success' => true, 'settings' => settings_all(), 'codeKeys' => SETTING_CODE_KEYS]);
    if ($method === 'PUT') send_json(200, ['success' => true, 'settings' => settings_update(request_body()->settings ?? [], $user)]);
    fail(405, '지원하지 않는 요청입니다.');
}
