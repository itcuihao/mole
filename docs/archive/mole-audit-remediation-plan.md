# Mole 全量审计与修复计划（逻辑、UI/UX、功能缺失）

## 文档头信息

| 字段 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 生成日期 | 2026-05-24 |
| 适用分支 | 当前工作分支（含未提交改动） |
| 审计范围 | backend / frontend / workflow / docs |
| 文档目标 | 将审计结论沉淀为可执行工程计划，明确问题、根因、修复、验收 |
| 状态标记规则 | `已完成` / `待完成` |

---

## 执行摘要

1. 项目核心链路已可用（Burrow 创建/打开/重启、Profile/Host/Settings、多终端启动），基础测试与构建通过。
2. 关键风险集中在**一致性与防误操作**：`ImportBurrow` 非事务写入、Profile 删除无引用拦截，属于高优先修复项。
3. Den 分组核心 bug（iTerm2 错误 hinted window 命中导致串窗）已修复，Ghostty 分组参数 `--window-id` 已实现并命名空间化。
4. Windows 双后端（`wsl-tmux` / `powershell`）链路已打通，且 UI 已做 Windows-only 展示约束，不影响 macOS。
5. 中长期重点应转向：导入事务化、删除前依赖分析、SSH 命令安全引用、前端分包与跨终端回归矩阵。

---

## 审计方法与证据

### 已执行验证动作

1. 后端全量测试：`go test ./...`（通过）。
2. 前端构建检查：`npm --prefix frontend run build`（通过）。
3. 关键模块静态审计：
- Session/Terminal 分组与 attach 路径
- Import/Export、Profile/Host 删除路径
- Profile Provider 预设与 frontend template 应用逻辑
- Windows backend 选择与 `backend_id` 传递路径

### 审计局限

1. 未执行真实跨平台手工回归（尤其是 macOS/iTerm2/Ghostty 与 Windows 多终端手动行为比对）。
2. 未执行真实网络与远端 SSH 环境的端到端连通性压力回归。
3. 当前文档对“已完成”判定基于代码静态与本地测试，不等价于所有终端实际行为 100% 覆盖。

---

## 问题总览（总表）

| ID | 等级 | 类型 | 状态 | 影响 | 定位 | 修复摘要 | 验收标准 |
|---|---|---|---|---|---|---|---|
| A-01 | P0 | 逻辑 | 已完成 | Open Burrow 可能切到错误 Den 窗口 | `internal/terminal/launcher_darwin.go:234` | hinted window 命中后增加窗口名二次校验 | 多 Den 并存时不再串窗 |
| A-02 | P1 | 功能/文档一致性 | 已完成 | Ghostty 文档声明分组，但实现缺失 | `internal/terminal/launcher_darwin.go:429` | 增加 `--window-id` 传递与 den->id 规则 | 同 Den 共窗、不同 Den 分窗 |
| A-03 | P1 | 架构/跨平台 | 已完成 | Windows 无法灵活选择 backend | `frontend/src/pages/Sessions.tsx:1966` | 新建/编辑支持 `backend_id`，UI 仅 Windows 显示 | Windows 双后端可切换，macOS 不暴露 |
| A-04 | P2 | 配置正确性 | 已完成 | GLM 模板默认模型名过期 | `internal/provider/presets.go:66` | `glm-4.5` 改为 `glm5.1` | 新建 GLM Profile 默认值正确 |
| B-01 | P0 | 一致性/数据安全 | 已完成 | Import 中途失败导致半导入状态 | `app.go:484` | 已实现快照+失败回滚+阶段化结果字段 | 导入任一步失败可恢复原状态 |
| B-02 | P0 | 逻辑/防误操作 | 已完成 | 删除 Profile 后引用 Session 启动失败 | `app.go:133` | 已实现删除前引用扫描与阻断返回 | 禁止删除被引用 Profile |
| C-01 | P1 | 安全/稳定性 | 已完成 | SSH workspace/identity 含空格会断 | `frontend/src/pages/Sessions.tsx:245` | workspace 与 identity 参数改为安全 shell 引用 | 路径含空格或特殊字符仍可连通 |
| C-02 | P1 | UX/防误操作 | 已完成 | Profile/Host/Group 删除缺二次确认 | `frontend/src/pages/Profiles.tsx:59` | 已统一危险操作确认流并增加导入强确认 | 删除均需显式确认 |
| D-01 | P2 | 性能 | 已完成 | 前端主包偏大（~609KB） | `frontend/src/App.tsx:1` `frontend/vite.config.ts:13` | 已完成页面懒加载 + manualChunks 分包 | 主入口明显降体积，构建无超大单包告警 |
| D-02 | P2 | 文案/可理解性 | 已完成 | 预设值 `[1m]` 含义不透明 | `internal/provider/presets.go:43` | 已在 DeepSeek 预设描述中补充 `[1m]` 语义 | UI 可直接理解该后缀含义 |
| D-03 | P2 | 稳定性/扩展性 | 已完成 | 分组 key 仅清洗规则，仍有碰撞可能 | `internal/terminal/grouping.go:11` | 已改为 `safe-name + short-hash` 并补单测 | 极端 den 名称不会落同一 window-id |

