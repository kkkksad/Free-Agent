# 执行计划：OpenRouter API 中转站

状态：本地第一版已完成，待真实 OpenRouter Key 验证
负责人：Codex
创建日期：2026-05-20
最后更新：2026-05-20

## 摘要

搭建一个自用 API 中转站，用服务器端保存 OpenRouter API Key，对外提供受控的
OpenAI 兼容接口。客户端只访问自己的中转站，不直接接触 OpenRouter 密钥。
本阶段只列开发文档，不编写业务代码。

## 目标

实现一个最小可用、可扩展、可部署的中转服务：

- 对外提供 OpenAI 兼容的 `/v1/chat/completions` 接口。
- 服务端将请求转发到 OpenRouter 的 `https://openrouter.ai/api/v1/chat/completions`。
- 支持普通响应和流式响应。
- OpenRouter API Key 只保存在服务端环境变量中，不写入代码、文档或日志。
- 对访问中转站的客户端增加一层自己的鉴权，避免中转站被公开滥用。
- 保留后续扩展到模型列表、使用量统计、限流、管理面板的空间。

## 非目标

- 本阶段不写代码。
- 第一版不做复杂管理后台。
- 第一版不做用户注册、充值、计费系统。
- 第一版不代理所有 OpenRouter 端点，只优先代理 chat completions。
- 第一版不把 OpenRouter 密钥提交到仓库，也不在文档中记录真实密钥。

## 背景

- 用户已经注册 OpenRouter 并创建过一个 API Key。
- 该 key 已经出现在聊天中，应按“已暴露密钥”处理。
- OpenRouter 官方文档说明，请求使用 Bearer Token 认证。
- OpenRouter 官方文档说明，使用 OpenAI SDK 时可将 base URL 指向
  `https://openrouter.ai/api/v1`。
- OpenRouter chat completions 端点为
  `POST https://openrouter.ai/api/v1/chat/completions`。
- OpenRouter 建议 API Key 使用环境变量保存，并在怀疑泄露时删除旧 key、创建新 key。

相关文件：

- `AGENTS.md`
- `docs/index.md`
- `docs/DEVELOPMENT_STANDARD.md`
- `docs/exec-plans/_template.md`

相关外部文档：

- OpenRouter Authentication:
  https://openrouter.ai/docs/api/reference/authentication
- OpenRouter API Overview:
  https://openrouter.ai/docs/api/reference/overview
- OpenRouter Chat Completions:
  https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request

假设：

- 中转站主要给自己或少量可信客户端使用。
- 第一版优先保证安全、稳定、易部署，而不是做完整 SaaS。
- 技术栈后续优先选择简单的 Node.js/TypeScript HTTP 服务，除非用户指定其他栈。
- 部署目标后续再确认，可以是本机、VPS、Docker、Cloudflare Workers 或其他平台。

## 影响范围

后续实现预计会新增这些范围：

- 服务入口：HTTP API 服务。
- 配置管理：环境变量、示例配置、密钥读取。
- 鉴权：中转站自己的访问 token。
- 请求转发：把 OpenAI 兼容请求转发到 OpenRouter。
- 流式处理：透传 Server-Sent Events。
- 错误处理：规范化 OpenRouter 错误返回。
- 日志：记录请求状态、耗时、模型、错误码，不记录 prompt 原文和密钥。
- 文档：本地启动、部署、环境变量、接口使用说明。

## 约束

- 真实 OpenRouter API Key 不得写入仓库。
- 真实 OpenRouter API Key 不得出现在日志、错误信息、测试快照或示例文件中。
- 因当前 key 已暴露，正式开发前必须重新生成 key，并废弃旧 key。
- 对外接口必须有自己的鉴权层，不能把中转站无保护地暴露到公网。
- 默认只允许白名单模型，避免客户端随意调用高价模型。
- 默认开启请求体大小限制，避免异常大请求拖垮服务。
- 日志默认只记录必要元数据，不记录用户完整输入和模型完整输出。
- 流式响应必须尽量原样透传，不能破坏 OpenAI 兼容客户端的读取方式。
- 错误返回需要保留足够信息用于排查，但不能泄露服务端密钥或内部路径。

## 建议架构

客户端请求流程：

1. 客户端把请求发到自己的中转站。
2. 中转站校验客户端 token。
3. 中转站检查模型白名单、请求大小和基础参数。
4. 中转站从环境变量读取 OpenRouter API Key。
5. 中转站把请求转发到 OpenRouter。
6. 中转站把响应或流式数据返回给客户端。
7. 中转站记录必要的请求元数据和错误信息。

