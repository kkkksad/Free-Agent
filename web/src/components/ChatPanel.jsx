import { useEffect, useRef } from 'react';
import { Button, Empty, Space, Tooltip, Typography } from 'antd';
import { ClearOutlined, CopyOutlined, DownloadOutlined, RedoOutlined, RetweetOutlined } from '@ant-design/icons';
import { Composer } from './Composer.jsx';
import { MessageBubble } from './MessageBubble.jsx';

const { Text, Title } = Typography;

export function ChatPanel({
  session,
  model,
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
}) {
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [session?.messages]);

  return (
    <section className="chat-pane">
      <header className="chat-head">
        <div>
          <Title level={4}>{session?.title || '新对话'}</Title>
          <Text type="secondary">{model || '未选择模型'}</Text>
        </div>
        <Space wrap>
          <Tooltip title="继续生成"><Button icon={<RetweetOutlined />} onClick={onContinue} /></Tooltip>
          <Tooltip title="重新生成"><Button icon={<RedoOutlined />} onClick={onRegenerate} /></Tooltip>
          <Tooltip title="复制最后回复"><Button icon={<CopyOutlined />} onClick={onCopyLast} /></Tooltip>
          <Tooltip title="导出当前对话"><Button icon={<DownloadOutlined />} onClick={onExport} /></Tooltip>
          <Tooltip title="清空当前对话"><Button danger icon={<ClearOutlined />} onClick={onClear} /></Tooltip>
        </Space>
      </header>

      <div className="chat-log" ref={chatRef}>
        {!session || session.messages.length === 0 ? (
          <Empty description="开始一个问题" />
        ) : (
          session.messages.map((message) => (
            <MessageBubble key={message.id} message={message} onCopy={onCopy} />
          ))
        )}
      </div>

      <Composer
        value={prompt}
        busy={busy}
        model={model}
        onChange={onPromptChange}
        onSend={onSend}
        onStop={onStop}
      />
    </section>
  );
}