---

## 详细问题闭环（问题 -> 根因 -> 修复方案 -> 验收）

## A 组：已完成项

### A-01 Den 分组串窗（iTerm2 hinted window 误命中）

- 状态：已完成
- 问题：Open Burrow/Focus 过程中，若缓存的 `hintedWindowID` 指向了非当前 Den 窗口，可能错误切到其他 Den。
- 根因定位：
  - `internal/terminal/launcher_darwin.go:234`
  - `internal/terminal/launcher_darwin.go:303`
  - `internal/terminal/launcher_darwin.go:360`
- 最小修复方案（已落地）：
  1. 命中 `hintedWindowID` 后，必须校验 `name of w == windowName`。
  2. 校验失败则忽略该 hint，继续按窗口名查找或新建。
- 加固方案（后续可选）：
  1. 为窗口设置 Mole 专属标识（标题 + 自定义变量双重标识）。
  2. Focus 结果增加 debug telemetry（group、window id、命中策略）。
- 回归点：
  1. 同时存在 3 个 Den，循环 Open 不串组。
  2. 手动改窗口标题后，Mole 仍可正确回退到“查找/新建”。

### A-02 Ghostty 分组参数实装

- 状态：已完成
- 问题：文档声明 Ghostty 通过 `--window-id=mole-<den>` 分组，但实现侧未传该参数。
- 根因定位：
  - 文档：`README.md:72`
  - 旧实现缺口：`internal/terminal/launcher_darwin.go:413`（修前）
- 最小修复方案（已落地）：
  1. macOS Ghostty 启动参数加入 `--window-id`：`internal/terminal/launcher_darwin.go:429`。
  2. Linux Ghostty 同步支持：`internal/terminal/launcher_linux.go:16`。
  3. 统一 den->window-id 生成逻辑：`internal/terminal/grouping.go:7`。
- 加固方案（后续可选）：
  1. 在 window-id 中追加 hash 后缀，减少语义清洗碰撞。
  2. 将 window-id 规则文档化到用户指南（中英文）。
- 回归点：
  1. 同 Den 多次打开落在同一窗口。
  2. 不同 Den 打开到不同窗口。
  3. 包含中文/空格/symbol 的 Den 仍能稳定生成有效 id（见测试）。

### A-03 Windows backend 选择链路（PowerShell + WSL/tmux）

- 状态：已完成
- 问题：Windows 平台缺少可视化 backend 选择，创建/编辑流程不完整。
- 根因定位：
  - V2 请求结构：`internal/session/model.go:93`、`internal/session/model.go:109`
  - 后端解析入口：`internal/session/manager.go:123`
  - 前端 V2 传参：`frontend/src/pages/Sessions.tsx:549`、`frontend/src/pages/Sessions.tsx:587`
  - Windows-only 传值：`frontend/src/pages/Sessions.tsx:1966`、`frontend/src/pages/Sessions.tsx:2855`
  - Windows-only UI：`frontend/src/pages/Sessions.tsx:2958`
- 最小修复方案（已落地）：
  1. 新建/编辑 Burrow 支持选择 `wsl-tmux` / `powershell`。
  2. 仅在 Windows 展示并提交 `backend_id`，其他平台传空。
- 加固方案（后续可选）：
  1. 后端增加非 Windows 强校验：拒绝 `backend_id=powershell`。
  2. 增加 backend 能力探测（是否安装 WSL/tmux）与 UI 提示。
- 回归点：
  1. Windows 下可切换后端并生效。
  2. macOS/Linux 不展示 runtime backend 选项。

### A-04 GLM 模板模型名更新

- 状态：已完成
- 问题：GLM 模板默认值仍为 `glm-4.5`。
- 根因定位：`internal/provider/presets.go:66` `:67` `:69`。
- 最小修复方案（已落地）：改为 `glm5.1`。
- 加固方案（后续可选）：
  1. 提供 provider preset 版本化。
  2. 增加 preset 变更说明与迁移提醒。
