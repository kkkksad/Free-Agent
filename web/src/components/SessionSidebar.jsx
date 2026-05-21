import { Button, Input, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 40 40" role="img" aria-label="Free Agent">
      <rect className="brand-logo-bg" x="1" y="1" width="38" height="38" rx="10" />
      <path className="brand-logo-mark" d="M12 28V12h16M12 20h12M22 28l6-16" />
      <circle className="brand-logo-node" cx="28" cy="12" r="3" />
    </svg>
  );
}

export function SessionSidebar({
  sessions,
  activeId,
  search,
  status,
  statusTone,
  onSearch,
  onCreate,
  onSelect,
  onPin,
  onRename,
  onDelete,
}) {
  const filtered = [...sessions]
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return (right.updatedAt || 0) - (left.updatedAt || 0);
    })
    .filter((session) => {
      const keyword = search.trim().toLowerCase();
      if (!keyword) return true;
      const haystack = `${session.title} ${session.messages.map((message) => message.content).join(' ')}`.toLowerCase();
      return haystack.includes(keyword);
    });

  return (
    <aside className="sidebar-pane">
      <div className="brand">
        <BrandLogo />
        <div>
          <Title level={3}>Free Agent</Title>
          <Text type={statusTone === 'error' ? 'danger' : 'secondary'}>{status}</Text>
        </div>
      </div>

      <Button block type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新对话
      </Button>

      <Input.Search value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索会话或内容" allowClear />

      <div className="session-list">
        {filtered.map((session) => (
          <article key={session.id} className={`session-card ${session.id === activeId ? 'active' : ''}`}>
            <button className="session-main" type="button" onClick={() => onSelect(session.id)}>
              <strong>{session.title || '新对话'}</strong>
              <span>{session.messages.length} 条消息</span>
            </button>
            <Space size={2}>
              <Tooltip title={session.pinned ? '取消置顶' : '置顶'}>
                <Button size="small" type="text" icon={session.pinned ? <PushpinFilled /> : <PushpinOutlined />} onClick={() => onPin(session.id)} />
              </Tooltip>
              <Tooltip title="重命名">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onRename(session.id)} />
              </Tooltip>
              <Tooltip title="删除">
                <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => onDelete(session.id)} />
              </Tooltip>
            </Space>
          </article>
        ))}
      </div>
    </aside>
  );
}
