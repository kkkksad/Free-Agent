const relayKeyInput = document.querySelector('#relayKeyInput');
const modelSelect = document.querySelector('#modelSelect');
const poolSelect = document.querySelector('#poolSelect');
const promptInput = document.querySelector('#promptInput');
const systemPromptInput = document.querySelector('#systemPromptInput');
const temperatureInput = document.querySelector('#temperatureInput');
const temperatureValue = document.querySelector('#temperatureValue');
const maxTokensInput = document.querySelector('#maxTokensInput');
const maxTokensValue = document.querySelector('#maxTokensValue');
const contextToggle = document.querySelector('#contextToggle');
const fallbackToggle = document.querySelector('#fallbackToggle');
const chatForm = document.querySelector('#chatForm');
const chatLog = document.querySelector('#chatLog');
const sendButton = document.querySelector('#sendButton');
const stopButton = document.querySelector('#stopButton');
const refreshButton = document.querySelector('#refreshButton');
const clearButton = document.querySelector('#clearButton');
const copyLastButton = document.querySelector('#copyLastButton');
const exportButton = document.querySelector('#exportButton');
const newChatButton = document.querySelector('#newChatButton');
const sessionList = document.querySelector('#sessionList');
const sessionSearchInput = document.querySelector('#sessionSearchInput');
const statusText = document.querySelector('#statusText');
const modelBadge = document.querySelector('#modelBadge');
const turnBadge = document.querySelector('#turnBadge');
const conversationTitle = document.querySelector('#conversationTitle');

const KEY_STORAGE = 'openrouter-relay-key';
const MODEL_STORAGE = 'openrouter-relay-model';
const SETTINGS_STORAGE = 'openrouter-relay-settings';
const SESSIONS_STORAGE = 'openrouter-relay-sessions';
const ACTIVE_SESSION_STORAGE = 'openrouter-relay-active-session';
const FALLBACK_MODEL = 'openrouter/free';
const CODE_MODEL_PRIORITY = ['qwen/qwen3-coder:free', 'openrouter/free'];
const STREAM_IDLE_TIMEOUT_MS = 45000;

const SAFE_MODEL_ALIASES = [
  { keywords: ['code', 'coder', '代码', '编程'], model: 'qwen/qwen3-coder:free' },
  { keywords: ['写作', '总结', '翻译', '中文'], model: 'openrouter/free' },
];

const state = {
  sessions: [],
  activeId: null,
  busy: false,
  controller: null,
};

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeSession() {
  return state.sessions.find((session) => session.id === state.activeId);
}

function relayKey() {
  return relayKeyInput.value.trim();
}

function setStatus(text, tone = 'normal') {
  statusText.textContent = text;
  statusText.dataset.tone = tone;
}

function saveSessions() {
  localStorage.setItem(SESSIONS_STORAGE, JSON.stringify(state.sessions));
  localStorage.setItem(ACTIVE_SESSION_STORAGE, state.activeId || '');
}

function saveSettings() {
  localStorage.setItem(KEY_STORAGE, relayKey());
  localStorage.setItem(MODEL_STORAGE, modelSelect.value);
  localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({
    systemPrompt: systemPromptInput.value,
    temperature: Number(temperatureInput.value),
    maxTokens: Number(maxTokensInput.value),
    keepContext: contextToggle.checked,
    fallback: fallbackToggle.checked,
    pool: poolSelect.value,
  }));
}

function loadSettings() {
  relayKeyInput.value = localStorage.getItem(KEY_STORAGE) || 'local-dev-token';
  const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE) || '{}');
  systemPromptInput.value = settings.systemPrompt || '';
  temperatureInput.value = String(settings.temperature ?? 0.7);
  maxTokensInput.value = String(settings.maxTokens ?? 1024);
  contextToggle.checked = settings.keepContext ?? true;
  fallbackToggle.checked = settings.fallback ?? true;
  poolSelect.value = settings.pool || 'free';
  updateRangeLabels();
}

