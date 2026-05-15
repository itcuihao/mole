<p align="center">
  <img src="build/appicon.png" alt="mole logo" width="128" height="128">
</p>

<h1 align="center">Mole</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  面向 Profiles、Hosts 和命令启动流程的终端工作区管理工具
</p>

<p align="center">
  9 种运行模式 · iTerm2/Ghostty 窗口分组 · 可复用环境配置 · SSH 主机库存
</p>

## 功能概览

- **Burrows** — 9 种运行模式启动终端会话（Shell / SSH / Command / Codex / Docker / K8s / Conda / SSH Config / Tmux） → [配置指南](docs/guides/burrows.md)
- **Dens** — 同组 Burrow 共享终端窗口（iTerm2 Tab / Ghostty Window） → [配置指南](docs/guides/dens.md)
- **Profiles** — 可复用环境配置 + Provider 预设模板（Claude / DeepSeek / GLM / Maxx） → [配置指南](docs/guides/profiles.md)
- **Hosts** — SSH 主机库存、分组、堡垒机/JumpHost → [配置指南](docs/guides/hosts.md)

其他：System Tray 快捷菜单、Burrow Export/Import、Profile 变更自动同步、中英双语、主题切换

## 平台支持

### 运行时 backend

- macOS：本地 `tmux`
- Linux：本地 `tmux`
- Windows：`WSL + tmux`

### 终端检测

- macOS：Terminal.app、iTerm2、Ghostty、Rio、Warp、Alacritty、Kitty
- Linux：Ghostty、Kitty、Alacritty、Rio、GNOME Terminal、Konsole、xterm
- Windows：PowerShell、Command Prompt

### 当前状态

- macOS 仍然是目前最成熟、验证最充分的路径
- Linux 已经具备平台化的终端检测和启动逻辑，但还需要更多真实机器验证
- Windows 当前假设系统中已安装 WSL，且默认 WSL 发行版内已安装 `tmux`。这条路径已经落地，但验证深度还不如 macOS

## 存储模型说明

Mole 会把应用数据以 JSON 文件形式保存在 `~/.config/mole/` 下：

- `profiles.json`
- `sessions.json`
- `hosts.json`
- `settings.json`

`secret_keys` 只决定 UI 是否做掩码显示，真实值仍然保存在 `profiles.json` 里。所以本地开发数据里最好不要直接放生产环境凭据。

## 技术栈

- Backend：Go + Wails v2
- Frontend：React 19 + TypeScript + Vite
- UI：Tailwind CSS v4 + Radix primitives
- Runtime backend：macOS/Linux 使用本地 `tmux`，Windows 使用 `WSL + tmux`

## 安装

### Homebrew（macOS）

现在可以直接把当前仓库当作自定义 tap 来安装：

```bash
brew tap itcuihao/mole https://github.com/itcuihao/mole.git
brew install --cask itcuihao/mole/mole
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

这两个包装脚本目前仍然更偏向 macOS 开发流程。在 Linux 或 Windows 上，暂时更建议使用下面的手动命令。

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
- Windows：需要系统可调用 `wsl.exe`，并且默认 WSL 发行版中已安装 `tmux`

示例：

```bash
# macOS
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# WSL（进入 Linux shell 后执行）
sudo apt install tmux
```

## 使用流程

1. 在 `Profiles` 页面创建一个 Profile。
2. 如果需要 SSH 目标，可以先在 `Hosts` 页面保存 Host 和 Group。
3. 在 `Workspaces` 页面用 `Shell`、`SSH Host` 或 `Command` 模式创建工作区。
4. 在线工作区使用 `Open Workspace`，离线但已保存的工作区使用 `Restore Workspace`。

Mole 会把工作区元数据和真实运行时 backend 分开存储。所以即使 backend 进程暂时没了，保存过的工作区依然会留在 UI 中，并且可以通过 `Restore Workspace` 按原配置重建。

## 一键启动 VS Code + Claude（macOS / Windows）

仓库内置了两份脚本模板，适合给非技术用户做“一键启动”：

- `scripts/vscode-claude/start_vscode_claude_mac.sh`
- `scripts/vscode-claude/start_vscode_claude_win.ps1`

### 1) 配置 Profile 环境变量

脚本的配置由 Mole 自动传入：

- **工作目录**：来自 Burrow 的 `workspace` 字段（`MOLE_WORKSPACE` 环境变量）
- **环境变量**：来自 Profile 的 env vars（如 `ANTHROPIC_API_KEY`）

在 Mole Profile 中添加以下环境变量（Settings > Profiles）：

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

## 仓库说明

- 早期规划资料保存在 `docs/archive/mole-design-legacy.md`
- `frontend/wailsjs/` 下的 Wails bindings 是生成文件
- 运行时 session 元数据里目前仍保留 `tmux_session_name` 字段做兼容，但内部会话操作已经改为按 `session id` 路由

## License

MIT
