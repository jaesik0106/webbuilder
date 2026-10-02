<?php
// 방문자 기록과 대시보드 숫자. backend/src/routes/stats.js 와 같은 동작.
// 방문자는 하루에 한 번만 센다. IP 자체는 저장하지 않는다.

function ensure_visits_table(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS visits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        visited_on DATE NOT NULL,
        visitor_hash CHAR(32) NOT NULL,
        path VARCHAR(200) NOT NULL DEFAULT '/',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_visits_day_visitor (visited_on, visitor_hash)
    ) DEFAULT CHARSET=utf8mb4");
}

function stats_today(): string
{
    return gmdate('Y-m-d', time() + 9 * 3600); // 한국 날짜
}

function stats_visit(): void
{
    ensure_visits_table();
    $day = stats_today();
    $raw = ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '') . "|$day|" . (string) config_value('JWT_SECRET', '');
    $hash = substr(hash('sha256', $raw), 0, 32);
    $path = mb_substr((string) (request_body()->path ?? '/'), 0, 200);
    db()->prepare('INSERT IGNORE INTO visits (visited_on, visitor_hash, path) VALUES (?, ?, ?)')->execute([$day, $hash, $path]);
    send_json(200, ['success' => true]);
}

function stats_dashboard(): void
{
    ensure_visits_table();
    require_once __DIR__ . '/files.php';
    $day = stats_today();
    $stmt = db()->prepare("SELECT DATE_FORMAT(visited_on, '%Y-%m-%d') AS day, COUNT(*) AS count FROM visits WHERE visited_on > DATE_SUB(?, INTERVAL 30 DAY) GROUP BY visited_on");
    $stmt->execute([$day]);
    $counts = [];
    foreach ($stmt->fetchAll() as $row) $counts[$row['day']] = (int) $row['count'];
    $days = [];
    for ($i = 13; $i >= 0; $i--) {
        $key = gmdate('Y-m-d', strtotime("$day -$i day UTC"));
        $days[] = ['day' => $key, 'count' => $counts[$key] ?? 0];
    }
    $last30 = array_sum($counts);
    $recent = db()->query('SELECT id, name, slug, is_home, updated_at FROM pages ORDER BY updated_at DESC LIMIT 5')->fetchAll();
    send_json(200, [
        'success' => true,
        'visitors' => [
            'today' => $counts[$day] ?? 0, 'last30' => $last30, 'dailyAverage' => round($last30 / 30, 1),
            'total' => (int) db()->query('SELECT COUNT(*) FROM visits')->fetchColumn(), 'days' => $days,
        ],
        'pages' => (int) db()->query('SELECT COUNT(*) FROM pages')->fetchColumn(),
        'recentPages' => array_map(fn ($row) => [
            'id' => (int) $row['id'], 'name' => $row['name'], 'slug' => $row['slug'], 'isHome' => (bool) $row['is_home'], 'updatedAt' => iso_date($row['updated_at']),
        ], $recent),
        'storage' => ['used' => files_dir_size(files_root()), 'quota' => (int) config_value('STORAGE_QUOTA_MB', 0) * 1048576],
    ]);
}
