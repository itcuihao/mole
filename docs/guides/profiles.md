# Profiles 配置指南

Profile 是可复用的环境变量集合。创建 Burrow 时选择一个 Profile，Mole 会把其中的环境变量注入到 tmux 会话中。

## 创建 Profile

![新建 Profile](screenshots/profile-create.png)

1. 进入 **Profiles** 页面，点击 **New Profile**
2. 填写以下字段：

| 字段 | 说明 |
|------|------|
| Name | Profile 名称，选择时会显示 |
| Description | 可选描述 |
| Color | 8 种预设颜色，用于视觉区分 |
| Default Command | 该 Profile 下新建 Burrow 的默认启动命令（如 `claude`） |

3. 添加环境变量（Key-Value 对）

## 环境变量与 Secret 遮罩

![Env Var 编辑](screenshots/profile-env-vars.png)

每个环境变量由 Key 和 Value 组成。勾选 **Secret** 标记后：

- UI 中 Value 显示为遮罩状态（如 `••••••`）
- 实际值仍保存在 `profiles.json` 中，运行时正常注入

> `secret_keys` 仅控制 UI 显示，不影响运行时行为。请避免在本地开发数据中放置真实生产凭据。

![Secret 遮罩效果](screenshots/profile-secret-mask.png)

## Provider 预设模板

![Provider 预设](screenshots/profile-provider-presets.png)

新建 Profile 时可以从内置模板开始，模板会预填对应 Provider 的环境变量 Key 和 Base URL：

| 模板 | 预填内容 | 适用场景 |
|------|---------|---------|
| Claude (Official) | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`（官方）、默认模型名 | 直接使用 Anthropic 官方 API |
| Claude via DeepSeek | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`（DeepSeek 端点） | DeepSeek 兼容端点转发 |
| Claude via GLM | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`（智谱端点） | 智谱 GLM 兼容端点转发 |
| Maxx (Free) | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`（Maxx 端点） | Maxx 免费额度 |
| Custom | 空白 Profile | 自定义配置 |

选择模板后，只需填入自己的 API Key 即可使用。

## 批量导入环境变量

![批量导入](screenshots/profile-bulk-import.png)

点击 **Import** 按钮，支持三种格式一次性导入多个变量：

```bash
# 格式 1: KEY=value
ANTHROPIC_API_KEY=sk-xxx
ANTHROPIC_BASE_URL=https://api.anthropic.com

# 格式 2: export 语句
export DATABASE_URL=postgresql://localhost/app
export REDIS_URL=redis://localhost:6379

# 格式 3: JSON
{"API_BASE_URL": "https://example.com", "TOKEN": "dev-token"}
```

## Default Command 字段

![Default Command](screenshots/profile-default-command.png)

Profile 的 **Default Command** 会作为新建 Burrow 时 Command 模式的默认值。例如设置为 `claude`，则每次用此 Profile 创建 Command Burrow 时自动填入 `claude`。

## Profile 变更自动同步

![变更同步](screenshots/profile-sync.png)

当 Profile 的环境变量被修改时，所有使用该 Profile 的活跃 Burrow 会在 UI 上收到提示，确认后 Mole 自动将新变量值同步到 tmux 会话环境中。