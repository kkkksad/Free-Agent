export function parseSseChunk(buffer, onEvent) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const data = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (data) onEvent(data);
  }

  return rest;
}

export function contentDelta(payload) {
  return payload?.choices?.[0]?.delta?.content
    ?? payload?.choices?.[0]?.message?.content
    ?? '';
}

export function finishReason(payload) {
  return payload?.choices?.[0]?.finish_reason
    ?? payload?.choices?.[0]?.native_finish_reason
    ?? '';
}
