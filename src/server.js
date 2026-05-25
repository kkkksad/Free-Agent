import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MESSAGES_URL = 'https://openrouter.ai/api/v1/messages';
const OPENROUTER_MESSAGES_COUNT_TOKENS_URL = 'https://openrouter.ai/api/v1/messages/count_tokens';
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_ALLOWED_MODELS = [
  'openrouter/free',
  'qwen/qwen3-coder:free',
  'baidu/cobuddy:free',
  'openrouter/owl-alpha',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'poolside/laguna-m.1:free',
  'poolside/laguna-xs.2:free',
];
const DEFAULT_FALLBACK_MODELS = ['qwen/qwen3-coder:free', 'openrouter/free'];
const PUBLIC_DIR = path.resolve('public');

function readDotEnvFile(filePath = '.env') {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) env[key] = value;
  }

  return env;
}

function loadDotEnv(filePath = '.env') {
  try {
    const env = readDotEnvFile(filePath);
    for (const [key, value] of Object.entries(env)) {
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // The relay can still run from real environment variables.
  }
}

function csv(value) {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function getConfig(env = process.env) {
  const maxBodyBytes = Number.parseInt(env.MAX_BODY_BYTES ?? '', 10);

  return {
    openRouterApiKey: env.OPENROUTER_API_KEY ?? '',
    relayApiKey: env.RELAY_API_KEY ?? '',
    allowedModels: csv(env.ALLOWED_MODELS),
    fallbackModels: csv(env.FALLBACK_MODELS),
    port: Number.parseInt(env.PORT ?? '3000', 10),
    siteUrl: env.OPENROUTER_SITE_URL ?? '',
    appTitle: env.OPENROUTER_APP_TITLE ?? '',
    maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : DEFAULT_MAX_BODY_BYTES,
  };
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,HEAD,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-api-key,anthropic-version,anthropic-beta',
  };
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...corsHeaders(),
    ...headers,
  });
  res.end(body);
}

function isConfiguredOpenRouterKey(value) {
  if (!value || typeof value !== 'string') return false;
  if (!value.startsWith('sk-or-')) return false;
  return !/replace|your-new-key/i.test(value);
}

function setupStatusPayload(config) {
  return {
    configured: isConfiguredOpenRouterKey(config.openRouterApiKey),
    openRouterKeyConfigured: isConfiguredOpenRouterKey(config.openRouterApiKey),
    relayKeyConfigured: Boolean(config.relayApiKey),
    allowedModelCount: config.allowedModels.length,
    port: config.port,
  };
}

function isLocalRequest(req) {
  const remote = req.socket?.remoteAddress ?? '';
  return remote === '127.0.0.1'
    || remote === '::1'
    || remote === '::ffff:127.0.0.1'
    || remote === 'localhost';
}

function writeDotEnvValues(filePath, updates) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));
  const nextLines = existing.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return line;

    const key = line.slice(0, eqIndex).trim();
    if (!remaining.has(key)) return line;

    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });

  if (nextLines.length && nextLines.at(-1) !== '') nextLines.push('');
  for (const [key, value] of remaining.entries()) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