建议的第一版接口：

- `GET /health`：健康检查。
- `GET /v1/models`：OpenAI 兼容模型列表，返回本地白名单模型。
- `POST /v1/chat/completions`：OpenAI 兼容聊天接口。
- `POST /v1/messages`：Anthropic/Claude 兼容消息接口。
- `GET /models`、`POST /chat/completions`：兼容把 Base URL 填成根地址的客户端。

建议的环境变量：

- `OPENROUTER_API_KEY`：OpenRouter 服务端密钥。
- `RELAY_API_KEY`：访问自己中转站的客户端密钥。
- `OPENROUTER_SITE_URL`：可选，用于 OpenRouter app attribution。
- `OPENROUTER_APP_TITLE`：可选，用于 OpenRouter app attribution。
- `ALLOWED_MODELS`：可选，逗号分隔的模型白名单。
- `PORT`：服务监听端口。

## 验收标准

- 文档阶段：
  - 本文件存在于 `docs/exec-plans/active/`。
  - 文档用中文说明目标、范围、约束、风险和后续实现路线。
  - 文档不包含用户提供的真实 OpenRouter API Key。

- 后续实现阶段：
  - 没有客户端 token 的请求会被拒绝。
  - 有效请求能被转发到 OpenRouter 并返回结果。
  - `stream: true` 请求能持续返回流式数据。
  - 非白名单模型会被拒绝。
  - OpenRouter API Key 只来自环境变量。
  - 日志不会输出密钥、完整 prompt 或完整 completion。
  - README 或部署文档能指导用户本地启动和部署。

## 验证计划

文档阶段：

- 检查执行计划文件是否创建。
- 检查文档中是否包含真实 API Key；如果包含，必须删除。
- 检查是否明确写出“先不写代码”的约束。

后续实现阶段：

- 使用健康检查确认服务启动。
- 使用错误 token 请求，确认返回未授权。
- 使用正确 token 请求非流式 chat completions，确认返回 OpenAI 兼容结构。
- 使用正确 token 请求流式 chat completions，确认客户端能读取 SSE。
- 请求非白名单模型，确认被拒绝。
- 搜索仓库，确认没有真实 OpenRouter API Key。
- 检查日志，确认没有密钥和完整对话内容。

## 风险与回滚

- 风险：OpenRouter API Key 泄露，导致额度被滥用。
  - 回滚：立即删除旧 key，创建新 key，并检查访问日志。

- 风险：中转站无鉴权暴露到公网。
  - 回滚：停止服务或关闭公网入口，补上鉴权后再开放。

- 风险：模型无限制调用导致费用不可控。
  - 回滚：启用模型白名单、额度限制和 OpenRouter 侧 credit limit。

- 风险：日志记录了敏感 prompt、completion 或密钥。
  - 回滚：删除敏感日志，修正日志策略，重新部署。

- 风险：流式响应处理不正确，导致客户端卡住或解析失败。
  - 回滚：先关闭流式代理，仅保留非流式接口，修复后再开启。

## 待确认问题

- 中转站部署在哪里：本机、VPS、Docker、Cloudflare Workers，还是其他平台？
- 预期客户端是什么：自己写的程序、Chatbox、Cherry Studio、OpenAI SDK，还是别的工具？
- 是否需要完全兼容 OpenAI `/v1/models`、`/v1/embeddings` 等其他接口？
- 是否需要多用户、多 token、每日额度或调用统计？
- 第一批允许调用哪些 OpenRouter 模型？

## 进展记录

- 2026-05-20：根据用户要求先创建中文执行计划，不编写代码。
- 2026-05-20：查阅 OpenRouter 官方认证、API 概览和 chat completions 文档。
- 2026-05-20：将用户已贴出的 key 按已暴露密钥处理，未写入文档。
- 2026-05-20：用户确认要先本地搭建，进入第一版本地实现。
- 2026-05-20：完成无第三方依赖的本地 Node.js 中转服务、配置示例、README 和基础测试。
- 2026-05-20：根据 CCSwitch 报错补充模型列表端点，并兼容根地址 Base URL。
- 2026-05-20：根据 CCSwitch 测试连接报错补充 Anthropic Messages 端点 `/v1/messages`。
- 2026-05-20：根据 CCSwitch 测试模型 404，补充模型详情、HEAD 检查、`/api/v1` 前缀、重复 `/v1` 前缀和 `/v1/messages/count_tokens`。
- 2026-05-20：根据用户希望减少命令行输入的需求，新增本地可视化聊天窗口。
- 2026-05-20：将本地聊天窗口升级为流式输出界面，并优化页面视觉与操作控件。
- 2026-05-20：根据用户确认继续升级，实现侧栏会话、多轮上下文、Enter 发送、Markdown/代码块、复制回复和备用模型切换。
- 2026-05-20：根据用户想要“池子”的需求，新增模型池与备用模型池配置。
- 2026-05-20：根据用户继续升级的要求，新增会话搜索、导出和更聪明的任务路由。
- 2026-05-20：根据“分析代码分析到一半就不动”的反馈，给流式生成增加超时和中断提示。

