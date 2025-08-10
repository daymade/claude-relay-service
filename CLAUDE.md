# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

这个文件为 Claude Code (claude.ai/code) 提供在此代码库中工作的指导。

## 项目概述

Claude Relay Service 是一个功能完整的 AI API 中转服务，支持 Claude、Gemini、Claude Console 和 AWS Bedrock 多平台。提供多账户管理、API Key 认证、代理配置和现代化 Web 管理界面。该服务作为客户端（如 SillyTavern、Claude Code、Gemini CLI、Cherry Studio）与 AI API 之间的中间件，提供认证、限流、监控等功能。

## 核心架构

### 关键架构概念
- **代理认证流**: 客户端用自建API Key → 验证 → 获取Claude账户OAuth token → 转发到Anthropic
- **Token管理**: 自动监控OAuth token过期并刷新，支持10秒提前刷新策略
- **代理支持**: 每个Claude账户支持独立代理配置，OAuth token交换也通过代理进行
- **数据加密**: 敏感数据（refreshToken, accessToken）使用AES加密存储在Redis

### 主要服务组件
- **claudeRelayService.js**: 核心代理服务，处理请求转发和流式响应
- **claudeAccountService.js**: Claude账户管理，OAuth token刷新和账户选择
- **geminiAccountService.js**: Gemini账户管理，Google OAuth token刷新和账户选择
- **claudeConsoleAccountService.js**: Claude Console账户管理
- **bedrockAccountService.js**: AWS Bedrock账户管理和认证
- **apiKeyService.js**: API Key管理，验证、限流和使用统计
- **unifiedClaudeScheduler.js**: 智能Claude账户调度，支持专用绑定、会话保持和优先级
- **unifiedGeminiScheduler.js**: 智能Gemini账户调度
- **openaiToClaude.js**: OpenAI格式转换层，提供兼容性支持
- **oauthHelper.js**: OAuth工具，PKCE流程实现和代理支持

### 认证和代理流程
1. 客户端使用自建API Key（cr_前缀格式）发送请求
2. authenticateApiKey中间件验证API Key有效性和速率限制
3. 统一调度器（unifiedScheduler）根据以下优先级选择账户：
   - 专用绑定账户（dedicatedBinding）
   - 账户组绑定（groupBinding）
   - 会话保持映射（sessionHash sticky session）
   - 共享账户池（按优先级排序）
4. 检查OAuth access token有效性，过期则自动刷新（使用代理）
5. 移除客户端API Key，使用OAuth Bearer token转发请求
6. 通过账户配置的代理发送到Anthropic API
7. 流式或非流式返回响应，记录使用统计

### OAuth集成
- **PKCE流程**: 完整的OAuth 2.0 PKCE实现，支持代理
- **自动刷新**: 智能token过期检测和自动刷新机制
- **代理支持**: OAuth授权和token交换全程支持代理配置
- **安全存储**: claudeAiOauth数据加密存储，包含accessToken、refreshToken、scopes

## 常用命令

### 基本开发命令
```bash
# 安装依赖和初始化
npm install
npm run setup                  # 生成配置和管理员凭据
npm run install:web           # 安装Web界面依赖
npm run build:web             # 构建Web界面

# 开发和运行
npm run dev                   # 开发模式（热重载）
npm start                     # 生产模式
npm test                      # 运行测试（注意：测试文件需要补充）
npm run lint                  # ESLint代码检查

# Docker部署
docker-compose up -d          # 推荐方式
docker-compose --profile monitoring up -d  # 包含监控
docker pull weishaw/claude-relay-service:latest  # 使用官方镜像

# 服务管理（使用PM2-like管理脚本）
npm run service:start:daemon  # 后台启动（推荐）
npm run service:status        # 查看服务状态
npm run service:logs          # 查看日志
npm run service:logs:follow   # 实时跟踪日志
npm run service:restart:daemon # 后台重启
npm run service:stop          # 停止服务

# CLI管理工具
npm run cli admin             # 管理员操作
npm run cli keys              # API Key管理
npm run cli accounts          # Claude账户管理
npm run cli status            # 系统状态

# 数据迁移和维护
npm run migrate:apikey-expiry # 迁移API Key过期时间
npm run data:export           # 导出数据
npm run data:import           # 导入数据
npm run update:pricing        # 更新模型定价
```
### 开发环境配置
必须配置的环境变量：
- `JWT_SECRET`: JWT密钥（32字符以上随机字符串）
- `ENCRYPTION_KEY`: 数据加密密钥（32字符固定长度）
- `REDIS_HOST`: Redis主机地址（默认localhost）
- `REDIS_PORT`: Redis端口（默认6379）
- `REDIS_PASSWORD`: Redis密码（可选）

