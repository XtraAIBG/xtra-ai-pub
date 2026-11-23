<?php
/**
 * Consultation form endpoint: receives the form's JSON and emails it through the
 * SuperHosting mailbox over SMTP. No third-party service sees the data.
 *
 * SMTP settings live OUTSIDE public_html, in xtra-ai-form-config.php in the hosting
 * home folder (see xtra-ai-form-config.example.php and the README). The old name,
 * bizgrow-form-config.php, is still read so the live form keeps working until it is renamed. That file is never
 * committed and can't be opened from the web.
 */

declare(strict_types=1);

date_default_timezone_set('Europe/Sofia');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['success' => false, 'message' => 'POST only']);
}

$configPath = getenv('XTRA_AI_FORM_CONFIG') ?: getenv('BIZGROW_FORM_CONFIG') ?: dirname(__DIR__, 2) . '/xtra-ai-form-config.php';
if (!is_file($configPath) && !getenv('XTRA_AI_FORM_CONFIG') && !getenv('BIZGROW_FORM_CONFIG')) {
    $configPath = dirname(__DIR__, 2) . '/bizgrow-form-config.php'; // name used before the rename to Xtra AI
}
if (!is_file($configPath)) {
    error_log('xtra-ai form: missing config ' . $configPath);
    reply(500, ['success' => false, 'message' => 'not configured']);
}
/** @var array{smtp_host:string,smtp_port:int,smtp_secure:string,smtp_user:string,smtp_pass:string,from_email:string,from_name?:string,to_email:string,allowed_hosts?:array<string>} $config */
$config = require $configPath;

// Same-site requests only, when the browser says where it comes from.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $allowed = array_map('strtolower', $config['allowed_hosts'] ?? [$_SERVER['HTTP_HOST'] ?? '']);
    $allowed[] = strtolower((string) preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
    if (!in_array($originHost, $allowed, true)) {
        reply(403, ['success' => false, 'message' => 'origin not allowed']);
    }
}

$raw = file_get_contents('php://input', false, null, 0, 20000);
$data = json_decode((string) $raw, true);
if (!is_array($data)) {
    reply(400, ['success' => false, 'message' => 'invalid body']);
}

// Honeypot: real visitors never see or fill this field.
if (trim((string) ($data['company_fax'] ?? '')) !== '') {
    reply(200, ['success' => true]);
}

// At most 5 requests per IP per 10 minutes.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = sys_get_temp_dir() . '/xtra-ai-form-' . hash('sha256', $ip);
$now = time();
$hits = array_filter(
    array_map('intval', is_file($rateFile) ? (array) file($rateFile, FILE_IGNORE_NEW_LINES) : []),
    static fn (int $t): bool => $t > $now - 600
);
if (count($hits) >= 5) {
    reply(429, ['success' => false, 'message' => 'too many requests']);
}
$hits[] = $now;
@file_put_contents($rateFile, implode("\n", $hits), LOCK_EX);

$clean = static fn ($value, int $max): string => mb_substr(trim(str_replace(["\r", "\0"], '', (string) $value)), 0, $max);
$oneLine = static fn ($value, int $max): string => mb_substr(trim((string) preg_replace('/[\r\n\0]+/', ' ', (string) $value)), 0, $max);

$name = $oneLine($data['name'] ?? '', 120);
$email = $oneLine($data['email'] ?? '', 200);
$subject = $oneLine($data['subject'] ?? 'Запитване от сайта', 200);
$message = $clean($data['message'] ?? '', 10000);

if ($name === '' || $message === '') {
    reply(422, ['success' => false, 'message' => 'missing fields']);
}
$replyTo = filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';

$body = $message . "\n\n--\nИзпратено от формата на сайта · IP " . $ip . ' · ' . date('Y-m-d H:i');

try {
    smtp_send($config, $config['to_email'], $subject, $body, $replyTo, $name);
} catch (Throwable $e) {
    error_log('xtra-ai form: ' . $e->getMessage());
    reply(502, ['success' => false, 'message' => 'send failed']);
}

reply(200, ['success' => true]);

/** Minimal SMTP client: SSL (465), STARTTLS (587) or plain, AUTH LOGIN, UTF-8 text body. */
function smtp_send(array $c, string $to, string $subject, string $body, string $replyTo, string $replyName): void
{
    $secure = strtolower($c['smtp_secure'] ?? 'ssl');
    $host = ($secure === 'ssl' ? 'ssl://' : '') . $c['smtp_host'];
    $socket = @stream_socket_client($host . ':' . (int) $c['smtp_port'], $errno, $errstr, 15);
    if (!$socket) {
        throw new RuntimeException("connect failed: $errstr ($errno)");
    }
    stream_set_timeout($socket, 15);

    $read = static function () use ($socket): string {
        $data = '';
        while (($line = fgets($socket, 515)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $data;
    };
    $cmd = static function (string $command, array $expect) use ($socket, $read): string {
        if ($command !== '') {
            fwrite($socket, $command . "\r\n");
        }
        $response = $read();
        if (!in_array((int) substr($response, 0, 3), $expect, true)) {
            throw new RuntimeException('SMTP ' . trim(strtok($command, ' ') ?: 'greeting') . ': ' . trim($response));
        }
        return $response;
    };

    $hostname = gethostname() ?: 'localhost';
    $cmd('', [220]);
    $cmd('EHLO ' . $hostname, [250]);
    if ($secure === 'tls') {
        $cmd('STARTTLS', [220]);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('STARTTLS failed');
        }
        $cmd('EHLO ' . $hostname, [250]);
    }
    if (($c['smtp_user'] ?? '') !== '') {
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($c['smtp_user']), [334]);
        $cmd(base64_encode($c['smtp_pass']), [235]);
    }

    $encode = static fn (string $s): string => '=?UTF-8?B?' . base64_encode($s) . '?=';
    $fromName = $c['from_name'] ?? 'Xtra AI';
    $headers = [
        'Date: ' . date('r'),
        'From: ' . $encode($fromName) . ' <' . $c['from_email'] . '>',
        'To: <' . $to . '>',
        'Subject: ' . $encode($subject),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . substr(strrchr($c['from_email'], '@') ?: '@localhost', 1) . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    if ($replyTo !== '') {
        $headers[] = 'Reply-To: ' . $encode($replyName) . ' <' . $replyTo . '>';
    }

    $cmd('MAIL FROM:<' . $c['from_email'] . '>', [250]);
    $cmd('RCPT TO:<' . $to . '>', [250, 251]);
    $cmd('DATA', [354]);
    fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n") . ".\r\n");
    $cmd('', [250]);
    $cmd('QUIT', [221, 250]);
    fclose($socket);
}
