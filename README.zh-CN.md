<p align="center">
  <img src="docs/appicon.png" alt="mole logo" width="128" height="128">
</p>

<h1 align="center">Mole</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  面向 Profiles、Hosts 和命令启动流程的终端工作区管理工具
</p>

<p align="center">
  7 种运行模式 · iTerm2/Ghostty 窗口分组 · 可复用环境配置 · SSH 主机库存
</p>

<p align="center">
  <img src="docs/hero.png" alt="Mole 截图" width="720">
</p>

## 功能概览

- **Burrows** — 7 种运行模式启动终端会话（Shell / SSH / Command / Codex / Docker / K8s / Tmux） → [配置指南](docs/guides/burrows.md)
- **Dens** — 同组 Burrow 共享终端窗口（iTerm2 Tab / Ghostty Window） → [配置指南](docs/guides/dens.md)
- **Profiles** — 可复用环境配置 + Provider 预设模板（Claude / DeepSeek / GLM / Maxx） → [配置指南](docs/guides/profiles.md)
- **Hosts** — SSH 主机库存、分组、堡垒机/JumpHost → [配置指南](docs/guides/hosts.md)

其他：System Tray 快捷菜单、Burrow Export/Import、Profile 变更自动同步、中英双语、主题切换

## 平台支持

### 运行时 backend

| 平台 | Backend |
|------|---------|
| macOS | `tmux`（本地） |
| Linux | `tmux`（本地） |
| Windows | `WSL + tmux`（默认）· `PowerShell`（原生，无需 WSL/tmux） |

Windows 上每个 Burrow 可以选择运行时 backend：

- **WSL + tmux** — 在 WSL 内通过 tmux 运行会话。需要 `wsl.exe`、一个 WSL 发行版，以及发行版内安装的 `tmux`。
- **PowerShell（原生）** — 直接在 PowerShell 中运行会话，无需 WSL 或 tmux。会话在内存中运行，打开独立控制台窗口。

### 终端检测

| 终端 | macOS | Linux | Windows |
|------|:-----:|:-----:|:-------:|
| Terminal.app | Yes | | |
| iTerm2 | Yes | | |
| Ghostty | Yes | Yes | |
| Warp | Yes | Yes | |
| Alacritty | Yes | Yes | |
| Kitty | Yes | Yes | |
| Rio | Yes | Yes | |
| WezTerm | | Yes | |
| GNOME Terminal | | Yes | |
| Konsole | | Yes | |
| xterm | | Yes | |
| Tilix | | Yes | |
| Terminator | | Yes | |
| Foot | | Yes | |
| PowerShell 7 (pwsh) | | | Yes |
| PowerShell (Windows PowerShell) | | | Yes |
| CMD | | | Yes |

### Den 分组支持

- **iTerm2**：基于 AppleScript 的窗口/Tab 管理 — 查找或创建名为 `Mole: <den>` 的窗口，同 Den 会话添加到同一窗口的 Tab，支持聚焦和关闭
- **Ghostty**：通过 `--window-id=mole-<den>` 实现窗口分组
- 其他终端：每个会话独立窗口

### Clipboard 回退

对于无法通过程序接受命令的终端（Warp、部分通用终端），Mole 会将命令复制到剪贴板并打开空白终端。

### 当前状态

- macOS 仍然是目前最成熟、验证最充分的路径。
- Linux 已经具备平台化的终端检测和启动逻辑，但还需要更多真实机器验证。
- Windows 支持两种运行时 backend：**WSL + tmux**（默认，需要 WSL + tmux 环境）和 **PowerShell**（原生，开箱即用无额外依赖）。两条路径均已实现，但验证深度不如 macOS。

## 存储模型

Mole 会把应用数据以 JSON 文件形式保存在 `~/.config/mole/` 下：

| 文件 | 内容 |
|------|------|
| `profiles.json` | Profile 定义，包含环境变量和 secret 标记 |
| `sessions.json` | 会话定义（运行模式、插件引用、Den、使用记录） |
| `hosts.json` | 主机库存（主机、分组、默认值） |
| `settings.json` | 设置（默认终端） |
| `codex_configs.json` | Codex 配置定义 |
| `docker_configs.json` | Docker 配置定义 |
| `plugin_configs.json` | 插件预设定义（K8s Pod、Tmux Attach、Remote Tmux） |
| `script_configs.json` | 脚本预设定义（内置 VS Code + Claude 脚本、用户脚本） |
| `ai/codex/<id>/` | 独立的 Codex home 目录（config.toml、auth.json） |

`secret_keys` 只决定 UI 是否做掩码显示，真实值仍然保存在 `profiles.json` 里。所以本地开发数据里最好不要直接放生产环境凭据。

## 技术栈

