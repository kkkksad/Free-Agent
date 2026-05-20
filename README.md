# OpenRouter 本地中转站

这是一个本地自用的 OpenRouter API 中转站。客户端只访问本服务，本服务在服务端使用
`OPENROUTER_API_KEY` 转发到 OpenRouter，并要求客户端提供你自己的
`RELAY_API_KEY`。

## 已实现

- `GET /health`：健康检查。
- `GET /v1/models`：OpenAI 兼容模型列表。
- `GET /v1/models/:model`：模型详情检查。
- `POST /v1/chat/completions`：OpenAI 兼容聊天接口。
- `POST /v1/messages`：Anthropic/Claude 兼容消息接口，适合 Claude Code、CCSwitch 等客户端。
- `POST /v1/messages/count_tokens`：Anthropic/Claude 兼容 token 计数测试接口。
- 兼容部分客户端使用的根路径：`GET /models`、`POST /chat/completions`。
- 兼容 `/api/v1/...` 和重复 `/v1/v1/...` 前缀。
- 支持普通响应和 `stream: true` 流式响应。
- 支持模型白名单。
- 支持请求体大小限制。
- 不把 OpenRouter Key 写进代码或日志。

## 本地配置

仓库里已经放了一个占位 `.env`，你需要把里面的
`OPENROUTER_API_KEY=replace-with-new-openrouter-key` 替换成新的 OpenRouter
Key。也可以参考 `.env.example` 重新创建。

注意：你之前贴到聊天里的 OpenRouter Key 应按已泄露处理。正式使用前，请在
OpenRouter 后台删除旧 key，并重新生成一个新的 key。

`.env` 示例：

```env
OPENROUTER_API_KEY=sk-or-v1-your-new-key
RELAY_API_KEY=your-local-relay-token
ALLOWED_MODELS=openrouter/free,qwen/qwen3-coder:free,baidu/cobuddy:free,openrouter/owl-alpha
FALLBACK_MODELS=qwen/qwen3-coder:free,openrouter/free
PORT=3000
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_TITLE=Local OpenRouter Relay
```

## 启动

```powershell
node src/server.js
```

启动后访问：

```text
http://localhost:3000
```

这个地址会打开本地聊天窗口。访问密钥默认填：

```text
local-dev-token
```

聊天窗口支持：

- 左侧会话列表和新建对话。
- 会话搜索、导出、置顶、重命名和删除。
- 多轮上下文。
- `Enter` 发送，`Shift + Enter` 换行。
- Markdown、列表、链接和代码块渲染。
- 常用 prompt 模板：解释代码、找 bug、优化、总结。
- 复制最后回复、单条回复或代码块。
- 继续生成和重新生成最近一次问题。
- 原生打字机式流式渲染，不依赖第三方插件。
- 长文本流式输出异常中断时，会自动尝试续写并接到同一条回复后面。
- 清空当前对话。
- 停止生成。
- 模型参数设置、模型池和模型标签。
- 输入字数和当前模型提示。
- 失败时自动切换 `qwen/qwen3-coder:free` 和 `openrouter/free` 备用模型。
- 流式请求若长时间没有新内容，会提示并自动中断。

前端代码已按职责拆分：

- `public/assets/app.js`：页面状态、事件绑定和请求流程。
- `public/assets/markdown.js`：Markdown、代码块和复制按钮渲染。
- `public/assets/stream.js`：SSE 分片解析和增量内容提取。
- `public/assets/typewriter.js`：打字机式流式显示。

健康检查地址：

```text
http://localhost:3000/health
```

机器可读状态地址：

```text
http://localhost:3000/status
```

## 调用方式

OpenAI 兼容客户端的 Base URL 优先填：

```text
http://localhost:3000/v1
```

如果客户端不会自动拼 `/v1`，也可以填：

```text
http://localhost:3000
```

客户端的 API Key 填：

```text
RELAY_API_KEY 的值
```

CCSwitch 建议配置：

```text
API 请求地址: http://localhost:3000
API Key: local-dev-token
模型: openrouter/free
```

如果 CCSwitch 有“供应商/接口类型”选项，优先选择 Anthropic 或 Claude 兼容。
本服务会处理 `POST /v1/messages`，并转发到 OpenRouter 的 Anthropic Messages
接口。

如果测试模型仍然返回 404，请看启动中转站的终端输出。服务会打印
`relay_route_not_found`，里面的 `path` 就是 CCSwitch 实际请求的路径。

请求示例：

```powershell
$body = @{
  model = "openai/gpt-4o-mini"
  messages = @(
    @{ role = "user"; content = "你好，简单介绍一下你自己" }
  )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Uri "http://localhost:3000/v1/chat/completions" `
  -Method Post `
  -Headers @{ Authorization = "Bearer your-local-relay-token" } `
  -ContentType "application/json" `
  -Body $body
```

## 免费模型

OpenRouter 的免费模型通常使用 `:free` 后缀，也可以使用免费模型路由
`openrouter/free`。本地白名单已经默认放入几个适合试用的模型：

- `openrouter/free`
- `qwen/qwen3-coder:free`
- `baidu/cobuddy:free`
- `openrouter/owl-alpha`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
- `poolside/laguna-m.1:free`
- `poolside/laguna-xs.2:free`

如果客户端要求你手动填写模型名，优先试 `openrouter/free`。如果它不兼容，
再试 `qwen/qwen3-coder:free`。

## 安全规则

- 不要把真实 OpenRouter Key 写进任何文件。
- 不要把 `.env` 提交到仓库。
- 不要把本服务无鉴权暴露到公网。
- 如果准备公网部署，先加上 HTTPS、限流和更严格的访问控制。
