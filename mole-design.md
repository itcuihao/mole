# Mole — 终端环境管理器技术方案

## 项目定位

**环境感知的终端会话管理器**

通过 GUI 管理多套环境配置（env vars），基于配置启动/恢复 tmux 会话。
AI 工具（Claude Code、Codex 等）作为终端内的使用者，工具本身与 AI 无关。

等价于将这类 shell 函数系统化：

```bash
claude_maxx() {
    export ANTHROPIC_BASE_URL="https://maxx.home.xxx"
    export ANTHROPIC_AUTH_TOKEN="sk-1"
    claude "$@"
}
```

变为：Profile 管理 + tmux 会话绑定 + GUI 操作。

---

## 技术栈

| 层次 | 选型 | 理由 |
|------|------|------|
| 桌面框架 | Wails v2 | Go 生态，轻量，跨平台潜力 |
| 后端语言 | Go 1.21+ | 进程管理、文件操作天然合适 |
| 前端 | React + TypeScript + Tailwind | 快速开发配置 UI |
| 数据存储 | JSON 文件 | 轻量，无需数据库 |
| 敏感数据 | macOS Keychain | Token 不明文存文件 |
| tmux 通信 | exec 调用 tmux CLI | 无需额外依赖 |

---

## 系统架构

```
┌─────────────────────────────────────────┐
│           macOS Menu Bar App            │
│                                         │
│  ┌─────────────┐   ┌─────────────────┐  │
│  │  Tray Menu  │   │   Config Window │  │
│  │  (快速操作)  │   │   (Web UI)      │  │
│  └──────┬──────┘   └────────┬────────┘  │
│         │                   │           │
│  ┌──────▼───────────────────▼────────┐  │
│  │          Wails Go Backend         │  │
│  │                                   │  │
│  │  ProfileManager  SessionManager   │  │
│  │  KeychainStore   TerminalLauncher │  │
│  └──────────────────┬────────────────┘  │
│                     │                   │
└─────────────────────┼───────────────────┘
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   ~/.config/    tmux server    Terminal.app
   mole/         (sessions)     / iTerm2
   profiles.json
```

---

## 核心数据模型

```go
// Profile 等价于现在的 claude_maxx() 函数
type Profile struct {
    ID          string            `json:"id"`
    Name        string            `json:"name"`
    Description string            `json:"description"`
    Color       string            `json:"color"`       // 视觉区分
    EnvVars     map[string]string `json:"env_vars"`    // 普通变量
    SecretKeys  []string          `json:"secret_keys"` // 敏感 key 列表，值存 Keychain
    CreatedAt   time.Time         `json:"created_at"`
}

// Session 对应一个 tmux session
type Session struct {
    ID              string    `json:"id"`
    Name            string    `json:"name"`
    ProfileID       string    `json:"profile_id"`
    TmuxSessionName string    `json:"tmux_session_name"`
    CreatedAt       time.Time `json:"created_at"`
}

// 运行时状态（不存储，查询 tmux 获取）
type SessionStatus struct {
    Session
    Attached bool
    Alive    bool
    Windows  int
}
```

---

## 核心模块

### ProfileManager
```
CRUD 操作 profiles.json
├── Create / Update / Delete / List
├── 普通 env var → 直接存 JSON
└── 敏感 env var（含 TOKEN/KEY/SECRET）→ 存 macOS Keychain
```

### SessionManager
```
封装 tmux CLI 操作
├── Create(profile)  → tmux new-session -d -s {name} -e K=V ...
├── List()           → tmux list-sessions（解析输出）
├── Kill(name)       → tmux kill-session -t {name}
└── IsAlive(name)    → 检查 session 是否存在
```

### TerminalLauncher
```
打开系统终端并 attach 到 tmux session
├── 支持 Terminal.app（osascript）
├── 支持 iTerm2（AppleScript）
└── 配置项：偏好终端
```