## 决策记录

- 2026-05-20：第一版定位为自用中转站，而不是完整商业 API 平台。理由是先降低范围，优先完成安全可用的代理能力。
- 2026-05-20：第一版优先实现 `/v1/chat/completions`。理由是它是最核心的 OpenAI 兼容聊天入口。
- 2026-05-20：必须增加自己的中转站鉴权。理由是 OpenRouter Key 在服务端集中保存，如果中转站公网裸露，会变成可被滥用的免费入口。
- 2026-05-20：真实密钥只允许通过环境变量注入。理由是降低泄露、提交到仓库和日志外泄风险。
- 2026-05-20：本地第一版使用 Node.js 内置 HTTP 和 fetch 实现，不引入第三方依赖。理由是当前 npm 在 PowerShell 执行策略下不可直接运行，且无依赖服务更容易本地启动。
- 2026-05-20：模型列表由本地 `ALLOWED_MODELS` 生成，而不是直接透传 OpenRouter 全量列表。理由是客户端只应看到当前中转站允许调用的模型。
- 2026-05-20：`/v1/messages` 采用直接透传到 OpenRouter Anthropic Messages API，不在本地转换消息结构。理由是减少协议转换错误，并保持 Claude 兼容客户端的原始请求格式。
- 2026-05-20：404 响应回显收到的路径，并在终端打印 `relay_route_not_found`。理由是不同客户端测试模型的探测路径不完全一致，需要快速定位真实请求路径。
- 2026-05-20：根路径 `/` 改为本地聊天 UI，机器可读状态移动到 `/status`。理由是用户直接打开根地址时应进入可用界面。
- 2026-05-20：前端使用 Fetch ReadableStream 读取 SSE，不引入外部前端依赖。理由是后端已支持流式透传，前端本地解析即可满足可视化体验。
- 2026-05-20：会话历史先保存在浏览器 localStorage。理由是本地自用阶段不引入数据库，也不把对话写入服务端日志。
- 2026-05-20：模型池分为“免费池”“编码优先”“全部可用”，备用池来自 `FALLBACK_MODELS`。理由是用户希望有一个自动挑免费模型的池子，而不是手工固定一个模型。
- 2026-05-20：任务路由根据输入内容选择模型。理由是代码问题优先 coder，普通中文问题优先免费池，减少手动切模型成本。
- 2026-05-20：流式请求增加 idle 超时提示。理由是上游断流或卡住时，前端必须给出明确反馈。

## 完成记录

最终状态：本地第一版已完成；真实 OpenRouter 调用待用户换新 key 后验证。

验证证据：

- 已创建中文执行计划。
- 已完成本地第一版代码实现。
- 已运行语法检查和基础测试。
- 已验证健康检查返回 200，未授权请求返回 401。
- 已补充 `/v1/models` 和 `/models`，用于 CCSwitch 拉取模型列表。
- 已补充 `/v1/messages`、`/messages` 和 `/v1/v1/messages`，用于 CCSwitch 测试连接和 Claude 兼容调用。
- 已补充 `/v1/models/:model`、`HEAD /v1/models`、`/api/v1/...` 和 `/v1/messages/count_tokens`，用于覆盖更多模型测试路径。
- 已新增 `public/` 下的本地聊天 UI，并由根路径 `/` 提供访问。
- 已新增流式渲染、停止生成、清空对话和更完整的本地 UI 样式。
- 已新增侧栏会话、多轮上下文、Markdown/代码块渲染、复制按钮、参数面板和备用模型切换。
- 已新增模型池选择和备用模型池配置。
- 已新增会话搜索、导出，以及基于输入内容的简单自动路由。
- 已新增流式超时、中断提示和最后更新时间状态。

后续事项：

- 用户确认部署方式、客户端类型和需要支持的接口。
- 用户在 OpenRouter 后台废弃已暴露 key，并创建新 key。
- 使用新 key 完成本地真实转发验证。
