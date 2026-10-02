<?php
// 계정 관리 (제작자 전용). backend/src/routes/users.js 와 같은 동작.

function to_user(array $row): array
{
    return ['id' => (int) $row['id'], 'email' => $row['email'], 'role' => normalize_role($row['role']), 'createdAt' => iso_date($row['created_at'])];
}

function find_user(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, email, role, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function developer_count(): int
{
    return (int) db()->query("SELECT COUNT(*) FROM users WHERE role = 'developer'")->fetchColumn();
}

function handle_users(string $method, ?int $id, array $me): void
{
    if ($method === 'GET' && $id === null) {
        $rows = db()->query("SELECT id, email, role, created_at FROM users ORDER BY role = 'developer' DESC, id")->fetchAll();
        send_json(200, ['success' => true, 'users' => array_map('to_user', $rows)]);
    }

    if ($method === 'POST' && $id === null) {
        $body = request_body();
        $email = normalize_email((string) ($body->email ?? ''));
        $password = $body->password ?? '';
        if ($error = validate_credentials($email, $password)) fail(400, $error);
        $stmt = db()->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ((int) $stmt->fetchColumn() > 0) fail(409, '이미 있는 이메일입니다.');
        $newId = create_account(db(), $email, $password, $body->role ?? 'admin');
        send_json(201, ['success' => true, 'user' => to_user(find_user($newId))]);
    }

    if ($id === null) fail(404, '요청한 주소를 찾을 수 없습니다.');
    $user = find_user($id);
    if (!$user) fail(404, '계정을 찾을 수 없습니다.');

    // 권한 바꾸기, 비밀번호 바꾸기
    if ($method === 'PUT') {
        $body = request_body();
        if (isset($body->role)) {
            $role = normalize_role($body->role);
            if ($user['role'] === 'developer' && $role !== 'developer' && developer_count() <= 1) {
                fail(400, '제작자 계정은 하나 이상 있어야 합니다.');
            }
            db()->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$role, $id]);
        }
        if (isset($body->password)) {
            if ($error = validate_credentials($user['email'], $body->password)) fail(400, $error);
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($body->password, PASSWORD_BCRYPT), $id]);
        }
        send_json(200, ['success' => true, 'user' => to_user(find_user($id))]);
    }

    if ($method === 'DELETE') {
        if ($id === $me['id']) fail(400, '지금 로그인한 계정은 지울 수 없습니다.');
        if ($user['role'] === 'developer' && developer_count() <= 1) fail(400, '제작자 계정은 하나 이상 있어야 합니다.');
        // 누가 만들었는지 기록하는 칸은 지금 계정으로 넘긴다.
        db()->prepare('UPDATE pages SET user_id = ? WHERE user_id = ?')->execute([$me['id'], $id]);
        db()->prepare('UPDATE ai_usage SET user_id = ? WHERE user_id = ?')->execute([$me['id'], $id]);
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        send_json(200, ['success' => true]);
    }

    fail(405, '지원하지 않는 요청입니다.');
}
