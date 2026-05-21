import { Button, Card, Input, Select, Slider, Space, Switch, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { modelTags } from '../lib/models.js';

const { Text } = Typography;

export function InspectorPanel({
  relayKey,
  model,
  models,
  pool,
  settings,
  messageCount,
  onRelayKeyChange,
  onModelChange,
  onPoolChange,
  onSettingsChange,
  onRefresh,
}) {
  const tags = modelTags(model);

  return (
    <aside className="inspector-pane">
      <Card
        size="small"
        title="连接"
        extra={<Button type="text" icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>}
      >
        <div className="form-stack">
          <label>
            <Text type="secondary">访问密钥</Text>
            <Input.Password value={relayKey} onChange={(event) => onRelayKeyChange(event.target.value)} autoComplete="off" />
          </label>
          <label>
            <Text type="secondary">模型</Text>
            <Select value={model} options={models.map((item) => ({ label: item, value: item }))} onChange={onModelChange} showSearch />
          </label>
          <Space wrap>
            {tags.length ? tags.map((tag) => <Tag key={tag} color={tag === '代码' ? 'cyan' : tag === '备用' ? 'gold' : 'default'}>{tag}</Tag>) : <Tag>未识别</Tag>}
          </Space>
          <label>
            <Text type="secondary">模型池</Text>
            <Select
              value={pool}
              onChange={onPoolChange}
              options={[
                { label: '编码优先', value: 'code' },
                { label: '免费池', value: 'free' },
                { label: '全部可用', value: 'all' },
              ]}
            />
          </label>
        </div>
      </Card>

      <Card size="small" title="参数" extra={<Text type="secondary">{messageCount} 条消息</Text>}>
        <div className="form-stack">
          <label>
            <Text type="secondary">System Prompt</Text>
            <Input.TextArea
              value={settings.systemPrompt}
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder="可选"
              onChange={(event) => onSettingsChange({ systemPrompt: event.target.value })}
            />
          </label>
          <label>
            <Text type="secondary">Temperature · {settings.temperature.toFixed(1)}</Text>
            <Slider min={0} max={2} step={0.1} value={settings.temperature} onChange={(value) => onSettingsChange({ temperature: value })} />
          </label>
          <label>
            <Text type="secondary">Max Tokens · {settings.maxTokens}</Text>
            <Slider min={128} max={4096} step={128} value={settings.maxTokens} onChange={(value) => onSettingsChange({ maxTokens: value })} />
          </label>
          <div className="switch-row">
            <Text>保留上下文</Text>
            <Switch checked={settings.keepContext} onChange={(checked) => onSettingsChange({ keepContext: checked })} />
          </div>
          <div className="switch-row">
            <Text>失败时自动换备用模型</Text>
            <Switch checked={settings.fallback} onChange={(checked) => onSettingsChange({ fallback: checked })} />
          </div>
        </div>
      </Card>
    </aside>
  );
}
