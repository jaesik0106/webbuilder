<?php
// AI 수정 제안 (backend/src/services/aiService.js 와 같은 동작).
// AI는 페이지 전체가 아니라 작은 수정 단위만 제안하고, 검증과 적용은 에디터가 한다.

const AI_MAX_PAGE_BYTES = 200000;
const AI_MAX_CATALOG_BYTES = 30000;
const AI_GEMINI_MODEL = 'gemini-3-flash-preview';
const AI_OPERATIONS = ['update_props', 'set_variant', 'add_block', 'remove_block', 'move_block', 'update_theme', 'apply_preset'];

function ai_instruction($catalog): string
{
    $blocks = isset($catalog->blocks) && is_array($catalog->blocks) ? $catalog->blocks : [];
    $presets = isset($catalog->presets) && is_array($catalog->presets) ? $catalog->presets : [];
    $lines = [];
    foreach ($blocks as $b) {
        $variants = isset($b->variants) && is_array($b->variants) ? implode(', ', $b->variants) : '';
        $defaults = json_encode($b->defaultProps ?? new stdClass(), JSON_UNESCAPED_UNICODE);
        $lines[] = "- {$b->type} (variants: $variants): " . ($b->description ?? '') . ". Default props: $defaults";
    }
    $presetText = implode(', ', array_map(function ($p) { return "{$p->id} ({$p->name})"; }, $presets));
    $blockText = implode("\n", $lines);

    return <<<TXT
You are the editing assistant inside a no-code website builder. The people talking to you are small-business owners editing their own homepage; most are not technical and write in Korean.

The website is JSON: a page is an ordered list of blocks ({id, type, variant, props}) plus a theme. You change it only with small operations. The customer sees a preview of your operations and decides whether to apply them, so propose exactly what they asked for and nothing extra.

## Block catalog
$blockText

Theme presets: $presetText.
Theme fields: bg0-bg5, text0-text3, accent, accentDim, borderDefault, borderSubtle, borderHover (hex like #22c55e), fontSans, fontDisplay, fontMono (Google Font names), radius (0-24), radiusLg (0-32).

## Operations
- {op:"update_props", blockId, props}: merge props into an existing block. For list props (items, links, tiers, members, images) send the complete new list.
- {op:"set_variant", blockId, variant}: switch an existing block's layout to one of its listed variants.
- {op:"add_block", type, variant?, props?, afterBlockId?}: add a block; omit afterBlockId to place it before the footer. Fill props with real copy suited to the business, not placeholders.
- {op:"remove_block", blockId}, {op:"move_block", blockId, toIndex} (toIndex is 0-based in the final order).
- {op:"update_theme", theme}: change some theme fields. {op:"apply_preset", presetId}: replace the whole theme with a preset.

## How to respond
- Use block ids exactly as they appear in the current page. If the customer says "this" or "here", they mean the selected block when one is given.
- Write new copy in the same language as the existing site content unless asked otherwise.
- If the request is ambiguous, cannot be done with these blocks (online payments, booking, custom code), or is just a question, return no operations and answer in reply, suggesting the closest thing you can do.
- reply and summary are Korean, one or two short friendly sentences, without technical words like JSON, props or variant. Nothing is applied until the customer approves, so describe changes as proposals ("~로 바꿔 드릴게요"), not as already done.
TXT;
}

function ai_normalize($raw): array
{
    $operations = isset($raw->operations) && is_array($raw->operations) ? $raw->operations : [];
    $summary = isset($raw->summary) && is_string($raw->summary) ? trim($raw->summary) : '';
    $reply = isset($raw->reply) && is_string($raw->reply) ? trim($raw->reply) : '';
    return ['reply' => $reply !== '' ? $reply : $summary, 'summary' => $summary, 'operations' => $operations];
}

function ai_post(string $url, array $headers, array $body): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($response === false || $status >= 400) throw new RuntimeException("AI API error: $status");
    return [$status, json_decode($response)];
}

