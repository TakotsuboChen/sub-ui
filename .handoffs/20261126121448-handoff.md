# Session Handoff — sub-ui

> **生成时间**: `2026-11-26T00:10:00+08:00` · **Git HEAD**: `ab4e7e1d71ee4d0547e847f8d87f9ccb86b5c821`

## 0. 会话接续协议（新会话必读）

- **代码锚点**：`main @ ab4e7e1d71ee4d0547e847f8d87f9ccb86b5c821`（已提交并推送含 `HANDOFF.md` 的快照后，`HEAD~1` 即对应该锚点）
- **漂移检查**：`git log --oneline -5`、`git diff --stat HEAD~1`（或 `ab4e7e1d71ee4d0547e847f8d87f9ccb86b5c821..HEAD`），核对是否有外部改动
- **待重探的 `[?]`**：`0` 条
- **接续前先读**：[CLAUDE.md](CLAUDE.md)、[VERSION](VERSION)、全局记忆 `aliyun-gz-vps-ssh` 与项目记忆 `vps-deploy-compose-prod`（均在 `~/.claude/projects/*/memory/`）

---

## 1. 当前目标与整体范围

已完成本轮全部四项交付目标并部署验证：

1. **清除预设地域假设**：移除界面表单/占位中的香港、新加坡、广州等预设地域表述；`Node.Region` 默认置空；分流预设 `ai-streaming-hk-sg` 更名为 `ai-streaming`，`acl4ssr-mini` 与预设说明中性化（保留 `acl4ssr-full` 标准 ACL4SSR 分区规则组）与 `README.md` 同步更新（提交 `3e12496`）[V]。
2. **版本统一为 `1.0.0-Alpha-1`**：确立仓库根目录 `VERSION` 为唯一版本真源，经 `//go:embed VERSION`、`internal/api` `/api/system/public` `version` 字段、`web/package.json`、`web/rsbuild.config.ts`（`__APP_VERSION__`）与 `Layout.tsx` 贯通；已打 Annotated Tag `v1.0.0-Alpha-1` 指向 `3643b03` [V]。
3. **对齐 `QuantumNous/new-api` 原生字体栈与极简双棱片 Logo**：卸载全部 `@fontsource-variable/*` Variable 字体包并移除 `html` 上的 `antialiased` / `text-rendering: optimizeLegibility`，改为 OS 原生字体（`Segoe UI` + `Microsoft YaHei` + `Consolas`）与 `html[data-theme-scale]`（`sm`/`default`/`lg`/`xl`）缩放，正文/表格/说明从 `text-xs` 提至 `text-sm`；`BrandLogo.tsx` 与 `web/public/favicon.svg` 重做为无外框双棱片几何标识（提交 `3643b03` → `4f622b8`）[V]。
4. **广州生产节点快速迭代部署**：采用本地编译 `./sub-ui` 后 gzip 流式叠加覆盖至远程镜像的方式完成线上更新，并同步刷新线上 SQLite `rule_presets`（详见记忆 `vps-deploy-compose-prod`）[V]。

---

## 2. 已验证现状（最新一轮实测 `[V]`）

### 测试与构建

- **后端全量测试（`go test -count=1 -v ./...`，exit 0）**：
  - `github.com/TakotsuboChen/sub-ui/internal/api`：`TestInviteRegistrationCheckoutAndKeyedSubscription` PASS (`0.14s`，pkg `0.146s`) [V]
  - `github.com/TakotsuboChen/sub-ui/internal/rules`：`TestRuleOverrideAndClashGeneration` PASS (`0.02s`)、`TestParseSubconverterINI` PASS (`0.00s`)（pkg `0.030s`）[V]
  - `github.com/TakotsuboChen/sub-ui/internal/sync`：`TestDistributedTrafficSyncQuotaAndReset` PASS (`0.03s`，pkg `0.042s`) [V]
- **前端类型检查（`pnpm --dir web typecheck`，exit 0）**：`tsc --noEmit` 零报错通过 [V]
- **全栈单二进制打包（`bash scripts/build.sh` 于 `4f622b8` 后执行）**：
  - `rsbuild build` 输出 `Total: 877.5 kB`（`236.6 kB` gzip）：`dist/favicon.svg`、`dist/index.html`、`dist/static/css/index.e6fc8084ea.css`、`dist/static/js/index.b080f3b967.js`、`dist/static/js/lib-react.463402dae8.js`、`dist/static/js/x.364f729946.js` [V]
  - `./sub-ui --version` → `sub-ui v1.0.0-Alpha-1` [V]

### 线上节点验证（连接方式见记忆 `aliyun-gz-vps-ssh` / `vps-deploy-compose-prod`）

- 容器以本地叠加镜像运行，启动日志 `[sub-ui] v1.0.0-Alpha-1 listening on http://0.0.0.0:8080` [V]
- `/api/system/public` 返回 `"version":"1.0.0-Alpha-1"`、`"siteName":"Sub-UI"`、`"setupRequired":false` [V]
- 首页 HTML 已引用新版资源 `favicon.svg`、`lib-react.463402dae8.js`、`x.364f729946.js`、`index.b080f3b967.js`、`index.e6fc8084ea.css` [V]
- 生产数据库已备份并更新 `rule_presets` 为 `acl4ssr-full`、`ai-streaming`、`acl4ssr-mini`、`minimal-global`（共 4 条）[V]

