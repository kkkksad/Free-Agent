import { useEffect, useRef } from 'react';
import { Button, Space, Tooltip, Typography } from 'antd';
import { ClearOutlined, CodeOutlined, CopyOutlined, DownloadOutlined, FileTextOutlined, RedoOutlined, RetweetOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Composer } from './Composer.jsx';
import { MessageBubble } from './MessageBubble.jsx';

const { Text, Title } = Typography;

const starterActions = [
  {
    title: '代码体检',
    description: '找结构问题、潜在 bug 和改法',
    icon: <CodeOutlined />,
    prompt: '请帮我分析下面这段代码，按严重程度列出问题、风险和修改建议：',
  },
  {
    title: '整理方案',
    description: '把零散想法变成可执行步骤',
    icon: <ThunderboltOutlined />,
    prompt: '请把下面的想法整理成一个清晰的执行方案，包含目标、步骤、风险和验收标准：',
  },
  {
    title: '写文档',
    description: '生成 README、说明或变更记录',
    icon: <FileTextOutlined />,
    prompt: '请根据下面内容写一份清晰的中文文档，结构要适合后续维护：',
  },
];

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

export function ChatPanel({
  session,
  model,
  metrics,
  prompt,
  busy,
  onPromptChange,
  onSend,
  onStop,
  onCopyLast,
  onExport,
  onClear,
  onContinue,
  onRegenerate,
  onCopy,
  onAttachFile,
  onAttachError,
}) {
  const chatRef = useRef(null);
  const hasMessages = Boolean(session?.messages?.length);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [session?.messages]);

  return (
    <section className="chat-pane">
      <header className="chat-head">
        <div className="chat-title-block">
          <div>
            <Title level={4}>{session?.title || '新对话'}</Title>
            <Text type="secondary">{model || '未选择模型'}</Text>
          </div>
          <div className="chat-status-row">
            <span className={`status-pill ${busy ? 'active' : ''}`}>{busy ? '生成中' : '待命'}</span>
            <span className="status-pill">{formatNumber(metrics.calls)} 次调用</span>
            <span className="status-pill">{metrics.successRate}% 成功率</span>
          </div>
        </div>
        <Space className="chat-actions" wrap>
          <Tooltip title="继续生成"><Button icon={<RetweetOutlined />} onClick={onContinue} /></Tooltip>
          <Tooltip title="重新生成"><Button icon={<RedoOutlined />} onClick={onRegenerate} /></Tooltip>
          <Tooltip title="复制最后回复"><Button icon={<CopyOutlined />} onClick={onCopyLast} /></Tooltip>
          <Tooltip title="导出当前对话"><Button icon={<DownloadOutlined />} onClick={onExport} /></Tooltip>
          <Tooltip title="清空当前对话"><Button danger icon={<ClearOutlined />} onClick={onClear} /></Tooltip>
        </Space>
      </header>

      <div className="chat-log" ref={chatRef}>
        {!hasMessages ? (
          <div className="chat-empty-state">
            <div className="empty-kicker">Free Agent Workbench</div>
            <Title level={2}>今天要处理什么？</Title>
            <Text type="secondary">选一个任务入口，或者直接在下方输入。</Text>
            <div className="starter-grid">
              {starterActions.map((action) => (
                <button
                  className="starter-card"
                  key={action.title}
                  type="button"
                  onClick={() => onPromptChange(action.prompt)}
                >
                  <span className="starter-icon">{action.icon}</span>
                  <strong>{action.title}</strong>
                  <span>{action.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          session.messages.map((message) => (
            <MessageBubble key={message.id} message={message} onCopy={onCopy} />
          ))
        )}
      </div>

      <Composer
        value={prompt}
        busy={busy}
        onChange={onPromptChange}
        onSend={onSend}
        onStop={onStop}
        onAttachFile={onAttachFile}
        onAttachError={onAttachError}
      />
    </section>
  );
}