初始化命令：
```bash
cp config/config.example.js config/config.js
cp .env.example .env
npm run setup  # 自动生成密钥并创建管理员账户
```

## Web界面功能

### OAuth账户添加流程
1. **基本信息和代理设置**: 配置账户名称、描述和代理参数
2. **OAuth授权**: 
   - 生成授权URL → 用户打开链接并登录Claude Code账号
   - 授权后会显示Authorization Code → 复制并粘贴到输入框
   - 系统自动交换token并创建账户

### 核心管理功能
- **实时仪表板**: 系统统计、账户状态、使用量监控
- **API Key管理**: 创建、配额设置、使用统计查看
- **Claude账户管理**: OAuth账户添加、代理配置、状态监控
- **系统日志**: 实时日志查看，多级别过滤

## 重要端点

### API转发端点
- `POST /api/v1/messages` - 主要消息处理端点（支持流式）
- `POST /claude/v1/messages` - Claude标准格式端点
- `POST /openai/claude/v1/messages` - OpenAI兼容格式端点
- `POST /gemini/*` - Gemini API端点
- `GET /api/v1/models` - 模型列表（兼容性）
- `GET /api/v1/usage` - 使用统计查询
- `GET /api/v1/key-info` - API Key信息

### OAuth管理端点
- `POST /admin/claude-accounts/generate-auth-url` - 生成OAuth授权URL（含代理）
- `POST /admin/claude-accounts/exchange-code` - 交换authorization code
- `POST /admin/claude-accounts` - 创建OAuth账户
- `POST /admin/gemini-accounts` - 创建Gemini账户

### 系统端点
- `GET /health` - 健康检查
- `GET /web` - Web管理界面
- `GET /admin/dashboard` - 系统概览数据
- `GET /admin/logs` - 系统日志查看

## 故障排除

### OAuth相关问题
1. **代理配置错误**: 检查代理设置是否正确，OAuth token交换也需要代理
2. **授权码无效**: 确保复制了完整的Authorization Code，没有遗漏字符
3. **Token刷新失败**: 检查refreshToken有效性和代理配置

### Gemini Token刷新问题
1. **刷新失败**: 确保 refresh_token 有效且未过期
2. **错误日志**: 查看 `logs/token-refresh-error.log` 获取详细错误信息
3. **测试脚本**: 运行 `node scripts/test-gemini-refresh.js` 测试 token 刷新

### 常见开发问题
1. **Redis连接失败**: 确认Redis服务运行，检查连接配置
2. **管理员登录失败**: 检查init.json同步到Redis，运行npm run setup
3. **API Key格式错误**: 确保使用cr_前缀格式
4. **代理连接问题**: 验证SOCKS5/HTTP代理配置和认证信息

### 调试工具
- **日志系统**: Winston结构化日志，支持不同级别
- **CLI工具**: 命令行状态查看和管理
- **Web界面**: 实时日志查看和系统监控
- **健康检查**: /health端点提供系统状态

## 开发最佳实践

### 代码格式化要求
- **必须使用 Prettier 格式化所有代码**
- 后端代码（src/）：运行 `npx prettier --write <file>` 格式化
- 前端代码（web/admin-spa/）：已安装 `prettier-plugin-tailwindcss`，运行 `npx prettier --write <file>` 格式化
- 提交前检查格式：`npx prettier --check <file>`
- 格式化所有文件：`npm run format`（如果配置了此脚本）

### 代码修改原则
- 对现有文件进行修改时，首先检查代码库的现有模式和风格
- 尽可能重用现有的服务和工具函数，避免重复代码
- 遵循项目现有的错误处理和日志记录模式
- 敏感数据必须使用加密存储（参考 claudeAccountService.js 中的加密实现）

### 测试和质量保证
- 运行 `npm run lint` 进行代码风格检查（使用 ESLint）
- 运行 `npm test` 执行测试套件（Jest + SuperTest 配置）
- 在修改核心服务后，使用 CLI 工具验证功能：`npm run cli status`
- 检查日志文件 `logs/claude-relay-*.log` 确认服务正常运行
- 注意：当前项目缺少实际测试文件，建议补充单元测试和集成测试

