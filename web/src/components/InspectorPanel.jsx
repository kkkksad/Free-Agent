import { Badge, Button, Card, Empty, Progress, Select, Space, Statistic, Tabs, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { modelTags } from '../lib/models.js';
import { MiniTrend } from './MiniTrend.jsx';

const { Text } = Typography;

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

export function InspectorPanel({
  model,
  models,
  pool,
  metrics,
  recentFiles = [],
  onModelChange,
  onPoolChange,
  onRefresh,
}) {
  const tags = modelTags(model);
  const primaryHealth = metrics.modelHealth[0];
  const usageTotal = metrics.inputTokens + metrics.outputTokens;

  const connectionCard = (
    <Card
      size="small"
      title="连接状态"
      extra={<Button type="text" icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>}
    >
      <div className="policy-list">
        <Badge status="success" text="本地访问密钥已隐藏" />
        <Badge status="processing" text="模型列表可手动刷新" />
        <Badge status="default" text="密钥仍由本地配置用于请求" />
      </div>
    </Card>
  );

  const modelPicker = (
    <Card size="small" title="模型路由">
      <div className="form-stack">
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
  );

  const policyCard = (
    <Card size="small" title="智能策略">
      <div className="policy-list">
        <Badge status="processing" text="采样策略自动匹配任务类型" />
        <Badge status="success" text="上下文默认保留" />
        <Badge status="success" text="异常时自动切换备用模型" />
        <Badge status="default" text={`当前主力模型：${primaryHealth?.model || model || '未记录'}`} />
      </div>
    </Card>
  );

  const overview = (
    <div className="tab-stack">
      <Card size="small" title="核心指标">
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
      {policyCard}
    </div>
  );

  const modelHealth = (
    <div className="tab-stack">
      {modelPicker}
      <Card
        size="small"
        title="模型健康"
        extra={<Text type="secondary">{metrics.modelHealth.length} 个模型</Text>}
      >
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
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有模型调用记录" />
          )}
        </div>
      </Card>
    </div>
  );

  const usage = (
    <div className="tab-stack">
      <Card size="small" title="Token 估算">
        <div className="metric-grid">
          <Statistic title="输入 Token" value={metrics.inputTokens} formatter={formatNumber} />
          <Statistic title="输出 Token" value={metrics.outputTokens} formatter={formatNumber} />
          <Statistic title="总 Token" value={usageTotal} formatter={formatNumber} />
          <Statistic title="均值" value={metrics.averageOutputTokens} suffix="tok" />
        </div>
      </Card>
      <Card size="small" title="调用结果">
        <div className="metric-grid">
          <Statistic title="成功" value={metrics.success} />
          <Statistic title="异常" value={metrics.failed} />
          <Statistic title="总调用" value={metrics.calls} />
          <Statistic title="成功率" value={metrics.successRate} suffix="%" />
        </div>
      </Card>
      <Card size="small" title="趋势">
        <MiniTrend data={metrics.trend} />
      </Card>
    </div>
  );

  const files = (
    <div className="tab-stack">
      <Card
        size="small"
        title="文件上下文"
        extra={<Text type="secondary">{recentFiles.length} 个</Text>}
      >
        {recentFiles.length ? (
          <div className="file-context-list">
            {recentFiles.map((file) => (
              <div className="file-context-item" key={file.id}>
                <div>
                  <Text className="file-context-name">{file.name}</Text>
                  <Text type="secondary">{file.sizeLabel} · {formatNumber(file.characters)} 字符</Text>
                </div>
                <Tag color="blue">文本</Tag>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="上传后会显示在这里" />
        )}
      </Card>
      <Card size="small" title="能力边界">
        <div className="capability-list">
          <div>
            <Text strong>文本 / 代码</Text>
            <Tag color="green">已接入</Tag>
          </div>
          <Text type="secondary">会作为本轮上下文加入输入框，所有文本模型都能读取。</Text>
          <div>
            <Text strong>图片 / PDF</Text>
            <Tag>待适配</Tag>
          </div>
          <Text type="secondary">后续按模型是否支持视觉或文档输入来开放。</Text>
        </div>
      </Card>
    </div>
  );

  const settings = (
    <div className="tab-stack">
      {connectionCard}
      {policyCard}
      <Card size="small" title="说明">
        <Text type="secondary">
          Token 为本地估算值；如果上游返回 usage，会优先使用真实 completion token。账单和额度仍以供应商后台为准。
        </Text>
      </Card>
    </div>
  );

  return (
    <aside className="inspector-pane">
      <Tabs
        className="console-tabs"
        defaultActiveKey="overview"
        size="small"
        items={[
          { key: 'overview', label: '概览', children: overview },
          { key: 'models', label: '模型', children: modelHealth },
          { key: 'usage', label: '用量', children: usage },
          { key: 'files', label: '资料', children: files },
          { key: 'settings', label: '设置', children: settings },
        ]}
      />
    </aside>
  );
}
