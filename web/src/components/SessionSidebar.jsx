import { Button, Input, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

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
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <Title level={3}>中转站</Title>
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
