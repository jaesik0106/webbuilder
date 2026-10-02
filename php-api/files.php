<?php
// 파일관리자 (backend/src/routes/files.js 와 같은 동작, 같은 규칙).
// 파일은 사이트 루트의 /uploads/<폴더> 에 저장하고, 아파치가 그대로 보여 준다.
// - 시스템 폴더(main, sub, logo, slide)는 지우거나 바꿀 수 없다. 새 폴더는 한 단계만.
// - 지우면 uploads/.trash 로 옮기고 30일 동안 되살릴 수 있다.
// - 파일 내용의 앞부분(시그니처)으로 실제 형식을 확인한다. SVG 는 받지 않는다.

const FILES_SYSTEM_FOLDERS = ['main', 'sub', 'logo', 'slide'];
const FILES_TRASH_DAYS = 30;
const FILES_MB = 1048576;
const FILES_TYPES = [
    'image/png' => ['png', 10], 'image/jpeg' => ['jpg', 10], 'image/gif' => ['gif', 10], 'image/webp' => ['webp', 10],
    'image/x-icon' => ['ico', 1], 'image/vnd.microsoft.icon' => ['ico', 1],
    'application/pdf' => ['pdf', 30], 'video/mp4' => ['mp4', 100], 'video/webm' => ['webm', 100],
];

class FileError extends Exception
{
}

function files_root(): string
{
    $root = dirname(__DIR__) . '/uploads';
    if (!is_dir($root)) mkdir($root, 0755, true);
    // 올린 파일이 PHP 로 실행되지 않게 막는다.
    $htaccess = "$root/.htaccess";
    if (!is_file($htaccess)) {
        file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh)$\">\n  Require all denied\n</FilesMatch>\nRemoveHandler .php .phtml .phar\n");
    }
    foreach (FILES_SYSTEM_FOLDERS as $folder) if (!is_dir("$root/$folder")) mkdir("$root/$folder", 0755, true);
    // 휴지통은 바깥에서 볼 수 없게 한다.
    if (!is_dir("$root/.trash")) mkdir("$root/.trash", 0755, true);
    if (!is_file("$root/.trash/.htaccess")) file_put_contents("$root/.trash/.htaccess", "Require all denied\n");
    return $root;
}

function files_dir(string $folder): string
{
    return files_root() . "/$folder";
}

function files_folders(): array
{
    $custom = [];
    foreach (scandir(files_root()) as $entry) {
        if (preg_match('/^[a-z0-9_-]{1,40}$/', $entry) && is_dir(files_root() . "/$entry") && !in_array($entry, FILES_SYSTEM_FOLDERS, true)) {
            $custom[] = $entry;
        }
    }
    sort($custom);
    return array_merge(FILES_SYSTEM_FOLDERS, $custom);
}

function files_folder_of($value): ?string
{
    return is_string($value) && in_array($value, files_folders(), true) ? $value : null;
}

function files_extensions(): array
{
    return array_values(array_unique(array_map(fn ($t) => $t[0], FILES_TYPES)));
}

function files_valid_name(string $name): bool
{
    return (bool) preg_match('/^[a-z0-9][a-z0-9._-]{0,120}$/i', $name)
        && in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), files_extensions(), true);
}

function files_entry(string $folder, string $name): array
{
    $path = files_dir($folder) . "/$name";
    return ['name' => $name, 'folder' => $folder, 'url' => "/uploads/$folder/$name", 'size' => filesize($path), 'createdAt' => gmdate('Y-m-d\TH:i:s.000\Z', filemtime($path))];
}

function files_in(string $folder): array
{
    $entries = [];
    foreach (array_filter(scandir(files_dir($folder)), 'files_valid_name') as $file) $entries[] = files_entry($folder, $file);
    return $entries;
}

function files_base_name($raw): string
{
    $base = strtolower(preg_replace('/\.[^.]*$/', '', (string) ($raw ?: 'file')));
    $base = trim(preg_replace('/[^a-z0-9-]+/', '-', $base), '-');
    return substr($base, 0, 40) ?: 'file';
}

function files_unique_name(string $base, string $ext): string
{
    return $base . '-' . base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(3)) . ".$ext";
}