function ai_call_gemini(string $instruction, string $content): array
{
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . AI_GEMINI_MODEL . ':generateContent?key=' . urlencode((string) config_value('AI_API_KEY'));
    [, $data] = ai_post($url, [], [
        'systemInstruction' => ['parts' => [['text' => $instruction . "\n\nReturn only a JSON object: {\"reply\": string, \"summary\": string, \"operations\": array}."]]],
        'contents' => [['role' => 'user', 'parts' => [['text' => $content]]]],
        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.4],
    ]);
    $text = $data->candidates[0]->content->parts[0]->text ?? '';
    if ($text === '') throw new RuntimeException('Empty Gemini response');
    $text = preg_replace(['/^```json\s*/i', '/```$/'], '', trim($text));
    return ai_normalize(json_decode($text));
}

function ai_call_claude(string $instruction, string $content): array
{
    $tool = [
        'name' => 'propose_site_edits',
        'description' => 'Propose a set of edits to the current page. The customer reviews them before they are applied.',
        'input_schema' => [
            'type' => 'object',
            'properties' => [
                'summary' => ['type' => 'string', 'description' => 'One short Korean sentence telling the customer what will change.'],
                'operations' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'op' => ['type' => 'string', 'enum' => AI_OPERATIONS],
                            'blockId' => ['type' => 'string'],
                            'props' => ['type' => 'object'],
                            'variant' => ['type' => 'string'],
                            'type' => ['type' => 'string'],
                            'afterBlockId' => ['type' => 'string'],
                            'toIndex' => ['type' => 'integer'],
                            'theme' => ['type' => 'object'],
                            'presetId' => ['type' => 'string'],
                        ],
                        'required' => ['op'],
                    ],
                ],
            ],
            'required' => ['summary', 'operations'],
        ],
    ];
    [, $data] = ai_post('https://api.anthropic.com/v1/messages', [
        'x-api-key: ' . config_value('AI_API_KEY'),
        'anthropic-version: 2023-06-01',
    ], [
        'model' => config_value('AI_MODEL', 'claude-sonnet-4-5'),
        'max_tokens' => 8192,
        'system' => $instruction,
        'tools' => [$tool],
        'tool_choice' => ['type' => 'auto'],
        'messages' => [['role' => 'user', 'content' => $content]],
    ]);
    $reply = '';
    $input = null;
    foreach ($data->content ?? [] as $part) {
        if (($part->type ?? '') === 'text') $reply .= $part->text;
        if (($part->type ?? '') === 'tool_use' && ($part->name ?? '') === 'propose_site_edits') $input = $part->input;
    }
    if (trim($reply) === '' && !$input) throw new RuntimeException('Empty Claude response');
    $merged = $input ?: new stdClass();
    $merged->reply = $reply;
    return ai_normalize($merged);
}