### 代码风格规范
- 使用单引号字符串
- 语句末尾必须有分号
- 使用 ES2022 语法特性
- 未使用的变量参数使用 `_` 前缀标记
- 遵循 ESLint 推荐规则

### 开发工作流
- **功能开发**: 始终从理解现有代码开始，重用已有的服务和模式
- **调试流程**: 使用 Winston 日志 + Web 界面实时日志查看 + CLI 状态工具
- **代码审查**: 关注安全性（加密存储）、性能（异步处理）、错误处理
- **部署前检查**: 运行 lint → 测试 CLI 功能 → 检查日志 → Docker 构建

### 常见文件位置
- 核心服务逻辑：`src/services/` 目录
- 路由处理：`src/routes/` 目录 
- 中间件：`src/middleware/` 目录
- 配置管理：`config/config.js`
- Redis 模型：`src/models/redis.js`
- 工具函数：`src/utils/` 目录

### 重要架构决策
- 所有敏感数据（OAuth token、refreshToken）都使用 AES 加密存储在 Redis
- 每个 Claude 账户支持独立的代理配置，包括 SOCKS5 和 HTTP 代理
- API Key 使用哈希存储，支持 `cr_` 前缀格式
- 请求流程：API Key 验证 → 账户选择 → Token 刷新（如需）→ 请求转发
- 支持流式和非流式响应，客户端断开时自动清理资源

### 核心数据流和性能优化
- **哈希映射优化**: API Key 验证从 O(n) 优化到 O(1) 查找
- **智能 Usage 捕获**: 从 SSE 流中解析真实的 token 使用数据
- **多维度统计**: 支持按时间、模型、用户的实时使用统计
- **异步处理**: 非阻塞的统计记录和日志写入
- **原子操作**: Redis 管道操作确保数据一致性

### 安全和容错机制
- **多层加密**: API Key 哈希 + OAuth Token AES 加密
- **零信任验证**: 每个请求都需要完整的认证链
- **优雅降级**: Redis 连接失败时的回退机制
- **自动重试**: 指数退避重试策略和错误隔离
- **资源清理**: 客户端断开时的自动清理机制

## 项目特定注意事项

### Redis 数据结构
- **API Keys**: `api_key:{id}` (详细信息) + `api_key_hash:{hash}` (快速查找)
- **Claude 账户**: `claude_account:{id}` (加密的 OAuth 数据)
- **Gemini 账户**: `gemini_account:{id}` (加密的 OAuth 数据)
- **账户组**: `account_group:{id}` (账户组配置)
- **管理员**: `admin:{id}` + `admin_username:{username}` (用户名映射)
- **会话**: `session:{token}` (JWT 会话管理)
- **使用统计**: `usage:daily:{date}:{key}:{model}` (多维度统计)
- **系统信息**: `system_info` (系统状态缓存)
- **会话映射**: `session_account_mapping:{sessionHash}` (会话保持)

### 流式响应处理
- 支持 SSE (Server-Sent Events) 流式传输
- 自动从流中解析 usage 数据并记录
- 客户端断开时通过 AbortController 清理资源
- 错误时发送适当的 SSE 错误事件

### CLI 工具使用示例
```bash
# 创建新的 API Key
npm run cli keys create -- --name "MyApp" --limit 1000

# 查看系统状态
npm run cli status

# 管理 Claude 账户
npm run cli accounts list
npm run cli accounts refresh <accountId>

# 管理员操作
npm run cli admin create -- --username admin2
npm run cli admin reset-password -- --username admin
```
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.## 测试相关注意事项
## 测试相关注意事项

### 测试文件缺失
当前项目配置了 Jest 测试框架但缺少实际的测试文件。在添加新功能时，建议：
- 在对应服务文件同目录创建 `*.test.js` 文件
- 使用 SuperTest 进行 API 端点测试
- 模拟 Redis 操作避免测试依赖真实数据库

### 测试单个功能示例
```bash
# 测试 Gemini token 刷新
node scripts/test-gemini-refresh.js

# 测试 API 响应
node scripts/test-api-response.js

# 测试账户调度
node scripts/test-group-scheduling.js
```

## 性能优化建议

### 请求处理优化
- 使用 AbortController 管理长连接
- 实施连接池复用 HTTPS agents
- 避免在请求路径中进行同步操作
- 利用 Redis 管道减少网络往返

### 账户调度优化
- 优先使用专用绑定减少调度开销
- 合理设置账户优先级分散负载
- 监控账户使用率避免热点
- 定期清理过期的会话映射