async function handleSetupSave(req, res, config, envPath) {
  if (!isLocalRequest(req)) {
    sendJson(res, 403, errorPayload('local_only', '配置接口只允许本机访问。', 'forbidden_error'));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch {
    sendJson(res, 400, errorPayload('invalid_json', '请求体必须是有效 JSON。', 'invalid_request_error'));
    return;
  }

  const openRouterApiKey = typeof body.openRouterApiKey === 'string' ? body.openRouterApiKey.trim() : '';
  if (!isConfiguredOpenRouterKey(openRouterApiKey)) {
    sendJson(res, 400, errorPayload('invalid_openrouter_key', '请输入有效的 OpenRouter Key。', 'invalid_request_error'));
    return;
  }

  const updates = {
    OPENROUTER_API_KEY: openRouterApiKey,
  };

  if (!config.relayApiKey) {
    updates.RELAY_API_KEY = 'local-dev-token';
  }

  if (!config.allowedModels.length) {
    updates.ALLOWED_MODELS = DEFAULT_ALLOWED_MODELS.join(',');
  }

  if (!config.fallbackModels.length) {
    updates.FALLBACK_MODELS = DEFAULT_FALLBACK_MODELS.join(',');
  }

  if (!config.siteUrl) updates.OPENROUTER_SITE_URL = `http://localhost:${config.port || 3000}`;
  if (!config.appTitle) updates.OPENROUTER_APP_TITLE = 'Free Agent';
  if (!process.env.MAX_BODY_BYTES) updates.MAX_BODY_BYTES = String(DEFAULT_MAX_BODY_BYTES);

  writeDotEnvValues(envPath, updates);

  const savedConfig = getConfig(process.env);
  sendJson(res, 200, {
    status: 'saved',
    setup: setupStatusPayload(savedConfig),
  });
}

function responseContentType(headers, fallback) {
  const contentType = headers.get('content-type') ?? fallback;
  if (contentType.toLowerCase().startsWith('application/json') && !contentType.toLowerCase().includes('charset=')) {
    return `${contentType}; charset=utf-8`;
  }
  return contentType;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function publicFilePath(pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const fullPath = path.resolve(PUBLIC_DIR, relativePath);
  if (!fullPath.startsWith(PUBLIC_DIR + path.sep) && fullPath !== PUBLIC_DIR) return null;
  return fullPath;
}

function servePublicFile(res, pathname) {
  const filePath = publicFilePath(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'content-type': mimeType(filePath),
    'content-length': body.length,
    ...corsHeaders(),
  });
  res.end(body);
  return true;
}

function errorPayload(code, message, type = 'relay_error') {
  return { error: { message, type, code } };
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getBearerToken(req) {
  const authorization = req.headers.authorization ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  const apiKey = req.headers['x-api-key'];
  return Array.isArray(apiKey) ? apiKey[0] : apiKey ?? '';
}

function checkRelayAuth(req, config) {
  if (!config.relayApiKey) {
    return {
      ok: false,
      statusCode: 500,
      payload: errorPayload('relay_api_key_missing', '中转站未配置 RELAY_API_KEY。', 'configuration_error'),
    };
  }

  const token = getBearerToken(req);
  if (!token || !timingSafeEqualString(token, config.relayApiKey)) {
    return {
      ok: false,
      statusCode: 401,
      payload: errorPayload('unauthorized', '缺少或无效的中转站访问密钥。', 'authentication_error'),
      headers: { 'www-authenticate': 'Bearer' },
    };
  }

  return { ok: true };
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(Object.assign(new Error('request_body_too_large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        reject(Object.assign(new Error('empty_json_body'), { statusCode: 400 }));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('invalid_json_body'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function validateModelRequest(body, config) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorPayload('invalid_request', '请求体必须是 JSON 对象。', 'invalid_request_error');
  }

  if (!body.model || typeof body.model !== 'string') {
    return errorPayload('model_required', '请求体必须包含字符串类型的 model。', 'invalid_request_error');
  }

  if (!Array.isArray(body.messages)) {
    return errorPayload('messages_required', '请求体必须包含 messages 数组。', 'invalid_request_error');
  }

  if (config.allowedModels.length === 0) {
    return errorPayload('allowed_models_missing', '中转站未配置 ALLOWED_MODELS，已拒绝代理请求。', 'configuration_error');
  }

  if (!config.allowedModels.includes(body.model)) {
    return errorPayload('model_not_allowed', `模型 ${body.model} 不在中转站白名单中。`, 'invalid_request_error');
  }

  return null;
}

function validateChatRequest(body, config) {
  return validateModelRequest(body, config);
}

function validateMessagesRequest(body, config) {
  return validateModelRequest(body, config);
}

function modelListPayload(config) {
  return {
    object: 'list',
    data: config.allowedModels.map((model) => ({
      id: model,
      object: 'model',
      created: 0,
      owned_by: 'openrouter',
    })),
  };
}

function modelPayload(id) {
  return { id, object: 'model', created: 0, owned_by: 'openrouter' };
}

function rootPayload(config) {
  return {
    name: 'OpenRouter Local Relay',
    status: 'ok',
    base_urls: ['http://localhost:3000', 'http://localhost:3000/v1'],
    endpoints: [
      'GET /health',
      'GET /models',
      'GET /v1/models',
      'POST /chat/completions',
      'POST /v1/chat/completions',
      'POST /messages',
      'POST /v1/messages',
      'POST /messages/count_tokens',
      'POST /v1/messages/count_tokens',
    ],
    allowed_models: config.allowedModels,
    fallback_models: config.fallbackModels,
  };
}

function openRouterHeaders(config) {
  const headers = {
    authorization: `Bearer ${config.openRouterApiKey}`,
    'content-type': 'application/json',
  };

  if (config.siteUrl) headers['http-referer'] = config.siteUrl;
  if (config.appTitle) headers['x-title'] = config.appTitle;
  return headers;
}

function openRouterMessagesHeaders(req, config) {
  const headers = openRouterHeaders(config);
  headers['anthropic-version'] = req.headers['anthropic-version'] ?? '2023-06-01';

  const anthropicBeta = req.headers['anthropic-beta'];
  if (anthropicBeta) {
    headers['anthropic-beta'] = Array.isArray(anthropicBeta) ? anthropicBeta.join(',') : anthropicBeta;
  }

  return headers;
}

function normalizePath(pathname) {
  let normalized = pathname.replace(/\/+/g, '/');
  if (normalized.startsWith('/api/')) normalized = normalized.slice(4);
  while (normalized.startsWith('/v1/v1/')) normalized = normalized.slice(3);
  return normalized;
}

function modelIdFromPath(pathname) {
  for (const prefix of ['/v1/models/', '/models/']) {
    if (pathname.startsWith(prefix)) {
      const id = decodeURIComponent(pathname.slice(prefix.length));
      return id || null;
    }
  }
  return null;
}

async function proxyChatCompletion(req, res, config, fetchImpl) {
  if (!config.openRouterApiKey) {
    sendJson(res, 500, errorPayload('openrouter_api_key_missing', '服务端未配置 OPENROUTER_API_KEY。', 'configuration_error'));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, config.maxBodyBytes);
  } catch (error) {
    const code = error.message === 'request_body_too_large' ? 'request_body_too_large' : 'invalid_json';
    const message = error.message === 'request_body_too_large' ? '请求体过大。' : '请求体必须是有效 JSON。';
    sendJson(res, error.statusCode ?? 400, errorPayload(code, message, 'invalid_request_error'));
    return;
  }

  const validationError = validateChatRequest(body, config);
  if (validationError) {
    const status = validationError.error.type === 'configuration_error' ? 500 : 400;
    sendJson(res, status, validationError);
    return;
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const upstream = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: openRouterHeaders(config),
      body: JSON.stringify(body),
    });

    console.info(JSON.stringify({
      event: 'openrouter_request',
      requestId,
      model: body.model,
      stream: body.stream === true,
      status: upstream.status,
      durationMs: Date.now() - startedAt,
    }));

    if (body.stream === true) {
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        ...corsHeaders(),
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      for await (const chunk of upstream.body) {
        res.write(chunk);
      }
      res.end();
      return;
    }

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'content-type': responseContentType(upstream.headers, 'application/json; charset=utf-8'),
      ...corsHeaders(),
    });
    res.end(text);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'openrouter_request_failed',
      requestId,
      model: body.model,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown_error',
    }));
    sendJson(res, 502, errorPayload('upstream_error', 'OpenRouter 上游请求失败。', 'upstream_error'));
  }
}

