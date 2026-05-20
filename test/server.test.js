import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createServer, normalizePath, validateChatRequest } from '../src/server.js';

let server;
let baseUrl;

function listen(testServer) {
  return new Promise((resolve) => {
    testServer.listen(0, '127.0.0.1', () => {
      const address = testServer.address();
      resolve(`http://${address.address}:${address.port}`);
    });
  });
}

describe('OpenRouter relay', () => {
  beforeEach(async () => {
    server = createServer({
      configProvider: () => ({
        openRouterApiKey: 'test-openrouter-key',
        relayApiKey: 'test-relay-key',
        allowedModels: ['openai/gpt-4o-mini'],
        siteUrl: 'http://localhost',
        appTitle: 'Test Relay',
        maxBodyBytes: 1024 * 1024,
      }),
      fetchImpl: async () => new Response(JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });
    baseUrl = await listen(server);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns health status without auth', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });

  it('serves the local chat UI at the root path', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /OpenRouter 中转站/);
  });

  it('returns relay info at the status path', async () => {
    const response = await fetch(`${baseUrl}/status`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.ok(payload.endpoints.includes('GET /v1/models'));
  });

  it('rejects chat requests without relay token', async () => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [] }),
    });

    assert.equal(response.status, 401);
  });

  it('proxies authorized chat requests', async () => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-relay-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].message.content, 'ok');
  });

  it('returns an OpenAI-compatible model list', async () => {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        authorization: 'Bearer test-relay-key',
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.object, 'list');
    assert.equal(payload.data[0].id, 'openai/gpt-4o-mini');
    assert.equal(payload.data[0].object, 'model');
  });

  it('supports root-style model and chat paths for clients that do not append /v1', async () => {
    const modelsResponse = await fetch(`${baseUrl}/models`, {
      headers: {
        authorization: 'Bearer test-relay-key',
      },
    });
    assert.equal(modelsResponse.status, 200);

    const chatResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-relay-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });
    assert.equal(chatResponse.status, 200);
  });

  it('proxies authorized Anthropic messages requests', async () => {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': 'test-relay-key',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].message.content, 'ok');
  });

  it('supports duplicated /v1 paths used by some client configurations', async () => {
    const response = await fetch(`${baseUrl}/v1/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-relay-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    assert.equal(response.status, 200);
  });

  it('supports model detail lookups used by model test flows', async () => {
    const response = await fetch(`${baseUrl}/v1/models/${encodeURIComponent('openai/gpt-4o-mini')}`, {
      headers: {
        authorization: 'Bearer test-relay-key',
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 'openai/gpt-4o-mini');
  });

  it('supports HEAD model list checks', async () => {
    const response = await fetch(`${baseUrl}/api/v1/models`, {
      method: 'HEAD',
      headers: {
        authorization: 'Bearer test-relay-key',
      },
    });

    assert.equal(response.status, 200);
  });

  it('proxies Anthropic count token checks', async () => {
    const response = await fetch(`${baseUrl}/api/v1/messages/count_tokens`, {
      method: 'POST',
      headers: {
        'x-api-key': 'test-relay-key',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    assert.equal(response.status, 200);
  });

  it('rejects models outside the allow list', async () => {
    const error = validateChatRequest({
      model: 'expensive/model',
      messages: [{ role: 'user', content: 'hello' }],
    }, {
      allowedModels: ['openai/gpt-4o-mini'],
    });

    assert.equal(error.error.code, 'model_not_allowed');
  });

  it('normalizes API and duplicated v1 path prefixes', () => {
    assert.equal(normalizePath('/api/v1/messages'), '/v1/messages');
    assert.equal(normalizePath('/v1/v1/messages'), '/v1/messages');
    assert.equal(normalizePath('/api/v1/v1/messages/count_tokens'), '/v1/messages/count_tokens');
  });
});
