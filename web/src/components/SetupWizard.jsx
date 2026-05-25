import { Alert, Button, Form, Input, Modal, Result, Space, Steps, Typography } from 'antd';
import { CheckCircleOutlined, KeyOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

const steps = [
  { title: '密钥', icon: <KeyOutlined /> },
  { title: '连接', icon: <ThunderboltOutlined /> },
  { title: '完成', icon: <CheckCircleOutlined /> },
];

export function SetupWizard({
  open,
  saving,
  testing,
  step,
  error,
  onSave,
  onRetryStatus,
  onFinish,
}) {
  const [form] = Form.useForm();
  const isDone = step >= 2;

  async function handleFinish(values) {
    await onSave(values.openRouterApiKey.trim());
    form.setFieldsValue({ openRouterApiKey: '' });
  }

  return (
    <Modal
      centered
      closable={false}
      footer={null}
      keyboard={false}
      mask={{ closable: false }}
      open={open}
      width={640}
      className="setup-modal"
    >
      <div className="setup-shell">
        <div className="setup-head">
          <div>
            <Title level={3}>配置 Free Agent</Title>
            <Text type="secondary">第一次运行只需要把 OpenRouter Key 存到本机。</Text>
          </div>
        </div>

        <Steps className="setup-steps" current={step} items={steps} responsive={false} size="small" />

        {isDone ? (
          <Result
            status="success"
            title="本地中转站已就绪"
            subTitle="密钥已经写入当前目录的 .env，页面会使用本地 relay token 访问服务。"
            extra={(
              <Button type="primary" onClick={onFinish}>
                进入工作台
              </Button>
            )}
          />
        ) : (
          <div className="setup-body">
            <Alert
              showIcon
              type="info"
              title="密钥只保存在本机"
              description="这里不会把 OpenRouter Key 写进前端、仓库或构建产物。保存后常规设置页也不会展示它。"
            />

            {error ? (
              <Alert
                showIcon
                type="error"
                title="配置没有完成"
                description={error}
                action={<Button size="small" onClick={onRetryStatus}>重新检查</Button>}
              />
            ) : null}

            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={handleFinish}
            >
              <Form.Item
                label="OpenRouter Key"
                name="openRouterApiKey"
                rules={[
                  { required: true, message: '请输入 OpenRouter Key' },
                  {
                    pattern: /^sk-or-/,
                    message: 'OpenRouter Key 通常以 sk-or- 开头',
                  },
                ]}
              >
                <Input.Password
                  autoComplete="off"
                  placeholder="sk-or-v1-..."
                  size="large"
                />
              </Form.Item>

              <div className="setup-actions">
                <Space>
                  <Text type="secondary">保存后会自动检查本地模型列表。</Text>
                </Space>
                <Button
                  htmlType="submit"
                  loading={saving || testing}
                  type="primary"
                >
                  {testing ? '检查连接中' : '保存并检查'}
                </Button>
              </div>
            </Form>
          </div>
        )}
      </div>
    </Modal>
  );
}
