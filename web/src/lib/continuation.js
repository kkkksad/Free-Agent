import { codeFenceState, looksCodeOnly } from './markdown.js';

export function continuationMode(content = '') {
  const fence = codeFenceState(content);
  return {
    insideCodeFence: fence.open,
    language: fence.language,
    codeLike: fence.open || looksCodeOnly(content),
  };
}

export function continuationPrompt(partialContent = '') {
  const mode = continuationMode(partialContent);

  if (mode.insideCodeFence) {
    return [
      '上一次回答在一个未闭合的代码块中断了。',
      `代码语言：${mode.language || '未知'}`,
      '请从上一条助手回复的最后一个字符后面直接继续输出代码。',
      '只输出代码续写片段，不要解释，不要道歉，不要说“继续如下”。',
      '不要重新输出 ``` 代码围栏，不要重复已经写过的代码。',
    ].join('\n');
  }

  if (mode.codeLike) {
    return [
      '上一次回答是代码内容，中途断流了。',
      '请从上一条助手回复的末尾继续输出代码。',
      '只输出缺失的代码续写片段，不要解释，不要道歉，不要重复已有代码。',
    ].join('\n');
  }

  return '上一次回答可能因为网络或上游断流而中断。请严格保持上一条助手回复的语言、格式和结构，从末尾继续写，不要重复已经写过的内容，不要解释断流原因。';
}

export function normalizeContinuationChunk(delta, existingContent, currentAppendContent) {
  const mode = continuationMode(existingContent);
  if (!mode.codeLike || currentAppendContent) return delta;

  let next = delta;
  next = next.replace(/^\s*(好的|可以|当然|下面继续|继续如下|接着上文|以下是继续)[：:，,\s]*/i, '');

  if (mode.insideCodeFence) {
    next = next.replace(/^\s*```[^\n`]*\n?/, '');
  }

  return next;
}
