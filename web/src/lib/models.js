export const FALLBACK_MODEL = 'openrouter/free';
export const CODE_MODEL_PRIORITY = ['qwen/qwen3-coder:free', 'openrouter/free'];

const routeRules = [
  { keywords: ['code', 'coder', '代码', '编程'], model: 'qwen/qwen3-coder:free' },
  { keywords: ['写作', '总结', '翻译', '中文'], model: 'openrouter/free' },
];

export function selectModels(models, pool) {
  const freeModels = models.filter((model) => model === 'openrouter/free' || model.endsWith(':free'));

  if (pool === 'code') {
    const codeModels = CODE_MODEL_PRIORITY.filter((model) => models.includes(model));
    return codeModels.length ? codeModels : models;
  }

  if (pool === 'free') {
    return freeModels.length ? freeModels : models;
  }

  return models;
}

export function modelTags(model) {
  const tags = [];
  if (!model) return tags;
  if (model === 'openrouter/free') tags.push('免费路由');
  if (model.endsWith(':free')) tags.push('免费');
  if (/coder|code|qwen/i.test(model)) tags.push('代码');
  if (/baidu|qwen|free/i.test(model)) tags.push('中文可试');
  if (model === FALLBACK_MODEL) tags.push('备用');
  return [...new Set(tags)];
}

export function detectTaskModel(prompt, selectedModel) {
  const text = prompt.toLowerCase();
  for (const rule of routeRules) {
    if (rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      return rule.model;
    }
  }

  if (/[{}[\];()<>:=]/.test(prompt) || /\b(function|class|import|const|let|var|return|async|await)\b/i.test(prompt)) {
    return 'qwen/qwen3-coder:free';
  }

  return selectedModel || FALLBACK_MODEL;
}
