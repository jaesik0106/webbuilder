<?php
// 파일관리자 (backend/src/routes/files.js 와 같은 동작).
// 이미지는 사이트 루트의 /uploads/<폴더> 에 저장하고, 아파치가 그대로 보여 준다.
// 폴더는 메인 페이지용(main)과 서브 페이지용(sub) 두 개만 쓴다.

const FILES_MAX_BYTES = 10485760;
// SVG 는 스크립트를 담을 수 있어서 받지 않는다.
const FILES_FOLDERS = ['main', 'sub'];
const FILES_ALLOWED = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];

function files_dir(string $folder = ''): string
{
    $root = dirname(__DIR__) . '/uploads';
    $dir = $folder === '' ? $root : "$root/$folder";
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    // 올린 파일이 PHP 로 실행되지 않게 막는다.
    $htaccess = "$root/.htaccess";
    if (!is_file($htaccess)) {
        file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh)$\">\n  Require all denied\n</FilesMatch>\nRemoveHandler .php .phtml .phar\n");
    }
    return $dir;
}

function files_valid_name(string $name): bool
{
    return (bool) preg_match('/^[a-z0-9][a-z0-9._-]{0,120}$/i', $name)
        && in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), array_values(FILES_ALLOWED), true);
}

function files_entry(string $folder, string $name): array
{
    $path = files_dir($folder) . "/$name";
    return ['name' => $name, 'folder' => $folder, 'url' => "/uploads/$folder/$name", 'size' => filesize($path), 'createdAt' => gmdate('Y-m-d\TH:i:s.000\Z', filemtime($path))];
}

function handle_files(string $method, ?string $folder, ?string $name): void
{
    $queryFolder = in_array($_GET['folder'] ?? '', FILES_FOLDERS, true) ? $_GET['folder'] : null;

    if ($method === 'GET' && $name === null) {
        $entries = [];
        foreach ($queryFolder ? [$queryFolder] : FILES_FOLDERS as $dirName) {
            foreach (array_filter(scandir(files_dir($dirName)), 'files_valid_name') as $file) {
                $entries[] = files_entry($dirName, $file);
            }
        }
        usort($entries, fn ($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
        send_json(200, ['success' => true, 'files' => $entries]);
    }

    if ($method === 'POST' && $name === null) {
        $type = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        $ext = FILES_ALLOWED[$type] ?? null;
        if (!$ext) fail(400, 'PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.');
        $data = file_get_contents('php://input');
        if ($data === false || $data === '') fail(400, '파일 내용이 비어 있습니다.');
        if (strlen($data) > FILES_MAX_BYTES) fail(413, '10MB 이하 이미지만 올릴 수 있습니다.');
        // 내용이 정말 이미지인지 한 번 더 확인한다.
        if (function_exists('getimagesizefromstring') && $type !== 'image/webp' && @getimagesizefromstring($data) === false) {
            fail(400, '이미지 파일이 아닙니다.');
        }

        $base = strtolower(preg_replace('/\.[^.]*$/', '', (string) ($_GET['name'] ?? 'image')));
        $base = trim(preg_replace('/[^a-z0-9-]+/', '-', $base), '-');
        $base = substr($base, 0, 40) ?: 'image';
        $fileName = $base . '-' . base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(3)) . ".$ext";
        $target = $queryFolder ?? 'main';
        if (file_put_contents(files_dir($target) . "/$fileName", $data) === false) fail(500, '파일을 저장하지 못했습니다.');
        send_json(201, ['success' => true, 'file' => files_entry($target, $fileName)]);
    }

    if ($method === 'DELETE' && $name !== null) {
        if (!in_array($folder, FILES_FOLDERS, true) || !files_valid_name($name)) fail(404, '파일을 찾을 수 없습니다.');
        $path = files_dir($folder) . "/$name";
        if (!is_file($path)) fail(404, '파일을 찾을 수 없습니다.');
        unlink($path);
        send_json(200, ['success' => true, 'message' => '파일을 삭제했습니다.']);
    }

    fail(404, '요청한 주소를 찾을 수 없습니다.');
}