function files_signature_ok(string $ext, string $data): bool
{
    switch ($ext) {
        case 'png': return substr($data, 0, 4) === "\x89PNG";
        case 'jpg': return substr($data, 0, 3) === "\xFF\xD8\xFF";
        case 'gif': return substr($data, 0, 4) === 'GIF8';
        case 'webp': return substr($data, 0, 4) === 'RIFF' && substr($data, 8, 4) === 'WEBP';
        case 'ico': return substr($data, 0, 4) === "\x00\x00\x01\x00";
        case 'pdf': return substr($data, 0, 4) === '%PDF';
        case 'mp4': return substr($data, 4, 4) === 'ftyp';
        case 'webm': return substr($data, 0, 4) === "\x1A\x45\xDF\xA3";
    }
    return false;
}

function files_dir_size(string $dir): int
{
    $total = 0;
    foreach (scandir($dir) as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $full = "$dir/$entry";
        $total += is_dir($full) ? files_dir_size($full) : filesize($full);
    }
    return $total;
}

function files_existing($folderValue, string $name): array
{
    $folder = files_folder_of($folderValue);
    $file = $folder && files_valid_name($name) ? files_dir($folder) . "/$name" : '';
    if ($file === '' || !is_file($file)) throw new FileError('파일을 찾을 수 없습니다.', 404);
    return [$folder, $file];
}

// 휴지통 파일 이름: "<지운 시각 ms>~<폴더>~<원래 이름>"
const FILES_TRASH_NAME = '/^(\d{13})~([a-z0-9_-]{1,40})~([a-z0-9][a-z0-9._-]{0,120})$/i';

function files_trash_entries(): array
{
    $dir = files_root() . '/.trash';
    $now = (int) round(microtime(true) * 1000);
    $entries = [];
    foreach (scandir($dir) as $id) {
        if (!preg_match(FILES_TRASH_NAME, $id, $m)) continue;
        if ($now - (int) $m[1] > FILES_TRASH_DAYS * 86400000) {
            unlink("$dir/$id");
            continue;
        }
        $entries[] = ['id' => $id, 'folder' => $m[2], 'name' => $m[3], 'size' => filesize("$dir/$id"), 'deletedAt' => gmdate('Y-m-d\TH:i:s.000\Z', intdiv((int) $m[1], 1000))];
    }
    usort($entries, fn ($a, $b) => strcmp($b['deletedAt'], $a['deletedAt']));
    return $entries;
}

function files_trash_file(string $id): string
{
    $path = files_root() . "/.trash/$id";
    if (!preg_match(FILES_TRASH_NAME, $id) || !is_file($path)) throw new FileError('휴지통에서 파일을 찾을 수 없습니다.', 404);
    return $path;
}

/** $parts: /files 다음 주소 조각들 (예: ['folders'], ['trash', '<id>', 'restore'], ['main', 'a.png']) */
function handle_files(string $method, array $parts): void
{
    try {
        files_route($method, $parts);
    } catch (FileError $error) {
        fail($error->getCode() ?: 400, $error->getMessage());
    }
}