async function proxyAnthropicMessages(req, res, config, fetchImpl) {
  await proxyAnthropicJsonEndpoint(req, res, config, fetchImpl, {
    upstreamUrl: OPENROUTER_MESSAGES_URL,
    eventName: 'openrouter_messages_request',
    failureEventName: 'openrouter_messages_request_failed',
  });
}

async function proxyAnthropicCountTokens(req, res, config, fetchImpl) {
  await proxyAnthropicJsonEndpoint(req, res, config, fetchImpl, {
    upstreamUrl: OPENROUTER_MESSAGES_COUNT_TOKENS_URL,
    eventName: 'openrouter_count_tokens_request',
    failureEventName: 'openrouter_count_tokens_request_failed',
  });
}

async function proxyAnthropicJsonEndpoint(req, res, config, fetchImpl, options) {
  if (!config.openRouterApiKey) {
    sendJson(res, 500, errorPayload('openrouter_api_key_missing', '服务端未配置 OPENROUTER_API_KEY。', 'configuration_error'));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, config.maxBodyBytes);
  } catch (error) {
    const code = error.message === 'request_body_too_large' ? 'request_body_too_large' : 'invalid_json';
    const message = error.message === 'request_body_too_large' ? '请求体过大。' : '请求体必须是有效 JSON。';
    sendJson(res, error.statusCode ?? 400, errorPayload(code, message, 'invalid_request_error'));
    return;
  }

  const validationError = validateMessagesRequest(body, config);
  if (validationError) {
    const status = validationError.error.type === 'configuration_error' ? 500 : 400;
    sendJson(res, status, validationError);
    return;
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const upstream = await fetchImpl(options.upstreamUrl, {
      method: 'POST',
      headers: openRouterMessagesHeaders(req, config),
      body: JSON.stringify(body),
    });

    console.info(JSON.stringify({
      event: options.eventName,
      requestId,
      model: body.model,
      stream: body.stream === true,
      status: upstream.status,
      durationMs: Date.now() - startedAt,
    }));

    if (body.stream === true) {
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        ...corsHeaders(),
      });

      if (!upstream.body) {
        res.end();
        return;
      }

      for await (const chunk of upstream.body) {
        res.write(chunk);
      }
      res.end();
      return;
    }

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'content-type': responseContentType(upstream.headers, 'application/json; charset=utf-8'),
      ...corsHeaders(),
    });
    res.end(text);
  } catch (error) {
    console.error(JSON.stringify({
      event: options.failureEventName,
      requestId,
      model: body.model,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown_error',
    }));
    sendJson(res, 502, errorPayload('upstream_error', 'OpenRouter 上游请求失败。', 'upstream_error'));
  }
}