### Tray Menu（动态生成）
```
● Session A  [profile: maxx]      → attach
● Session B  [profile: agy]       → attach
○ Session C  [profile: local]     → resume（已断开）
──────────────────────────────────
＋ 新建会话
⚙  打开配置
⏻  退出
```

---

## Wails 暴露给前端的 API

```go
// app.go 注册的方法，前端直接调用
func (a *App) ListProfiles() []Profile
func (a *App) SaveProfile(p Profile) error
func (a *App) DeleteProfile(id string) error

func (a *App) CreateSession(profileID, name string) error
func (a *App) ListSessions() []SessionStatus
func (a *App) AttachSession(tmuxName string) error
func (a *App) KillSession(tmuxName string) error
```

---

## 关键技术实现

### tmux session 创建（注入 env）

```bash
tmux new-session -d -s "work-claude" \
  -e ANTHROPIC_BASE_URL="https://maxx.home.xxx" \
  -e ANTHROPIC_AUTH_TOKEN="sk-xxx"
```

### Terminal.app attach（osascript）

```applescript
tell application "Terminal"
  activate
  do script "tmux attach -t work-claude"
end tell
```

### iTerm2 attach

```applescript
tell application "iTerm2"
  create window with default profile
  tell current session of current window
    write text "tmux attach -t work-claude"
  end tell
end tell
```

---

## 文件结构

```
~/.config/mole/
├── profiles.json      # Profile 配置（token 值不在这里）
└── sessions.json      # Session 元数据

# Keychain 条目格式
# Service: "mole", Account: "{profile_id}:{key_name}"
```

---

## 项目目录结构

```
mole/
├── main.go
├── wails.json
├── app.go                  # Wails app 入口，绑定 Go 方法到前端
├── internal/
│   ├── profile/            # Profile CRUD + Keychain
│   ├── session/            # tmux 封装
│   ├── launcher/           # Terminal 启动
│   └── config/             # 配置路径、应用设置
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Sessions.tsx    # 会话列表
│   │   │   └── Profiles.tsx    # Profile 管理
│   │   └── components/
└── build/
    └── darwin/             # macOS 图标、Info.plist
```

---

## MVP 范围

### Phase 1 — 核心可用
- [ ] Profile 增删改查（含 Keychain 存储）
- [ ] 基于 Profile 创建 tmux session
- [ ] 查询所有 session 状态（alive / attached / detached）
- [ ] Tray 菜单展示 session 列表
- [ ] 点击 attach → 打开 Terminal.app

### Phase 2 — 体验完善
- [ ] iTerm2 支持
- [ ] Session 自定义命名
- [ ] Profile 颜色标记
- [ ] 配置导入/导出
- [ ] 连通性测试（ping API endpoint）

### 暂不做
- 跨平台（先 macOS）
- 云同步
- 使用统计

---

## 已知限制与风险

| 问题 | 说明 |
|------|------|
| tmux 依赖 | 用户需自行安装 tmux，否则功能不可用 |
| Keychain 权限 | 首次写入 Keychain 需用户授权 |
| Terminal attach | osascript 在部分 macOS 版本需要辅助功能权限 |
| session 生命周期 | 机器重启后 tmux server 重置，session 全部消失，sessions.json 需同步清理 |
| Wails tray 限制 | Wails v2 tray 不支持动态子菜单更新，session 列表变化需重建整个菜单 |

---

## 与现有工具的关系

| 工具 | 层次 | 关系 |
|------|------|------|
| maxx | 网络层（HTTP 代理） | 互补：某个 Profile 的 BASE_URL 可指向 maxx |
| cc-switch | 配置文件修改 | 不同思路：cc-switch 改配置文件，本工具改 env |
| tmux | 会话管理 | 依赖：本工具是 tmux 的 GUI 前端 |

---

## 前置依赖

用户环境需要：
- macOS 12+
- tmux（`brew install tmux`）
- Terminal.app（系统自带）或 iTerm2

---

## 命名

**Mole** — 鼹鼠

挖隧道（tmux session），在地下活动（终端），管理多个通道。隐喻准确，发音简短好记。