function createSession(title = '新对话') {
  const session = {
    id: nowId(),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.sessions.unshift(session);
  state.activeId = session.id;
  saveSessions();
  renderAll();
  return session;
}

function loadSessions() {
  try {
    state.sessions = JSON.parse(localStorage.getItem(SESSIONS_STORAGE) || '[]');
  } catch {
    state.sessions = [];
  }

  state.activeId = localStorage.getItem(ACTIVE_SESSION_STORAGE);
  if (!state.sessions.length) {
    createSession();
    return;
  }

  if (!activeSession()) {
    state.activeId = state.sessions[0].id;
  }
}

function updateRangeLabels() {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(1);
  maxTokensValue.textContent = maxTokensInput.value;
}

function updateMeta() {
  const session = activeSession();
  conversationTitle.textContent = session?.title || '新对话';
  modelBadge.textContent = modelSelect.value || '未选择模型';
  turnBadge.textContent = `${session?.messages.length || 0} 条消息`;
}

function selectModels(models) {
  const pool = poolSelect.value;
  const freeModels = models.filter((model) => model === 'openrouter/free' || model.endsWith(':free'));

  if (pool === 'code') {
    return CODE_MODEL_PRIORITY.filter((model) => models.includes(model));
  }

  if (pool === 'free') {
    return freeModels.length ? freeModels : models;
  }

  return models;
}

function renderAll() {
  renderSessions();
  renderMessages();
  updateMeta();
}

function renderSessions() {
  sessionList.replaceChildren();
  const keyword = sessionSearchInput.value.trim().toLowerCase();

  for (const session of state.sessions) {
    const haystack = `${session.title} ${session.messages.map((message) => message.content).join(' ')}`.toLowerCase();
    if (keyword && !haystack.includes(keyword)) {
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `session-button${session.id === state.activeId ? ' active' : ''}`;
    button.dataset.id = session.id;

    const title = document.createElement('strong');
    title.textContent = session.title || '新对话';

    const meta = document.createElement('span');
    meta.textContent = `${session.messages.length} 条消息`;

    button.append(title, meta);
    sessionList.append(button);
  }
}

function renderMessages() {
  const session = activeSession();
  chatLog.replaceChildren();

  if (!session || session.messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<strong>开始一个问题</strong><span>支持 Markdown、代码块、搜索和流式输出。</span>';
    chatLog.append(empty);
    updateMeta();
    return;
  }

  for (const message of session.messages) {
    chatLog.append(renderMessage(message));
  }

  updateMeta();
  scrollToBottom();
}

function renderMessage(message) {
  const item = document.createElement('article');
  item.className = `message ${message.type || message.role}`;
  if (message.streaming) item.classList.add('streaming');

  const role = document.createElement('div');
  role.className = 'role';

  const label = document.createElement('span');
  label.textContent = message.role === 'user' ? '你' : message.type === 'error' ? '错误' : '模型';
  role.append(label);

  if (message.role === 'assistant' && message.type !== 'error') {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-button';
    copy.textContent = '复制';
    copy.addEventListener('click', () => copyText(message.content));
    role.append(copy);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  setBubbleContent(bubble, message.content, message.role);
  message.bubble = bubble;
  message.item = item;

  const status = document.createElement('div');
  status.className = 'message-state';
  status.textContent = message.streaming ? '正在生成' : message.createdAt ? new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour12: false }) : '';
  message.status = status;

  item.append(role, bubble, status);
  return item;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function markdownToHtml(markdown) {
  const parts = markdown.split(/```/);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const lines = part.replace(/^\w+\n/, '');
      return `<pre><code>${escapeHtml(lines.trim())}</code></pre>`;
    }

    return part
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
        if (/^[-*]\s/m.test(paragraph)) {
          const items = paragraph
            .split('\n')
            .map((line) => line.replace(/^[-*]\s*/, '').trim())
            .filter(Boolean)
            .map((item) => `<li>${inlineMarkdown(item)}</li>`)
            .join('');
          return `<ul>${items}</ul>`;
        }

        if (/^\d+\.\s/m.test(paragraph)) {
          const items = paragraph
            .split('\n')
            .map((line) => line.replace(/^\d+\.\s*/, '').trim())
            .filter(Boolean)
            .map((item) => `<li>${inlineMarkdown(item)}</li>`)
            .join('');
          return `<ol>${items}</ol>`;
        }

        return `<p>${inlineMarkdown(paragraph).replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  }).join('');
}

function setBubbleContent(bubble, content, role) {
  if (role === 'assistant') {
    bubble.innerHTML = markdownToHtml(content || '');
  } else {
    bubble.textContent = content;
  }
}

function addMessage(role, content, type = role) {
  let session = activeSession();
  if (!session) session = createSession();

  const message = { id: nowId(), role, content, type, createdAt: Date.now(), updatedAt: Date.now() };
  session.messages.push(message);
  session.updatedAt = Date.now();

  if (role === 'user' && session.title === '新对话') {
    session.title = content.slice(0, 24) || '新对话';
  }

  saveSessions();
  renderAll();
  return message;
}

function updateMessage(message, content) {
  message.content = content;
  message.updatedAt = Date.now();
  if (message.bubble) {
    setBubbleContent(message.bubble, content, message.role);
  }
  if (message.status) {
    message.status.textContent = '正在生成';
  }
  const session = activeSession();
  if (session) {
    session.updatedAt = Date.now();
  }
  saveSessions();
  scrollToBottom();
}

function markStreaming(message, streaming) {
  message.streaming = streaming;
  if (message.item) {
    message.item.classList.toggle('streaming', streaming);
  }
  if (message.status) {
    message.status.textContent = streaming ? '正在生成' : message.status.textContent;
  }
}

function scrollToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setBusy(busy) {
  state.busy = busy;
  sendButton.disabled = busy;
  stopButton.disabled = !busy;
  sendButton.textContent = busy ? '发送中' : '发送';
}

async function copyText(text) {
  await navigator.clipboard.writeText(text || '');
  setStatus('已复制');
}

async function fetchModels() {
  const key = relayKey();
  if (!key) {
    setStatus('请输入访问密钥', 'error');
    return;
  }

  localStorage.setItem(KEY_STORAGE, key);
  setStatus('读取模型中');

  const response = await fetch('/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  });

  if (!response.ok) {
    throw new Error(`模型列表读取失败：${response.status}`);
  }

  const payload = await response.json();
  const previous = localStorage.getItem(MODEL_STORAGE);
  const models = selectModels((payload.data ?? []).map((model) => model.id));
  modelSelect.replaceChildren();

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.append(option);
  }

  if (previous && [...modelSelect.options].some((option) => option.value === previous)) {
    modelSelect.value = previous;
  }

  if (!modelSelect.value && modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
  }

  saveSettings();
  updateMeta();
  setStatus(`已连接，${modelSelect.options.length} 个模型`);
}

function parseSseChunk(buffer, onEvent) {
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

function contentDelta(payload) {
  return payload?.choices?.[0]?.delta?.content
    ?? payload?.choices?.[0]?.message?.content
    ?? '';
}

function requestMessages(prompt) {
  const messages = [];
  const systemPrompt = systemPromptInput.value.trim();
  const session = activeSession();

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  if (contextToggle.checked && session) {
    for (const message of session.messages) {
      if (message.type === 'error') continue;
      if (message.role === 'user' || message.role === 'assistant') {
        messages.push({ role: message.role, content: message.content });
      }
    }
  }

  messages.push({ role: 'user', content: prompt });
  return messages;
}

function detectTaskModel(prompt) {
  const text = prompt.toLowerCase();
  for (const rule of SAFE_MODEL_ALIASES) {
    if (rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      return rule.model;
    }
  }

  if (/[{}[\];()<>:=]/.test(prompt) || /\b(function|class|import|const|let|var|return|async|await)\b/i.test(prompt)) {
    return 'qwen/qwen3-coder:free';
  }

  return modelSelect.value || FALLBACK_MODEL;
}

async function requestStream({ prompt, assistantMessage, model }) {
  state.controller = new AbortController();

  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${relayKey()}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: Number(temperatureInput.value),
      max_tokens: Number(maxTokensInput.value),
      messages: requestMessages(prompt),
    }),
    signal: state.controller.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message ?? `请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式读取');
  }

  markStreaming(assistantMessage, true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let sawDelta = false;
  let lastChunkAt = Date.now();
  let idleTimer = setInterval(() => {
    if (Date.now() - lastChunkAt > STREAM_IDLE_TIMEOUT_MS) {
      state.controller?.abort();
      setStatus('上游生成超时，已中断', 'error');
    }
  }, 5000);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    lastChunkAt = Date.now();
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseChunk(buffer, (data) => {
      if (data === '[DONE]') return;
      try {
        const delta = contentDelta(JSON.parse(data));
        if (delta) {
          sawDelta = true;
          content += delta;
          updateMessage(assistantMessage, content);
        }
      } catch {
        // Ignore malformed fragments.
      }
    });
  }

  if (!content) {
    assistantMessage.type = 'error';
    updateMessage(assistantMessage, sawDelta ? '(生成已结束但没有可显示内容)' : '(上游没有返回内容)');
    throw new Error('上游没有返回内容');
  }

  clearInterval(idleTimer);
}

async function sendWithFallback(prompt, assistantMessage) {
  const primaryModel = detectTaskModel(prompt);
  const models = [primaryModel];

  if (fallbackToggle.checked) {
    for (const preferred of CODE_MODEL_PRIORITY) {
      if (preferred !== primaryModel && !models.includes(preferred) && modelSelect.querySelector(`option[value="${preferred}"]`)) {
        models.push(preferred);
      }
    }

    if (primaryModel !== FALLBACK_MODEL && !models.includes(FALLBACK_MODEL)) {
      models.push(FALLBACK_MODEL);
    }
  }

  let lastError;
  for (const model of models) {
    try {
      modelSelect.value = model;
      saveSettings();
      updateMeta();
      if (model !== primaryModel) {
        setStatus(`切换备用模型：${model}`);
      }
      await requestStream({ prompt, assistantMessage, model });
      return;
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') throw error;
      if (!fallbackToggle.checked || model === models.at(-1)) break;
    }
  }

  throw lastError;
}

function exportConversation() {
  const session = activeSession();
  if (!session) return;

  const lines = [
    `# ${session.title || '新对话'}`,
    '',
    ...session.messages.map((message) => {
      const role = message.role === 'user' ? '用户' : '助手';
      return `## ${role}\n\n${message.content}`;
    }),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(session.title || 'conversation').slice(0, 24)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus('已导出');
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }

  if (!relayKey()) {
    setStatus('请输入访问密钥', 'error');
    return;
  }

  saveSettings();
  addMessage('user', prompt, 'user');
  const assistantMessage = addMessage('assistant', '', 'assistant');
  promptInput.value = '';
  setBusy(true);
  setStatus('流式生成中');

  try {
    await sendWithFallback(prompt, assistantMessage);
    setStatus('已完成');
  } catch (error) {
    if (error.name === 'AbortError') {
      const text = assistantMessage.content || '已停止生成';
      updateMessage(assistantMessage, text);
      setStatus(text === '已停止生成' ? '已停止' : '已中断', 'error');
    } else {
      if (assistantMessage.content === '(上游没有返回内容)' || assistantMessage.content === '(生成已结束但没有可显示内容)') {
        assistantMessage.type = 'error';
        updateMessage(assistantMessage, '上游没有返回内容');
        setStatus('上游没有返回内容', 'error');
      } else {
        assistantMessage.type = 'error';
        updateMessage(assistantMessage, error.message);
        setStatus('请求失败', 'error');
      }
      renderMessages();
    }
  } finally {
    markStreaming(assistantMessage, false);
    if (assistantMessage.status) {
      assistantMessage.status.textContent = assistantMessage.type === 'error'
        ? '未完成'
        : (assistantMessage.content ? '已完成' : '已停止');
    }
    state.controller = null;
    setBusy(false);
    saveSessions();
    renderSessions();
    promptInput.focus();
  }
});

