import { contentDelta, finishReason, parseSseChunk } from '../lib/stream.js';
import { normalizeContinuationChunk } from '../lib/continuation.js';

export class StreamInterruptedError extends Error {
  constructor(message, partialContent) {
    super(message);
    this.name = 'StreamInterruptedError';
    this.partialContent = partialContent;
  }
}

export async function fetchModels(relayKey) {
  const response = await fetch('/v1/models', {
    headers: { authorization: `Bearer ${relayKey}` },
  });

  if (!response.ok) {
    throw new Error(`模型列表读取失败：${response.status}`);
  }

  const payload = await response.json();
  return (payload.data ?? []).map((model) => model.id);
}

export async function requestChatStream({
  relayKey,
  body,
  signal,
  appendBaseContent = '',
  onDelta,
  onStatus,
  onIdleTimeout,
  onUsage,
  idleTimeoutMs = 45000,
}) {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${relayKey}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? `请求失败：${response.status}`);
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式读取');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let appendedContent = '';
  let fullContent = appendBaseContent;
  let sawContent = false;
  let sawDone = false;
  let finalReason = '';
  let idleTimedOut = false;
  let lastChunkAt = Date.now();

  const idleTimer = window.setInterval(() => {
    if (Date.now() - lastChunkAt > idleTimeoutMs) {
      idleTimedOut = true;
      onStatus?.('上游生成超时，已中断', 'error');
      onIdleTimeout?.();
    }
  }, 5000);

  try {
    while (true) {
      if (idleTimedOut) throw new StreamInterruptedError('上游生成超时', fullContent);
      const { value, done } = await reader.read();
      if (done) break;

      lastChunkAt = Date.now();
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, (data) => {
        if (data === '[DONE]') {
          sawDone = true;
          return;
        }

        try {
          const payload = JSON.parse(data);
          const reason = finishReason(payload);
          const rawDelta = contentDelta(payload);

          if (payload?.usage) onUsage?.(payload.usage);
          if (reason) finalReason = reason;
          if (!rawDelta) return;

          const delta = appendBaseContent
            ? normalizeContinuationChunk(rawDelta, appendBaseContent, appendedContent)
            : rawDelta;

          if (!delta) return;
          sawContent = true;
          appendedContent += delta;
          fullContent += delta;
          onDelta(delta, fullContent);
        } catch {
          // Ignore malformed fragments from upstream.
        }
      });
    }

    if (!sawContent && !appendBaseContent) {
      throw new Error('上游没有返回内容');
    }

    if (finalReason === 'length') {
      throw new StreamInterruptedError('达到 Max Tokens，正在尝试续写', fullContent);
    }

    if (!sawDone && !finalReason) {
      throw new StreamInterruptedError('流式连接提前结束', fullContent);
    }

    return fullContent;
  } finally {
    window.clearInterval(idleTimer);
  }
}
