<?php
// npm run deploy 가 backend/.env 값으로 config.php 를 만들어 함께 올린다. 직접 만들 때는 이 파일을 복사해 쓰세요.
return [
    'DB_HOST' => 'localhost',
    'DB_PORT' => 3306,
    'DB_NAME' => '',
    'DB_USER' => '',
    'DB_PASSWORD' => '',
    'JWT_SECRET' => '',
    'ADMIN_EMAIL' => '',
    'ADMIN_PASSWORD' => '',
    'AI_PROVIDER' => 'gemini',
    'AI_API_KEY' => '',
    'AI_MODEL' => 'claude-sonnet-4-5',
];