### 经验固化去向（不在此复述正文）

- `~/.claude/CLAUDE.md`：追加跨项目检索 `~/.claude/projects/*/memory/` 规则 [V]
- [CLAUDE.md](CLAUDE.md)（提交 `ab4e7e1`）：补充版本单真源 `VERSION`、`SeedBuiltinPresets` 仅补缺不覆写行为、对齐 `new-api` 原生字体约束 [V]
- 全局记忆 `aliyun-gz-vps-ssh.md` + 项目记忆 `vps-deploy-compose-prod.md`（均不在 Git 追踪内）[V]

---

## 3. 关键设计决策

- **OS 原生字体栈与 `data-theme-scale`**：弃用无 Hinting 的 Variable `.woff2`，使用 Windows ClearType 友好的 `Segoe UI` + `Microsoft YaHei` + `Consolas` 与 `html[data-theme-scale]` 缩放 [V]
- **极简双棱片 `BrandLogo`**：去除外框与内部多元素堆叠，在 `16px–28px` 小尺寸下保持轮廓清晰 [V]
- **版本单一真源**：根目录 `VERSION` 作为编译期与运行时统一版本来源，升级版本时须联动 `VERSION`、`web/package.json` 及相关 Tag [V]
- **快速叠加部署**：日常联调改用本地编译 `./sub-ui` gzip 流式覆盖 VPS 镜像并重启 Compose 服务，绕开多架构 GitHub Actions CI ~4 分钟等待 [V]

---

## 4. 已踩坑 / 排除路径（勿重复走）

1. **Variable 字体 + `antialiased` 发虚 [V]**：引入 `@fontsource-variable/public-sans` / `inter` + `jetbrains-mono` 并在 `html` 上设置 `antialiased` / `text-rendering: optimizeLegibility`，导致 Windows 屏幕小字锯齿像素化 → 已彻底移除，改回 OS 原生字体栈。
2. **首版复杂 `BrandLogo` 在小尺寸糊成一团 [V]**：方框内塞入 9 个微小图元（点/弧线/节点/箭头）在 `16px–28px` 下无法辨识 → 已重构为无框双棱片 `BrandLogo`。
3. **只查当前项目与全局记忆漏掉跨仓基础设施线索 [V]**：未检索 `~/.claude/projects/*/memory/` 导致漏掉 `ala-mobile-tool` 记忆中的服务器信息 → 已写入全局规则并沉淀至 `aliyun-gz-vps-ssh` 与 `vps-deploy-compose-prod`。
4. **本地迭代等待 GitHub Actions 多架构构建 [V]**：通过 `gh run watch` 等待 CI ~4 分钟被用户叫停 → 改用本地二进制叠加部署流程（约 18s）。
5. **非特权用户直接写生产 SQLite 报错 `attempt to write a readonly database` [V]**：容器以 `root` 写入数据卷 → 操作线上 DB 前必须先停容器、备份后用 `sudo` 执行。
6. **`pnpm --dir web info` 报 `spawn web EACCES` [V]**：包查询应改用 `cd web && npm view ...`。

---

## 5. 已知陷阱

- **`SeedBuiltinPresets` 不更新已存在预设 [V]**：启动时仅按 `slug` 补缺不覆写；后续若修改内置预设名称或规则内容，必须针对存量数据库先备份再清理/迁移旧记录。
- **Tag CI 与 GHCR 包权限待核对 [V]**：`v1.0.0-Alpha-1` Tag 已推送至 `3643b03`，但 `gh api repos/TakotsuboChen/sub-ui/actions/runs` 当时仅返回 `main` push run（`45648581965`、`45650684860`），且当前 `gh` token 缺少 `read:packages` 权限无法直查 GHCR tag 列表。
- **线上容器当前为叠加层镜像 [V]**：VPS 当前运行的是基于 `4f622b8` 本地 `./sub-ui` 打包的叠加镜像；如需与官方多架构 GHCR Digest 对齐，可随时在服务目录执行 `compose.prod.yml` 的 `pull && up -d` 恢复。

---

## 6. 下一步行动

1. 执行第 0 节漂移检查，核对 Git HEAD 与线上服务状态，并与用户确认下一阶段开发方向 [ ]
2. 待选方向：真实 S-UI 节点端到端联调与订阅/流量熔断实测、支付渠道回调验证，或完善字体缩放开关 UI / 走 `/release` 正式发布 `v1.0.0-Alpha-1` [ ]

---

## 7. 待确认开放问题

- 线上是否要从叠加镜像切回 CI 产物、并补充 `read:packages` 校验 GHCR `1.0.0-Alpha-1` 镜像与正式 Release 发布 [?]
- 本轮界面与 `new-api` 原生字体手感在 Windows 实机上的观感是否达标，是否需要在设置页暴露 `data-theme-scale` 切换器 [?]
