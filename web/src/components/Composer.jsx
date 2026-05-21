import { Button, Input, Space, Typography } from 'antd';
import { SendOutlined, StopOutlined } from '@ant-design/icons';

const templates = [
  ['解释代码', '解释这段代码，说明核心逻辑、输入输出和潜在风险：'],
  ['找 bug', '帮我检查这段代码的 bug，按严重程度列出问题和修复建议：'],
  ['优化', '帮我优化这段内容，保持含义不变，让结构更清晰：'],
  ['总结', '请总结下面内容，给出要点和下一步建议：'],
];

export function Composer({ value, busy, model, onChange, onSend, onStop }) {
  function applyTemplate(prefix) {
    const current = value.trim();
    onChange(current ? `${prefix}\n\n${current}` : prefix);
  }

  return (
    <form className="composer" onSubmit={(event) => {
      event.preventDefault();
      onSend();
    }}>
      <Space wrap size={8}>
        {templates.map(([label, prompt]) => (
          <Button key={label} size="small" onClick={() => applyTemplate(prompt)}>
            {label}
          </Button>
        ))}
      </Space>

      <div className="composer-input-row">
        <Input.TextArea
          value={value}
          autoSize={{ minRows: 3, maxRows: 9 }}
          placeholder="输入内容"
          onChange={(event) => onChange(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="composer-buttons">
          <Button icon={<StopOutlined />} disabled={!busy} onClick={onStop}>
            停止
          </Button>
          <Button type="primary" htmlType="submit" loading={busy} icon={<SendOutlined />}>
            发送
          </Button>
        </div>
      </div>

      <Typography.Text type="secondary" className="composer-meta">
        {value.trim().length} 字 · {model || '未选择模型'}
      </Typography.Text>
    </form>
  );
}