function files_route(string $method, array $parts): void
{
    $count = count($parts);

    if ($method === 'GET' && $count === 0) {
        $list = files_folder_of($_GET['folder'] ?? null) ? [$_GET['folder']] : files_folders();
        $entries = array_merge(...array_map('files_in', $list));
        usort($entries, fn ($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
        send_json(200, ['success' => true, 'files' => $entries]);
    }

    if ($count >= 1 && $parts[0] === 'folders') {
        if ($method === 'GET' && $count === 1) {
            $list = array_map(function ($name) {
                $files = files_in($name);
                return ['name' => $name, 'system' => in_array($name, FILES_SYSTEM_FOLDERS, true), 'count' => count($files), 'size' => array_sum(array_column($files, 'size'))];
            }, files_folders());
            $quota = (int) config_value('STORAGE_QUOTA_MB', 0) * FILES_MB;
            send_json(200, ['success' => true, 'folders' => $list, 'usage' => ['used' => files_dir_size(files_root()), 'quota' => $quota]]);
        }
        if ($method === 'POST' && $count === 1) {
            $name = strtolower(trim((string) (request_body()->name ?? '')));
            if (!preg_match('/^[a-z0-9_-]{1,40}$/', $name)) throw new FileError('폴더 이름은 영문 소문자, 숫자, -, _ 로 40자까지 쓸 수 있습니다.', 400);
            if (in_array($name, files_folders(), true) || in_array($name, ['trash', 'folders'], true)) throw new FileError('이미 있거나 쓸 수 없는 폴더 이름입니다.', 409);
            mkdir(files_dir($name), 0755);
            send_json(201, ['success' => true, 'folder' => $name]);
        }
        if ($method === 'DELETE' && $count === 2) {
            $name = files_folder_of($parts[1]);
            if (!$name) throw new FileError('폴더를 찾을 수 없습니다.', 404);
            if (in_array($name, FILES_SYSTEM_FOLDERS, true)) throw new FileError('시스템 폴더는 지울 수 없습니다.', 400);
            if (count(array_diff(scandir(files_dir($name)), ['.', '..'])) > 0) throw new FileError('빈 폴더만 지울 수 있습니다.', 400);
            rmdir(files_dir($name));
            send_json(200, ['success' => true]);
        }
    }

    if ($method === 'POST' && $count === 0) {
        $type = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        $rule = FILES_TYPES[$type] ?? null;
        if (!$rule) throw new FileError('이미지(PNG, JPG, GIF, WEBP, ICO), PDF, 동영상(MP4, WEBM)만 올릴 수 있습니다.', 400);
        [$ext, $maxMb] = $rule;
        $data = file_get_contents('php://input');
        if ($data === false || $data === '') throw new FileError('파일 내용이 비어 있습니다.', 400);
        if (strlen($data) > $maxMb * FILES_MB) throw new FileError("이 형식은 {$maxMb}MB 까지 올릴 수 있습니다.", 413);
        if (!files_signature_ok($ext, $data)) throw new FileError('파일 내용이 확장자와 맞지 않습니다.', 400);
        $folder = files_folder_of($_GET['folder'] ?? null) ?? 'main';
        $name = files_unique_name(files_base_name($_GET['name'] ?? 'file'), $ext);
        if (file_put_contents(files_dir($folder) . "/$name", $data) === false) throw new FileError('파일을 저장하지 못했습니다.', 500);
        send_json(201, ['success' => true, 'file' => files_entry($folder, $name)]);
    }

    if ($count >= 1 && $parts[0] === 'trash') {
        if ($method === 'GET' && $count === 1) send_json(200, ['success' => true, 'files' => files_trash_entries()]);
        if ($method === 'POST' && $count === 3 && $parts[2] === 'restore') {
            $source = files_trash_file($parts[1]);
            preg_match(FILES_TRASH_NAME, $parts[1], $m);
            $folder = files_folder_of($m[2]) ?? 'main';
            $name = $m[3];
            if (is_file(files_dir($folder) . "/$name")) $name = files_unique_name(files_base_name($name), strtolower(pathinfo($name, PATHINFO_EXTENSION)));
            rename($source, files_dir($folder) . "/$name");
            send_json(200, ['success' => true, 'file' => files_entry($folder, $name)]);
        }
        if ($method === 'DELETE' && $count === 2) {
            unlink(files_trash_file($parts[1]));
            send_json(200, ['success' => true]);
        }
    }

    if ($count === 2 && $method === 'PUT') {
        [$folder, $file] = files_existing($parts[0], $parts[1]);
        $body = request_body();
        $ext = strtolower(pathinfo($parts[1], PATHINFO_EXTENSION));
        $nextFolder = isset($body->folder) ? files_folder_of($body->folder) : $folder;
        if (!$nextFolder) throw new FileError('옮길 폴더를 찾을 수 없습니다.', 400);
        $nextName = isset($body->name) ? files_base_name($body->name) . ".$ext" : $parts[1];
        if (!files_valid_name($nextName)) throw new FileError('파일 이름은 영문, 숫자, -, _ 로 쓸 수 있습니다.', 400);
        $target = files_dir($nextFolder) . "/$nextName";
        if ($target !== $file && is_file($target)) throw new FileError('같은 이름의 파일이 이미 있습니다.', 409);
        rename($file, $target);
        send_json(200, ['success' => true, 'file' => files_entry($nextFolder, $nextName)]);
    }

    if ($count === 2 && $method === 'DELETE') {
        [$folder, $file] = files_existing($parts[0], $parts[1]);
        $id = sprintf('%.0f', microtime(true) * 1000) . "~$folder~{$parts[1]}";
        rename($file, files_root() . "/.trash/$id");
        send_json(200, ['success' => true, 'message' => '휴지통으로 옮겼습니다. 30일 안에 되살릴 수 있습니다.']);
    }

    fail(404, '요청한 주소를 찾을 수 없습니다.');
}