- 回归点：新建 GLM Profile 时默认模型值正确。

---

## B 组：高优先待完成（P0）

### B-01 ImportBurrow 非事务写入导致半导入风险

- 状态：已完成（本批）
- 问题：导入链路按顺序写入多个存储，任一步失败可能造成部分数据已写、部分未写。
- 根因定位：
  - `app.go:516` 停止会话
  - `app.go:519` 写 profiles
  - `app.go:522` 写 inventory
  - `app.go:526` 写 plugin configs
  - `app.go:530` 写 sessions
- 最小修复方案（已落地）：
  1. 导入前对 manager 实际存储文件做快照（profiles/inventory/sessions/pluginconfigs）。
  2. 采用“预校验 -> 顺序写入 -> 阶段日志”流程。
  3. 任一步失败时执行回滚恢复，并返回 `success/failed_stage/rollback_*` 结果字段。
- 加固方案：
  1. 增加导入事务日志（导入ID、阶段、耗时、失败点）。
  2. 支持“仅预检查模式（dry-run）”。
- 回归点：
  1. 在每个阶段注入失败，最终状态均可恢复到导入前。
  2. 导入成功后状态一致（四类存储版本匹配）。

### B-02 Profile 删除缺少引用完整性校验

- 状态：已完成（本批）
- 问题：可直接删除被 Session 引用的 Profile，后续 session attach/restart 创建时会失败。
- 根因定位：
  - 删除入口：`app.go:132`
  - 删除实现：`internal/profile/store.go:120`
  - session 强依赖 profile env：`internal/session/manager.go:900`、`internal/session/manager.go:151`
- 最小修复方案（已落地）：
  1. 删除前扫描 session 引用，若存在引用则拒绝删除并返回引用列表（Session ID/名称）。
  2. 前端给出明确引导文案，提示先去 Burrows 改 Profile 再删除。
- 加固方案：
  1. 提供“批量迁移引用后删除”原子操作。
  2. 增加软删除与回收站策略（可恢复）。
- 回归点：
  1. 被引用 Profile 无法直接删除。
  2. 无引用 Profile 可正常删除。

---

## C 组：中优先待完成（P1）

### C-01 SSH command/workspace/identity 引用不安全

- 状态：已完成（本批）
- 问题：路径或 key 文件含空格/特殊字符时，拼接命令可能失败。
- 根因定位：
  - workspace 拼接：`frontend/src/pages/Sessions.tsx:258`
  - identity 直接拼接：`frontend/src/pages/Sessions.tsx:346`、`frontend/src/pages/Sessions.tsx:328`
- 最小修复方案（已落地）：
  1. `cd` workspace 参数统一按安全 shell 规则引用（`~`/`~/` 保留原语义）。
  2. `ssh -i` identity 参数使用按需 shell 引用，避免路径中空格导致断词。
  3. ProxyCommand 递归链路同步使用 identity 安全引用。
- 加固方案：
  1. 统一命令构建器（字符串->结构化 args）。
  2. 增加命令预检查（仅构建不执行）与 debug 展示。
- 回归点：
  1. workspace 包含空格、中文、特殊符号可正常执行。
  2. identity file 路径带空格可正常连接。

### C-02 高危操作确认不足（删除/导入）

- 状态：已完成（本批）
- 问题：Profile/Host/Group 删除与 Burrow 导入缺少强确认门槛。
- 根因定位：
  - Profile 删除：`frontend/src/pages/Profiles.tsx:294`、`frontend/src/pages/Profiles.tsx:112`
  - Host 删除：`frontend/src/pages/Hosts.tsx:979`、`frontend/src/pages/Hosts.tsx:399`
  - Group 删除：`frontend/src/pages/Hosts.tsx:797`、`frontend/src/pages/Hosts.tsx:462`
  - Import 执行按钮：`frontend/src/pages/Settings.tsx:1323`
- 最小修复方案（已落地）：
  1. 统一 `DangerConfirmModal`（对象名 + 影响说明 + 勾选确认），接入 Profile/Host/Group 删除路径。
  2. Import 增加强确认（输入 `IMPORT` 后才允许执行导入）。
- 加固方案：
  1. 导入前自动触发本地导出备份。
  2. 所有高危操作写入审计日志。
- 回归点：
  1. 删除/导入必须显式确认后才可执行。
  2. 取消确认不会产生任何副作用。

---

## D 组：低优先待完成（P2）

### D-01 前端产物偏大（chunk 警告）