function createServer(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const configProvider = options.configProvider ?? (() => getConfig());
  const envPath = options.envPath ?? '.env';

  return http.createServer(async (req, res) => {
    const config = configProvider();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = normalizePath(url.pathname);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/') {
      if (servePublicFile(res, '/')) return;
      sendJson(res, 200, rootPayload(config));
      return;
    }

    if (req.method === 'GET' && pathname === '/status') {
      sendJson(res, 200, rootPayload(config));
      return;
    }

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && pathname === '/local/setup/status') {
      if (!isLocalRequest(req)) {
        sendJson(res, 403, errorPayload('local_only', '配置接口只允许本机访问。', 'forbidden_error'));
        return;
      }

      sendJson(res, 200, setupStatusPayload(config));
      return;
    }

    if (req.method === 'POST' && pathname === '/local/setup/config') {
      await handleSetupSave(req, res, config, envPath);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/assets/')) {
      if (servePublicFile(res, pathname)) return;
      sendJson(res, 404, errorPayload('asset_not_found', `未找到静态资源：${pathname}`, 'not_found_error'));
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && ['/v1/models', '/models'].includes(pathname)) {
      const auth = checkRelayAuth(req, config);
      if (!auth.ok) {
        sendJson(res, auth.statusCode, auth.payload, auth.headers);
        return;
      }

      if (req.method === 'HEAD') {
        res.writeHead(200, corsHeaders());
        res.end();
        return;
      }

      sendJson(res, 200, modelListPayload(config));
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && modelIdFromPath(pathname)) {
      const auth = checkRelayAuth(req, config);
      if (!auth.ok) {
        sendJson(res, auth.statusCode, auth.payload, auth.headers);
        return;
      }

      const modelId = modelIdFromPath(pathname);
      if (!config.allowedModels.includes(modelId)) {
        sendJson(res, 404, errorPayload('model_not_found', `模型 ${modelId} 不在中转站白名单中。`, 'not_found_error'));
        return;
      }

      if (req.method === 'HEAD') {
        res.writeHead(200, corsHeaders());
        res.end();
        return;
      }

      sendJson(res, 200, modelPayload(modelId));
      return;
    }

    if (req.method === 'POST' && ['/v1/chat/completions', '/chat/completions'].includes(pathname)) {
      const auth = checkRelayAuth(req, config);
      if (!auth.ok) {
        sendJson(res, auth.statusCode, auth.payload, auth.headers);
        return;
      }

      await proxyChatCompletion(req, res, config, fetchImpl);
      return;
    }

    if (req.method === 'POST' && ['/v1/messages', '/messages'].includes(pathname)) {
      const auth = checkRelayAuth(req, config);
      if (!auth.ok) {
        sendJson(res, auth.statusCode, auth.payload, auth.headers);
        return;
      }

      await proxyAnthropicMessages(req, res, config, fetchImpl);
      return;
    }

    if (req.method === 'POST' && ['/v1/messages/count_tokens', '/messages/count_tokens'].includes(pathname)) {
      const auth = checkRelayAuth(req, config);
      if (!auth.ok) {
        sendJson(res, auth.statusCode, auth.payload, auth.headers);
        return;
      }

      await proxyAnthropicCountTokens(req, res, config, fetchImpl);
      return;
    }

    console.warn(JSON.stringify({
      event: 'relay_route_not_found',
      method: req.method,
      path: url.pathname,
      normalizedPath: pathname,
    }));

    sendJson(res, 404, {
      ...errorPayload('not_found', `未找到该接口：${req.method} ${url.pathname}`, 'not_found_error'),
      received: { method: req.method, path: url.pathname, normalizedPath: pathname },
    });
  });
}

function startServer() {
  loadDotEnv();
  const config = getConfig();
  const server = createServer();

  server.listen(config.port, () => {
    console.info(`OpenRouter relay listening on http://localhost:${config.port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer();
}

export {
  createServer,
  getConfig,
  isLocalRequest,
  loadDotEnv,
  modelIdFromPath,
  modelListPayload,
  normalizePath,
  readDotEnvFile,
  startServer,
  validateChatRequest,
  validateMessagesRequest,
};