function ai_record(int $userId, int $pageId, string $prompt, string $provider, string $status): int
{
    $stmt = db()->prepare('INSERT INTO ai_usage (user_id, page_id, prompt, provider, status) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$userId, $pageId, mb_substr($prompt, 0, 2000), $provider, $status]);
    return (int) db()->lastInsertId();
}

function ai_propose(array $user, stdClass $body): void
{
    $prompt = trim((string) ($body->prompt ?? ''));
    if (mb_strlen($prompt) > 2000) fail(413, '수정 요청이 너무 깁니다.');
    if ($prompt === '') fail(400, '수정 내용을 입력하세요.');
    if (empty($body->pageId)) fail(400, '페이지가 필요합니다.');

    $saved = get_page($body->pageId);
    if (!$saved) fail(404, '페이지를 찾을 수 없습니다.');

    $page = $body->page ?? null;
    $pageJson = json_encode($page, JSON_UNESCAPED_UNICODE);
    if (!($page instanceof stdClass) || !isset($page->blocks) || !is_array($page->blocks) || strlen($pageJson) > AI_MAX_PAGE_BYTES) {
        fail(400, '페이지 내용이 올바르지 않거나 너무 큽니다.');
    }
    $catalog = $body->catalog ?? new stdClass();
    if (strlen(json_encode($catalog)) > AI_MAX_CATALOG_BYTES) fail(400, '블록 목록이 너무 큽니다.');

    $provider = (string) config_value('AI_PROVIDER', 'claude');
    if (!config_value('AI_API_KEY')) {
        ai_record($user['id'], $saved['id'], $prompt, $provider, 'no_key');
        fail(503, 'AI_API_KEY가 설정되지 않았습니다.');
    }

    $selected = isset($body->selectedBlockId) && is_string($body->selectedBlockId) ? $body->selectedBlockId : 'none';
    $content = "Current page:\n$pageJson\n\nSelected block: $selected\n\nCustomer request:\n$prompt";
    $instruction = ai_instruction($catalog);

    try {
        $proposal = $provider === 'gemini' ? ai_call_gemini($instruction, $content) : ai_call_claude($instruction, $content);
        $usageId = ai_record($user['id'], $saved['id'], $prompt, $provider, 'success');
    } catch (Throwable $error) {
        ai_record($user['id'], $saved['id'], $prompt, $provider, 'failed');
        error_log('Revise page failed: ' . $error->getMessage());
        fail(500, 'AI 수정에 실패했습니다.');
    }

    send_json(200, ['success' => true, 'usageId' => $usageId] + $proposal);
}

function ai_latest_restorable_id(int $userId): ?int
{
    $stmt = db()->prepare('SELECT id FROM ai_usage WHERE user_id = ? AND before_config IS NOT NULL ORDER BY id DESC LIMIT 1');
    $stmt->execute([$userId]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int) $id;
}

function ai_usage(array $user): void
{
    $restorableId = ai_latest_restorable_id($user['id']);
    $stmt = db()->prepare('SELECT id, page_id, prompt, provider, status, created_at, before_config IS NOT NULL AS has_snapshot FROM ai_usage WHERE user_id = ? ORDER BY id DESC LIMIT 50');
    $stmt->execute([$user['id']]);
    $usage = array_map(function ($row) use ($restorableId) { return [
        'id' => (int) $row['id'],
        'pageId' => $row['page_id'] === null ? null : (int) $row['page_id'],
        'prompt' => $row['prompt'],
        'provider' => $row['provider'],
        'status' => $row['status'],
        'createdAt' => iso_date($row['created_at']),
        'restorable' => $restorableId !== null && (int) $row['id'] === $restorableId && (int) $row['has_snapshot'] === 1,
    ]; }, $stmt->fetchAll());
    send_json(200, ['success' => true, 'usage' => $usage]);
}

function ai_save_snapshot(array $user, int $usageId, stdClass $body): void
{
    $config = $body->config ?? null;
    if ($error = validate_config($config)) fail(400, $error);
    $json = encode_config($config);
    if (strlen($json) > AI_MAX_PAGE_BYTES) fail(400, '페이지 내용이 너무 큽니다.');

    $stmt = db()->prepare('SELECT id, status, before_config FROM ai_usage WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$usageId, $user['id']]);
    $row = $stmt->fetch();
    if (!$row || $row['status'] !== 'success') fail(404, '수정 기록을 찾을 수 없습니다.');
    if ($row['before_config'] === null || $row['before_config'] === '') {
        $update = db()->prepare('UPDATE ai_usage SET before_config = ? WHERE id = ? AND user_id = ?');
        $update->execute([$json, $usageId, $user['id']]);
    }
    send_json(200, ['success' => true]);
}

function ai_restore(array $user, int $usageId): void
{
    $restorableId = ai_latest_restorable_id($user['id']);
    if ($restorableId !== $usageId) fail(409, '가장 최근 AI 수정만 취소할 수 있습니다.');

    $stmt = db()->prepare('SELECT page_id, before_config FROM ai_usage WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$usageId, $user['id']]);
    $row = $stmt->fetch();
    if (!$row || $row['before_config'] === null || $row['before_config'] === '') {
        fail(404, '되돌릴 수정 기록을 찾을 수 없습니다.');
    }
    $config = json_decode($row['before_config']);
    if ($error = validate_config($config)) fail(400, $error);

    $pageId = (int) $row['page_id'];
    $existing = get_page($pageId);
    if (!$existing) fail(404, '페이지를 찾을 수 없습니다.');
    $update = db()->prepare('UPDATE pages SET name = ?, config = ? WHERE id = ?');
    $name = trim((string) ($config->name ?? '')) ?: $existing['name'];
    $update->execute([$name, encode_config($config), $pageId]);
    db()->prepare('DELETE FROM ai_usage WHERE id = ? AND user_id = ?')->execute([$usageId, $user['id']]);
    send_json(200, ['success' => true, 'message' => 'AI 수정 전으로 되돌렸습니다.', 'page' => get_page($pageId)]);
}