- Backend：Go + Wails v2
- Frontend：React 19 + TypeScript + Vite
- UI：Tailwind CSS v4 + Radix primitives
- Runtime backend：macOS/Linux 使用本地 `tmux`，Windows 使用 `WSL + tmux` 或 `PowerShell`
- System tray：`fyne.io/systray`（macOS，需要 CGO）

## 安装

### Homebrew（macOS）

```bash
brew tap itcuihao/mole https://github.com/itcuihao/mole.git
brew install --cask itcuihao/mole/mole
```

安装后更新：

```bash
brew update
brew upgrade --cask mole
```

Mole 运行时依赖 `tmux`。如果系统里还没有：

```bash
brew install tmux
```

## 开发

### 快速开始

```bash
./scripts/run.sh
./scripts/build.sh
```

### 手动命令

```bash
cd frontend && npm install
wails dev
wails build
```

### 验证命令

```bash
go test ./...
cd frontend && npx tsc --noEmit
```

### 运行前置条件

- macOS：需要安装 `tmux`，并确保它在 `PATH` 中可用
- Linux：需要安装 `tmux`，并确保它在 `PATH` 中可用
- Windows（WSL + tmux backend）：
  - 需要系统可调用 `wsl.exe`
  - 需要至少初始化一个 WSL 发行版
  - 默认 WSL 发行版中需要已安装 `tmux`
- Windows（PowerShell backend）：
  - 无额外依赖 — 使用系统内置 PowerShell 或 PowerShell 7 即可

```bash
# macOS
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# WSL（进入 Linux shell 后执行）
sudo apt install tmux
```

如果还没有初始化发行版：

```bash
wsl --install -d Ubuntu
```

## 使用流程

1. 在 **Profiles** 页面创建一个 Profile。
2. 如果需要 SSH 目标，可以先在 **Hosts** 页面保存 Host 和 Group。
3. 在 **Burrows** 页面用 Shell、SSH Host 或 Command 模式创建 Burrow，可选分配 Den。
4. 在线 Burrow 使用 **Open**，离线但已保存的 Burrow 使用 **Restore**。

Mole 会把 Burrow 元数据和真实运行时 backend 分开存储。所以即使 backend 进程暂时没了，保存过的 Burrow 依然会留在 UI 中，并且可以通过 **Restore** 按原配置重建。

## 一键启动 VS Code + Claude（macOS / Windows / WSL）

内置脚本预设位于 **Settings > Scripts**（首次运行时自动创建）。也可以使用仓库中的独立脚本：

- `scripts/vscode-claude/start_vscode_claude_mac.sh` — macOS
- `scripts/vscode-claude/start_vscode_claude_win.ps1` — Windows（PowerShell backend）
- `scripts/vscode-claude/start_vscode_claude_wsl.sh` — Windows（WSL + tmux backend）

### 1) 配置 Profile 环境变量

脚本的配置由 Mole 自动传入：

- **工作目录**：来自 Burrow 的 `workspace` 字段（`MOLE_WORKSPACE` 环境变量）
- **环境变量**：来自 Profile 的 env vars（如 `ANTHROPIC_API_KEY`）

在 Mole Profile 中添加以下环境变量：

- `ANTHROPIC_API_KEY`（必填）
- `ANTHROPIC_BASE_URL`（可选）

脚本会自动：

- 使用 `MOLE_WORKSPACE` 作为项目目录（未设置时回退到 `$HOME`）
- 确保项目下有 `.claude/` 目录
- 打开 VS Code 并进入项目目录

### 2) 在 Mole 里配置 Burrow 命令

新建 Burrow，选择本地运行，命令填写：

- macOS:
  `bash /绝对路径/mole/scripts/vscode-claude/start_vscode_claude_mac.sh`
- Windows:
  `powershell -ExecutionPolicy Bypass -File \"D:\\绝对路径\\mole\\scripts\\vscode-claude\\start_vscode_claude_win.ps1\"`

之后用户只需要点击一次 Open/Restart。

## 支持的变量导入格式

```bash
KEY=value
export DATABASE_URL=postgresql://localhost/app
{"API_BASE_URL": "https://example.com", "TOKEN": "dev-token"}
```

## Release

GitHub Actions 会在推送 `v*` tag 时自动构建并发布 Release。当前产物包括：

- macOS ZIP（arm64 + amd64）
- Windows ZIP（amd64）
- 对应 SHA256 校验文件

```bash
./scripts/release.sh --version v0.1.3
```

## 仓库说明

- 早期规划资料保存在 `docs/archive/mole-design-legacy.md`
- `frontend/wailsjs/` 下的 Wails bindings 是生成文件
- 运行时 session 元数据里目前仍保留 `tmux_session_name` 字段做兼容，但内部会话操作已经改为按 `session id` 路由

## License

MIT
