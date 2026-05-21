import { Badge, Button, Card, Input, Progress, Select, Space, Statistic, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { modelTags } from '../lib/models.js';
import { MiniTrend } from './MiniTrend.jsx';

const { Text } = Typography;

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

export function InspectorPanel({
  relayKey,
  model,
  models,
  pool,
  metrics,
  onRelayKeyChange,
  onModelChange,
  onPoolChange,
  onRefresh,
}) {
  const tags = modelTags(model);
  const primaryHealth = metrics.modelHealth[0];

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
            {tags.length ? tags.map((tag) => <Tag key={tag} color={tag === '代码' ? 'blue' : tag === '备用' ? 'gold' : 'default'}>{tag}</Tag>) : <Tag>未识别</Tag>}
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

      <Card size="small" title="智能策略">
        <div className="policy-list">
          <Badge status="processing" text="采样策略自动匹配任务类型" />
          <Badge status="success" text="上下文默认保留" />
          <Badge status="success" text="异常时自动切换备用模型" />
          <Badge status="default" text={`当前主力模型：${primaryHealth?.model || model || '未记录'}`} />
        </div>
      </Card>

      <Card size="small" title="用量概览">
        <div className="metric-grid">
          <Statistic title="调用" value={metrics.calls} />
          <Statistic title="成功率" value={metrics.successRate} suffix="%" />
          <Statistic title="输出 Token" value={metrics.outputTokens} formatter={formatNumber} />
          <Statistic title="均值" value={metrics.averageOutputTokens} suffix="tok" />
        </div>
      </Card>

      <Card size="small" title="最近调用">
        <MiniTrend data={metrics.trend} />
      </Card>

      <Card size="small" title="模型健康">
        <div className="model-health-list">
          {metrics.modelHealth.length ? metrics.modelHealth.map((item) => (
            <div className="model-health-item" key={item.model}>
              <div className="model-health-head">
                <Text className="model-health-name">{item.model}</Text>
                <Text type="secondary">{item.calls} 次</Text>
              </div>
              <Progress percent={item.successRate} size="small" showInfo={false} strokeLinecap="butt" />
              <div className="model-health-foot">
                <Text type="secondary">成功率 {item.successRate}%</Text>
                <Text type="secondary">{formatNumber(item.tokens)} tok</Text>
              </div>
            </div>
          )) : (
            <Text type="secondary">还没有模型调用记录</Text>
          )}
        </div>
      </Card>
    </aside>
  );
}