- 状态：已完成（本批）
- 问题：主包较大，影响冷启动与低配机器体验。
- 证据：本地构建产物 `index-*.js` 约 609.74kB（gzip 167.08kB）。
- 根因定位：`frontend/vite.config.ts:13` 未配置分包策略。
- 最小修复方案（已落地）：
  1. 页面级懒加载（Sessions/Settings/Hosts/Profiles）与游戏组件延迟加载。
  2. Vite `manualChunks` 拆分 `react/radix/icons/vendor`。
- 加固方案：
  1. 建立性能预算与 CI 体积门禁。
  2. 引入关键路径性能监控指标。
- 回归点：构建产物从单大包拆分为多 chunk，入口体积明显下降。

### D-02 预设文案可理解性不足（`[1m]`）

- 状态：已完成（本批）
- 问题：`deepseek-v4-pro[1m]` 对普通用户语义不清晰。
- 根因定位：`internal/provider/presets.go:49` `:50` `:52`。
- 最小修复方案（已落地）：
  1. 在 DeepSeek 模板描述中增加 `[1m] = 1M 上下文窗口`说明（中英双语）。
- 加固方案：
  1. 拆分“模型名”和“模型参数”配置字段。
  2. 提供 provider 文档链接。
- 回归点：用户在模板描述里可直接理解 `[1m]` 的语义。

### D-03 分组 key 碰撞风险（强化方案）

- 状态：已完成（本批）
- 现状：已实现 `safe-name + short-hash`，并增加碰撞防回归测试：`internal/terminal/grouping.go:11`、`internal/terminal/grouping_test.go:32`。
- 最小修复方案（已落地）：
  1. 改为 `mole-<safe-name>-<short-hash>`。
  2. hash 源使用原始 den（trim 后）。
- 兼容性说明：
  1. 该规则变更后，升级前已存在的 Ghostty 旧 `window-id` 窗口不会被新规则复用，首次打开可能新建一个窗口，后续将稳定复用新规则窗口。
- 加固方案：
  1. 将映射结果持久化，避免同 den 在升级前后漂移。
- 回归点：构造碰撞样本时不会进入同一 window-id（单测覆盖）。

---

## 公共接口与行为影响说明

### Session V2 与 `backend_id`

1. 请求接口已支持：
- `SessionLaunchRequest.backend_id`：`internal/session/model.go:93`
- `SessionUpdateRequest.backend_id`：`internal/session/model.go:109`
2. 解析与路由：`internal/session/manager.go:123`。
3. 前端策略：
- Windows 才展示 runtime backend 选择：`frontend/src/pages/Sessions.tsx:2958`
- 非 Windows 提交空值：`frontend/src/pages/Sessions.tsx:1966`、`frontend/src/pages/Sessions.tsx:2855`

### 终端分组语义

1. iTerm2：`Mole: <den>` 标题匹配 + hintedWindowID 二次校验。
2. Ghostty：`--window-id=mole-<den-derived-id>` 命名空间策略。
3. 兼容性说明：
- 不支持分组的终端保持“每 Burrow 独立窗口”不变。

### 导入/删除 API 行为调整

1. `ImportBurrow` 已升级为事务化语义（快照+失败回滚+阶段结果字段）。
2. `DeleteProfile` 已增加引用拦截（被引用时返回 `PROFILE_IN_USE` 与引用列表）。
3. 兼容建议：
- 通过错误码/错误文案区分“冲突（被引用）”与“系统异常”。

---

## 路线图与里程碑

## Phase 1：稳定性（目标 1-2 周）

- 目标：阻断高风险数据不一致与核心链路失败。
- 工作包：
  1. Import 事务化（快照、回滚、dry-run）。`（已完成本批：快照+回滚）`
  2. Profile 删除引用拦截与迁移提示。`（已完成本批：拦截+前端引导）`
  3. SSH workspace/identity 引用修复。`（已完成本批）`
- 风险：
  1. 回滚实现复杂度较高，需谨慎处理并发写入。
  2. 旧数据兼容处理需补充回归样本。
- DoD：
  1. 注入失败测试可稳定回滚。
  2. 被引用 Profile 无法误删。
  3. 含空格路径 SSH 行为稳定。

## Phase 2：体验（目标 2-4 周）

- 目标：降低误操作与提升可观测性。
- 工作包：
  1. 导入强确认 + 自动导出备份。
  2. 删除统一 DangerConfirmModal。`（已完成本批）`
  3. Open Den 过程可视化（进度、失败重试）。
  4. terminal grouping debug 日志标准化。
