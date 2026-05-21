import { useEffect, useRef } from 'react';
import { Button, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { markdownToHtml } from '../lib/markdown.js';

const { Text } = Typography;

export function MessageBubble({ message, onCopy }) {
  const bubbleRef = useRef(null);
  const isAssistant = message.role === 'assistant';
  const content = message.visibleContent ?? message.content ?? '';

  useEffect(() => {
    const node = bubbleRef.current;
    if (!node || !isAssistant) return;

    for (const pre of node.querySelectorAll('pre')) {
      if (pre.querySelector('.code-copy')) continue;
      const code = pre.querySelector('code');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = '复制代码';
      button.addEventListener('click', () => onCopy(code?.textContent || pre.textContent || ''));
      pre.prepend(button);
    }
  }, [content, isAssistant, onCopy]);

  return (
    <article className={`message-row ${message.role} ${message.type || ''} ${message.streaming ? 'streaming' : ''} ${message.interrupted ? 'interrupted' : ''}`}>
      <div className="message-meta">
        <Text type="secondary">
          {message.role === 'user' ? '你' : message.type === 'error' ? '错误' : `模型${message.model ? ` · ${message.model}` : ''}`}
        </Text>
        {isAssistant && message.type !== 'error' ? (
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => onCopy(message.content || '')}>
            复制
          </Button>
        ) : null}
      </div>
      <div
        ref={bubbleRef}
        className="message-bubble"
        dangerouslySetInnerHTML={isAssistant ? { __html: markdownToHtml(content) } : undefined}
      >
        {isAssistant ? null : content}
      </div>
      <Text className="message-state" type={message.type === 'error' ? 'danger' : 'secondary'}>
        {message.streaming
          ? '正在生成'
          : message.interrupted
            ? '未完成，可继续'
            : message.createdAt
              ? new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour12: false })
              : ''}
      </Text>
    </article>
  );
}