sessionList.addEventListener('click', (event) => {
  const button = event.target.closest('.session-button');
  if (!button || state.busy) return;
  state.activeId = button.dataset.id;
  saveSessions();
  renderAll();
});

newChatButton.addEventListener('click', () => {
  if (!state.busy) createSession();
});

refreshButton.addEventListener('click', async () => {
  try {
    await fetchModels();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

clearButton.addEventListener('click', () => {
  const session = activeSession();
  if (!session || state.busy) return;
  session.messages = [];
  session.title = '新对话';
  saveSessions();
  renderAll();
  setStatus('已清空');
});

copyLastButton.addEventListener('click', () => {
  const session = activeSession();
  const last = [...(session?.messages || [])].reverse().find((message) => message.role === 'assistant' && message.type !== 'error');
  if (last) copyText(last.content);
});

exportButton.addEventListener('click', exportConversation);

stopButton.addEventListener('click', () => {
  state.controller?.abort();
});

modelSelect.addEventListener('change', () => {
  saveSettings();
  updateMeta();
});

[relayKeyInput, systemPromptInput, contextToggle, fallbackToggle].forEach((input) => {
  input.addEventListener('change', saveSettings);
});

poolSelect.addEventListener('change', () => {
  saveSettings();
  fetchModels().catch((error) => {
    setStatus(error.message, 'error');
  });
});

[temperatureInput, maxTokensInput].forEach((input) => {
  input.addEventListener('input', () => {
    updateRangeLabels();
    saveSettings();
  });
});

sessionSearchInput.addEventListener('input', () => {
  renderSessions();
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

loadSettings();
loadSessions();
renderAll();
fetchModels().catch((error) => {
  setStatus(error.message, 'error');
});