- 风险：
  1. UI 交互复杂度上升，需防止操作路径变长。
- DoD：
  1. 所有高危操作均有一致确认门槛。
  2. Open Den 可解释失败原因且可重试。

## Phase 3：扩展（目标 4-8 周）

- 目标：提升性能与平台规模化可维护性。
- 工作包：
  1. 前端分包与性能预算 CI。
  2. 跨终端 E2E 回归矩阵自动化。
  3. 运行健康诊断面板（WSL/tmux/terminal capability）。
- 风险：
  1. 跨平台 CI 成本上升。
- DoD：
  1. 首屏性能指标达标并有持续监控。
  2. 核心终端矩阵回归可自动化执行。

---

## 附录 A：验收清单（按模块）

## Sessions

- [ ] 新建/编辑 Burrow 在 Windows 可选择 backend，macOS/Linux 不展示。
- [ ] Open Burrow 不会跳到错误 Den。
- [ ] Open Den 顺序与 Den 排序一致，失败可读。
- [x] SSH workspace 和 identity 路径含空格可正常。

## Profiles

- [ ] Provider template 应用正确（GLM 为 `glm5.1`）。
- [x] 被 Session 引用的 Profile 不可直接删除。
- [x] 删除操作统一二次确认。

## Hosts

- [ ] Host 删除后 group/跳板引用正确清理。
- [x] Group 删除有二次确认。
- [ ] SSH 命令预览与实际构建一致。

## Settings / Import-Export

- [ ] Import 前强确认，支持自动备份。`（已完成强确认，自动备份待下一步）`
- [x] Import 失败可完整回滚。
- [ ] Export 内容完整、可二次导入。

## Terminal Grouping

- [ ] iTerm2 同 Den 同窗、不同 Den 分窗。
- [ ] Ghostty 同 Den window-id 恒定。
- [ ] 极端 den 名称（空格、中文、符号）行为可预期。

---

## 附录 B：回归用例矩阵

| 平台 | 终端 | 用例编号 | 前置条件 | 操作步骤 | 预期结果 | 失败排查日志点 |
|---|---|---|---|---|---|---|
| macOS | iTerm2 | MAC-ITERM-01 | 已有 Den A/B | 分别 Open A/B 各 3 次 | 不串窗，A/B 稳定隔离 | `launcher_darwin` windowName/hintedWindowID 命中路径 |
| macOS | iTerm2 | MAC-ITERM-02 | A 已打开 | 再次 Open A 某 Burrow | 复用 A 窗口并新增 tab | `focusITerm2GroupedWindow` 返回值与窗口 id |
| macOS | Ghostty | MAC-GHOSTTY-01 | Den A/B | 分别 Open A/B | 命令行含不同 `--window-id` | Ghostty 启动 args 日志 |
| macOS | Warp | MAC-WARP-01 | Burrow 含命令 | Open Burrow | 粘贴提示与执行流程正确 | Warp fallback 与 clipboard logs |
| Windows | PowerShell | WIN-PS-01 | backend=PowerShell | Open Burrow | 原生 shell 正常启动 | backend_id、launch spec 日志 |
| Windows | WSL+tmux | WIN-WSL-01 | backend=WSL/tmux，tmux 已安装 | Open Burrow | 进入 WSL tmux session | `wsl_tmux` create/attach logs |
| Linux | Ghostty | LNX-GHOSTTY-01 | Den A/B | Open A/B | 通过 window-id 分组 | `launcher_linux` args 构建日志 |
| 全平台 | 全终端 | SAFE-DEL-01 | 有引用对象 | 尝试删除 Profile/Host/Group | 触发确认或拦截逻辑 | 前端 confirm + 后端引用检查日志 |
| 全平台 | N/A | IMPORT-01 | 准备非法 payload | 执行导入 | 失败且状态回滚 | Import 事务阶段日志 |
| 全平台 | N/A | IMPORT-02 | 准备合法 payload | 导入后重启应用 | 配置一致，Session 可恢复 | profiles/inventory/sessions 快照对比 |

---

## 术语与范围约束

1. Burrow：会话工作单元（Session 实体）。
2. Den：终端分组维度（iTerm2 窗口/Ghostty window-id）。
3. Profile：环境变量配置模板。
4. `backend_id`：Session runtime backend 标识（如 `wsl-tmux` / `powershell`）。

本计划文档仅定义“审计结果与执行方案”，不代表本次已完成全部代码修复；除 A 组已完成项外，其余均需按路线图实施。
