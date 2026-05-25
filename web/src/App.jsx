import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Modal, message as antdMessage } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ChatPanel } from './components/ChatPanel.jsx';
import { InspectorPanel } from './components/InspectorPanel.jsx';
import { SetupWizard } from './components/SetupWizard.jsx';
import { SessionSidebar } from './components/SessionSidebar.jsx';
import { fetchModels, fetchSetupStatus, requestChatStream, saveSetupConfig, StreamInterruptedError } from './api/relay.js';
import { CODE_MODEL_PRIORITY, FALLBACK_MODEL, detectTaskModel, selectModels } from './lib/models.js';
import { continuationPrompt } from './lib/continuation.js';
import { sessionMetrics } from './lib/metrics.js';
import { nowId, readJson, storageKeys, writeJson } from './lib/storage.js';

const defaultSettings = {
  systemPrompt: '',
  temperature: 0.3,
  maxTokens: 2048,
  keepContext: true,
  fallback: true,
};

const AUTO_CONTINUE_LIMIT = 2;
const STREAM_IDLE_TIMEOUT_MS = 45000;
const RECENT_FILE_LIMIT = 8;

function createSession(title = '新对话') {
  return {
    id: nowId(),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createMessage(role, content, extra = {}) {
  return {
    id: nowId(),
    role,
    content,
    visibleContent: content,
    type: role,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  };
}

function trimTitle(content) {
  return content.trim().slice(0, 24) || '新对话';
}

function exportMarkdown(session) {
  const lines = [
    `# ${session.title || '新对话'}`,
    '',
    ...session.messages.map((item) => {
      const role = item.role === 'user' ? '用户' : '助手';
      return `## ${role}\n\n${item.content || ''}`;
    }),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(session.title || 'conversation').slice(0, 24)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeFileName(name) {
  return String(name || '未命名文件').replace(/[<>"&]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '&': '&amp;',
  }[character]));
}

function buildFilePromptBlock(file) {
  const normalizedContent = file.content.replace(/\r\n/g, '\n');
  return [
    '以下是我上传的文件内容，请把它作为本轮上下文：',
    '',
    `<file name="${escapeFileName(file.name)}" size="${formatFileSize(file.size)}">`,
    normalizedContent,
    '</file>',
  ].join('\n');
}

export function App() {
  const [sessions, setSessions] = useState(() => {
    const saved = readJson(storageKeys.sessions, []);
    return saved.length ? saved : [createSession()];
  });
  const [activeId, setActiveId] = useState(() => localStorage.getItem(storageKeys.activeSession) || '');
  const [relayKey] = useState(() => localStorage.getItem(storageKeys.relayKey) || 'local-dev-token');
  const [pool, setPool] = useState(() => readJson(storageKeys.settings, {}).pool || 'free');
  const [settings, setSettings] = useState(() => ({ ...defaultSettings, ...readJson(storageKeys.settings, {}) }));
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem(storageKeys.model) || '');
  const [prompt, setPrompt] = useState('');
  const [recentFiles, setRecentFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatusText] = useState('连接中');
  const [statusTone, setStatusTone] = useState('normal');
  const [setup, setSetup] = useState({
    checked: false,
    open: false,
    step: 0,
    saving: false,
    testing: false,
    error: '',
  });

  const controllerRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const typewriterTimers = useRef(new Map());
  const sessionsRef = useRef(sessions);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) || sessions[0],
    [activeId, sessions],
  );

  const selectedModels = useMemo(() => selectModels(models, pool), [models, pool]);
  const metrics = useMemo(() => sessionMetrics(sessions), [sessions]);

  function setStatus(next, tone = 'normal') {
    setStatusText(next);
    setStatusTone(tone);
  }

  function updateSessions(updater) {
    const next = typeof updater === 'function' ? updater(sessionsRef.current) : updater;
    sessionsRef.current = next;
    setSessions(next);
  }

  function patchSession(sessionId, updater) {
    updateSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session;
      return updater(session);
    }));
  }

  function patchMessage(sessionId, messageId, updater) {
    patchSession(sessionId, (session) => ({
      ...session,
      updatedAt: Date.now(),
      messages: session.messages.map((message) => (
        message.id === messageId ? updater(message) : message
      )),
    }));
  }

  function setMessageContent(sessionId, messageId, content, options = {}) {
    patchMessage(sessionId, messageId, (message) => ({
      ...message,
      content,
      visibleContent: options.visibleContent ?? content,
      updatedAt: Date.now(),
      ...options.patch,
    }));
  }

  function typeMessage(sessionId, messageId, target) {
    const timerKey = `${sessionId}:${messageId}`;
    const existingTimer = typewriterTimers.current.get(timerKey);
    if (existingTimer) window.clearTimeout(existingTimer);

    function tick() {
      let done = false;
      updateSessions((current) => current.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          updatedAt: Date.now(),
          messages: session.messages.map((message) => {
            if (message.id !== messageId) return message;
            const visible = message.visibleContent ?? '';
            if (visible.length >= target.length) {
              done = true;
              return { ...message, content: target, visibleContent: target, updatedAt: Date.now() };
            }
            const nextVisible = target.slice(0, Math.min(visible.length + 3, target.length));
            return { ...message, content: target, visibleContent: nextVisible, updatedAt: Date.now() };
          }),
        };
      }));

      if (!done) {
        typewriterTimers.current.set(timerKey, window.setTimeout(tick, 16));
      } else {
        typewriterTimers.current.delete(timerKey);
      }
    }

    tick();
  }

  function buildMessages(session, currentPrompt, skipIds = new Set()) {
    const messages = [];
    if (settings.systemPrompt.trim()) {
      messages.push({ role: 'system', content: settings.systemPrompt.trim() });
    }

    if (settings.keepContext && session) {
      for (const item of session.messages) {
        if (skipIds.has(item.id) || item.type === 'error' || !item.content?.trim()) continue;
        if (item.role === 'user' || item.role === 'assistant') {
          messages.push({ role: item.role, content: item.content });
        }
      }
    }

    messages.push({ role: 'user', content: currentPrompt });
    return messages;
  }

  function smartTemperature(promptText) {
    if (/[{}[\];()<>:=]/.test(promptText) || /\b(function|class|import|const|let|var|return|async|await)\b/i.test(promptText)) {
      return 0.2;
    }
    if (/写|创意|文案|故事|头脑风暴/.test(promptText)) {
      return 0.7;
    }
    return 0.3;
  }

  function smartMaxTokens(promptText) {
    return promptText.length > 1800 || /完整|详细|长文|代码|实现|重构/.test(promptText) ? 4096 : 2048;
  }

  async function refreshModels(nextKey = relayKey, nextPool = pool) {
    if (!nextKey.trim()) {
      setStatus('请输入访问密钥', 'error');
      return;
    }

    setStatus('读取模型中');
    const allModels = await fetchModels(nextKey.trim());
    const filtered = selectModels(allModels, nextPool);
    setModels(allModels);
    const previous = localStorage.getItem(storageKeys.model);
    const nextModel = previous && filtered.includes(previous) ? previous : filtered[0] || '';
    setModel(nextModel);
    localStorage.setItem(storageKeys.model, nextModel);
    setStatus(`已连接，${filtered.length} 个模型`);
  }

  async function checkSetupStatus({ refreshOnConfigured = false } = {}) {
    try {
      const payload = await fetchSetupStatus();
      if (payload.configured) {
        setSetup((current) => ({ ...current, checked: true, open: false, error: '' }));
        if (refreshOnConfigured) await refreshModels();
      } else {
        setSetup((current) => ({
          ...current,
          checked: true,
          open: true,
          step: 0,
          error: '',
        }));
        setStatus('等待首次配置');
      }
    } catch (error) {
      setSetup((current) => ({ ...current, checked: true, open: false, error: error.message }));
      if (refreshOnConfigured) {
        await refreshModels().catch((refreshError) => setStatus(refreshError.message, 'error'));
      }
    }
  }

  async function handleSetupSave(openRouterApiKey) {
    setSetup((current) => ({ ...current, saving: true, testing: false, error: '' }));
    try {
      await saveSetupConfig({ openRouterApiKey });
      setSetup((current) => ({ ...current, saving: false, testing: true, step: 1 }));
      await refreshModels();
      setSetup((current) => ({
        ...current,
        checked: true,
        saving: false,
        testing: false,
        step: 2,
        error: '',
      }));
    } catch (error) {
      setSetup((current) => ({
        ...current,
        saving: false,
        testing: false,
        error: error.message,
      }));
    }
  }

  async function sendOnce({ sessionId, assistantId, currentPrompt, skipIds, append = false, fixedModel }) {
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    const primary = fixedModel || detectTaskModel(currentPrompt, model || FALLBACK_MODEL);
    const candidates = [primary];

    if (!append && settings.fallback) {
      for (const item of CODE_MODEL_PRIORITY) {
        if (item !== primary && selectedModels.includes(item) && !candidates.includes(item)) candidates.push(item);
      }
      if (primary !== FALLBACK_MODEL && !candidates.includes(FALLBACK_MODEL)) candidates.push(FALLBACK_MODEL);
    }

    let lastError;
    for (const candidate of candidates) {
      try {
        setModel(candidate);
        localStorage.setItem(storageKeys.model, candidate);
        patchMessage(sessionId, assistantId, (message) => ({ ...message, model: candidate, streaming: true, interrupted: false }));
        const baseMessage = sessionsRef.current
          .find((item) => item.id === sessionId)
          ?.messages.find((item) => item.id === assistantId);
        const appendBaseContent = append ? baseMessage?.content || '' : '';

        await requestChatStream({
          relayKey,
          appendBaseContent,
          signal: controllerRef.current.signal,
          idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
          onStatus: setStatus,
          onIdleTimeout: () => controllerRef.current?.abort(),
          body: {
            model: candidate,
            stream: true,
            temperature: smartTemperature(currentPrompt),
            max_tokens: smartMaxTokens(currentPrompt),
            messages: buildMessages(session, currentPrompt, skipIds),
          },
          onUsage: (usage) => {
            patchMessage(sessionId, assistantId, (message) => ({ ...message, usage }));
          },
          onDelta: (_delta, fullContent) => {
            typeMessage(sessionId, assistantId, fullContent);
          },
        });
        return;
      } catch (error) {
        lastError = error;
        if (error.name === 'StreamInterruptedError' || error.name === 'AbortError') throw error;
        if (!settings.fallback || append || candidate === candidates.at(-1)) break;
        setStatus(`切换备用模型：${candidate}`, 'normal');
      }
    }

    throw lastError;
  }

  async function sendWithRecovery(args) {
    let currentPrompt = args.currentPrompt;
    let skipIds = args.skipIds;
    let append = false;
    let fixedModel;

    for (let attempt = 0; attempt <= AUTO_CONTINUE_LIMIT; attempt += 1) {
      try {
        await sendOnce({ ...args, currentPrompt, skipIds, append, fixedModel });
        return;
      } catch (error) {
        if (error.name !== 'StreamInterruptedError' || attempt >= AUTO_CONTINUE_LIMIT || stopRequestedRef.current) {
          throw error;
        }

        const current = sessionsRef.current
          .find((item) => item.id === args.sessionId)
          ?.messages.find((item) => item.id === args.assistantId);
        const content = error.partialContent || current?.content || '';
        setMessageContent(args.sessionId, args.assistantId, content, { visibleContent: content });
        setStatus(`检测到断流，正在自动续写 ${attempt + 1}/${AUTO_CONTINUE_LIMIT}`);
        currentPrompt = continuationPrompt(content);
        skipIds = new Set();
        append = true;
        fixedModel = current?.model || model;
      }
    }
  }

  async function runPrompt(currentPrompt, options = {}) {
    const cleanPrompt = currentPrompt.trim();
    if (busy || !cleanPrompt) return;
    if (!relayKey.trim()) {
      setStatus('请输入访问密钥', 'error');
      return;
    }

    const targetSession = activeSession || createSession();
    const userMessage = options.addUser === false
      ? options.userMessage
      : createMessage('user', cleanPrompt);
    const assistantMessage = createMessage('assistant', '', { model, streaming: true });
    const skipIds = new Set([assistantMessage.id]);
    if (userMessage?.id) skipIds.add(userMessage.id);

    updateSessions((current) => current.map((session) => {
      if (session.id !== targetSession.id) return session;
      const messages = options.addUser === false
        ? [...session.messages, assistantMessage]
        : [...session.messages, userMessage, assistantMessage];
      return {
        ...session,
        title: session.title === '新对话' && userMessage?.content ? trimTitle(userMessage.content) : session.title,
        updatedAt: Date.now(),
        messages,
      };
    }));

    if (options.clearInput !== false) setPrompt('');
    controllerRef.current = new AbortController();
    stopRequestedRef.current = false;
    setBusy(true);
    setStatus('流式生成中');

    try {
      await sendWithRecovery({
        sessionId: targetSession.id,
        assistantId: assistantMessage.id,
        currentPrompt: cleanPrompt,
        skipIds,
      });
      patchMessage(targetSession.id, assistantMessage.id, (message) => ({ ...message, streaming: false }));
      setStatus('已完成');
    } catch (error) {
      if (error.name === 'AbortError') {
        patchMessage(targetSession.id, assistantMessage.id, (message) => ({
          ...message,
          content: message.visibleContent || message.content || '已停止生成',
          visibleContent: message.visibleContent || message.content || '已停止生成',
          streaming: false,
        }));
        setStatus('已中断', 'error');
      } else if (error.name === 'StreamInterruptedError') {
        patchMessage(targetSession.id, assistantMessage.id, (message) => ({
          ...message,
          content: error.partialContent || message.content,
          visibleContent: error.partialContent || message.visibleContent || message.content,
          interrupted: true,
          streaming: false,
        }));
        setStatus('输出未完成，可点继续生成', 'error');
      } else {
        patchMessage(targetSession.id, assistantMessage.id, (message) => ({
          ...message,
          content: error.message,
          visibleContent: error.message,
          type: 'error',
          streaming: false,
        }));
        setStatus('请求失败', 'error');
      }
    } finally {
      setBusy(false);
      controllerRef.current = null;
      stopRequestedRef.current = false;
    }
  }

  function handleCreateSession() {
    const session = createSession();
    updateSessions((current) => [session, ...current]);
    setActiveId(session.id);
  }

  function handleRename(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    const nextTitle = window.prompt('重命名会话', session?.title || '新对话');
    if (nextTitle === null) return;
    patchSession(sessionId, (item) => ({ ...item, title: nextTitle.trim() || '新对话', updatedAt: Date.now() }));
  }

  function handleDelete(sessionId) {
    Modal.confirm({
      title: '删除这个会话？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        updateSessions((current) => {
          const next = current.filter((item) => item.id !== sessionId);
          if (!next.length) return [createSession()];
          if (activeId === sessionId) setActiveId(next[0].id);
          return next;
        });
      },
    });
  }

  function handleContinue() {
    if (!activeSession || busy || !activeSession.messages.length) {
      setStatus('当前没有可继续的对话', 'error');
      return;
    }
    runPrompt('请继续上一次回答，从中断处继续，不要重复已经写过的内容。', { clearInput: false });
  }

  function handleRegenerate() {
    if (!activeSession || busy) return;
    const lastIndex = [...activeSession.messages].map((item, index) => [item, index]).reverse().find(([item]) => item.role === 'user')?.[1];
    if (lastIndex === undefined) {
      setStatus('当前没有可重新生成的问题', 'error');
      return;
    }

    const userMessage = activeSession.messages[lastIndex];
    patchSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.slice(0, lastIndex + 1),
      updatedAt: Date.now(),
    }));
    runPrompt(userMessage.content, { addUser: false, userMessage, clearInput: false });
  }

  function stopStream() {
    stopRequestedRef.current = true;
    controllerRef.current?.abort();
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || '');
    antdMessage.success('已复制');
  }

  function handleAttachFile(file) {
    const block = buildFilePromptBlock(file);
    setPrompt((current) => (current.trim() ? `${current.trimEnd()}\n\n${block}` : block));
    setRecentFiles((current) => [
      {
        id: nowId(),
        name: file.name,
        size: file.size,
        sizeLabel: formatFileSize(file.size),
        characters: file.content.length,
        type: file.type,
        attachedAt: Date.now(),
      },
      ...current,
    ].slice(0, RECENT_FILE_LIMIT));
    antdMessage.success(`已加入 ${file.name}`);
  }

  function handleAttachError(errorMessage) {
    antdMessage.warning(errorMessage);
  }

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!activeId && sessions[0]) setActiveId(sessions[0].id);
  }, [activeId, sessions]);

  useEffect(() => {
    writeJson(storageKeys.sessions, sessions);
    localStorage.setItem(storageKeys.activeSession, activeSession?.id || '');
  }, [sessions, activeSession?.id]);

  useEffect(() => {
    localStorage.setItem(storageKeys.relayKey, relayKey);
    writeJson(storageKeys.settings, { ...settings, pool });
  }, [relayKey, settings, pool]);

  useEffect(() => {
    checkSetupStatus({ refreshOnConfigured: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 8,
          colorBgLayout: '#f7f7f8',
          colorText: '#111827',
          colorTextSecondary: '#6b7280',
          colorBorder: '#e5e7eb',
          colorBgContainer: '#ffffff',
          fontFamily: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif',
        },
        components: {
          Card: { borderRadiusLG: 8 },
          Button: { borderRadius: 8 },
        },
      }}
    >
      <main className="relay-workspace">
        <SessionSidebar
          sessions={sessions}
          activeId={activeSession?.id}
          search={search}
          status={status}
          statusTone={statusTone}
          onSearch={setSearch}
          onCreate={handleCreateSession}
          onSelect={setActiveId}
          onPin={(sessionId) => patchSession(sessionId, (item) => ({ ...item, pinned: !item.pinned, updatedAt: Date.now() }))}
          onRename={handleRename}
          onDelete={handleDelete}
        />

        <ChatPanel
          session={activeSession}
          model={model}
          prompt={prompt}
          busy={busy}
          onPromptChange={setPrompt}
          onSend={() => runPrompt(prompt)}
          onStop={stopStream}
          onCopyLast={() => {
            const last = [...(activeSession?.messages || [])].reverse().find((item) => item.role === 'assistant' && item.type !== 'error');
            if (last) copyText(last.content);
          }}
          onExport={() => activeSession && exportMarkdown(activeSession)}
          onClear={() => patchSession(activeSession.id, (session) => ({ ...session, title: '新对话', messages: [], updatedAt: Date.now() }))}
          onContinue={handleContinue}
          onRegenerate={handleRegenerate}
          onCopy={copyText}
          onAttachFile={handleAttachFile}
          onAttachError={handleAttachError}
        />

        <InspectorPanel
          model={model}
          models={selectedModels}
          pool={pool}
          metrics={metrics}
          recentFiles={recentFiles}
          onModelChange={(nextModel) => {
            setModel(nextModel);
            localStorage.setItem(storageKeys.model, nextModel);
          }}
          onPoolChange={(nextPool) => {
            setPool(nextPool);
            refreshModels(relayKey, nextPool).catch((error) => setStatus(error.message, 'error'));
          }}
          onRefresh={() => refreshModels().catch((error) => setStatus(error.message, 'error'))}
        />
      </main>
      <SetupWizard
        open={setup.open}
        saving={setup.saving}
        testing={setup.testing}
        step={setup.step}
        error={setup.error}
        onSave={handleSetupSave}
        onRetryStatus={() => checkSetupStatus({ refreshOnConfigured: true })}
        onFinish={() => setSetup((current) => ({ ...current, open: false }))}
      />
    </ConfigProvider>
  );
}
