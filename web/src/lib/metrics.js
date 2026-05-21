function estimateTokens(text = '') {
  const compact = text.trim();
  if (!compact) return 0;
  const cjk = (compact.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = compact.length - cjk;
  return Math.ceil(cjk * 1.1 + other / 4);
}

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function sessionMetrics(sessions) {
  const assistantMessages = sessions.flatMap((session) => session.messages.filter((message) => message.role === 'assistant'));
  const completed = assistantMessages.filter((message) => message.type !== 'error' && !message.interrupted && message.content?.trim());
  const failed = assistantMessages.filter((message) => message.type === 'error' || message.interrupted);
  const outputTokens = assistantMessages.reduce((sum, message) => sum + (message.usage?.completion_tokens || estimateTokens(message.content)), 0);
  const inputTokens = sessions.reduce((sum, session) => (
    sum + session.messages
      .filter((message) => message.role === 'user')
      .reduce((inner, message) => inner + estimateTokens(message.content), 0)
  ), 0);

  const callsByDay = new Map();
  const modelMap = new Map();

  for (const message of assistantMessages) {
    const key = dayKey(message.createdAt || Date.now());
    callsByDay.set(key, (callsByDay.get(key) || 0) + 1);

    const model = message.model || '未记录模型';
    const current = modelMap.get(model) || {
      model,
      calls: 0,
      success: 0,
      failed: 0,
      tokens: 0,
    };
    current.calls += 1;
    if (message.type === 'error' || message.interrupted) {
      current.failed += 1;
    } else {
      current.success += 1;
    }
    current.tokens += message.usage?.completion_tokens || estimateTokens(message.content);
    modelMap.set(model, current);
  }

  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = dayKey(date.getTime());
    return {
      label: key.slice(5),
      value: callsByDay.get(key) || 0,
    };
  });

  const modelHealth = [...modelMap.values()]
    .map((item) => ({
      ...item,
      successRate: item.calls ? Math.round((item.success / item.calls) * 100) : 0,
    }))
    .sort((left, right) => right.calls - left.calls);

  return {
    calls: assistantMessages.length,
    success: completed.length,
    failed: failed.length,
    successRate: assistantMessages.length ? Math.round((completed.length / assistantMessages.length) * 100) : 0,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    averageOutputTokens: completed.length ? Math.round(outputTokens / completed.length) : 0,
    trend,
    modelHealth,
  };
}
