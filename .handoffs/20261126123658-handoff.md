# HANDOFF — 读全文再开始干活

生成时间: 2026-11-26T12:15:00+08:00 · Git HEAD: 1f02674a9faaf3e9f392867fda6c0fa983dfad63
信任规则: [V] = 交接时已用命令验证；[?] = 仅记忆未复核，当线索对待；[X] = 已证伪，别用。

## 0. 复核（下一会话先做）
- 锚点: `main` 最近提交 `1f02674a9faaf3e9f392867fda6c0fa983dfad63` 作参考（2026-11-26T12:15:00+08:00；权威以 `git log` 实际输出为准）
- 漂移检查: `git rev-parse HEAD~1` 是否仍 = `1f02674a9faaf3e9f392867fda6c0fa983dfad63`，并用 `git status --porcelain` 与 `git log --oneline -5` 核对
- 待重探的 `[?]`: 5 条（见 §4 与 §5 标记）
- 先读: [CLAUDE.md](CLAUDE.md)、[VERSION](VERSION)、全局记忆 `clone-references-into-repo` 与 `aliyun-gz-vps-ssh`、项目记忆 `vps-deploy-compose-prod`

## 1. 当前目标
完成 `QuantumNous/new-api` 克隆至本地 `references/new-api`，1:1 复刻其字体与排版体系以消除 Windows “像素字”问题，并在广州生产节点完成镜像叠加部署与用户实机验收（「可以」）。

## 2. 已验证状态 — 工作实际停在哪
- **仓库与工作区**：工作切片（`9b1a26e`、`.gitignore` 排除 `/references/`；`95be821`、前端字体重构）与固化产物切片（`1f02674`、`CLAUDE.md`）均已提交并推送至 `origin/main` [V] `git log --oneline -3 → exit 0`。
- **生产部署与线上校验**：已通过 `./sub-ui` 流式覆盖更新广州节点镜像（`sha256:52792e0ef789cf1e6f2ab3e3c2a418aa1dfc1ab0acadb911e60594fb19f8e08c`）并重建 `compose.prod.yml` 服务，容器状态 `Up 2 seconds` [V]；`curl -sS http://127.0.0.1:18080/` 返回 `<html lang="en">`、`index.7a2baa8a6d.css`、`index.a8a03b93c2.js`，`/api/system/public` 返回 `"version":"1.0.0-Alpha-1"` [V] `ssh ... → exit 0`。
- **全栈构建**：`bash scripts/build.sh`（exit 0，`./sub-ui --version` → `sub-ui v1.0.0-Alpha-1`）[V]。
- **经验固化去向（不在此复述正文）**：全局记忆 `clone-references-into-repo.md` + `MEMORY.md` [V]；项目 [CLAUDE.md](CLAUDE.md#L27)（提交 `1f02674`，通过软链同步 `AGENTS.md`）[V]。

### 测试/build 输出（本次交接 run 的真实输出，含退出码）
```text
$ go test -count=1 -v ./... && pnpm --dir web typecheck   (exit 0)
ok  	github.com/TakotsuboChen/sub-ui/internal/api	0.158s  (TestInviteRegistrationCheckoutAndKeyedSubscription PASS 0.15s)
ok  	github.com/TakotsuboChen/sub-ui/internal/rules	0.037s  (TestRuleOverrideAndClashGeneration PASS 0.03s, TestParseSubconverterINI PASS 0.00s)
ok  	github.com/TakotsuboChen/sub-ui/internal/sync	0.056s  (TestDistributedTrafficSyncQuotaAndReset PASS 0.05s)
> tsc --noEmit (exit 0)
```

## 3. 决策与理由
- **1:1 复刻 `references/new-api` 字体栈与切换轴 [V]**——实证上轮误判了 NewAPI 方案：其 `web/index.html` 固定 `lang="en"`，默认 `Auto`（`data-theme-font="system"`）为纯粹 `sans-serif`（不写 `'Segoe UI'`/`'Microsoft YaHei'` 拦截浏览器默认字体），且开放 `Sans`（`@fontsource-variable/public-sans@^5.3.0`）、`Serif`（`@fontsource-variable/lora@^5.3.0`）与 `simple-large` 切换，同时保留 Tailwind 原生 `default` 偶数尺尺度（去掉 `13px` `--text-xs` 覆写）。否决方案：继续调整手写 `'Segoe UI'`/`'Microsoft YaHei'` 栈，已连续三版在 Windows 实机被否决。
- **数字与表格改用 `tabular-nums` 替换 `font-mono` [V]**——对齐 `new-api` `Table`，消除表格、金额、流量、备注在 Windows 下回退到细硬 `Consolas`/`Courier New` 的像素感。
- **外部参考项目统一落盘 `references/` [V]**——沿用同属系列仓库命名惯例并写死全局记忆 `clone-references-into-repo` 与 `.gitignore`。

## 4. 失败的尝试 — 不要再试
- 手写 `'Segoe UI'`/`'Microsoft YaHei'` 字体栈 + `0.8125rem` (`13px`) `--text-xs` 覆写 + 全站数字套用 `font-mono`（`4f622b8` 等前 3 版）→ Windows 实机持续呈现像素字且被用户否决 `[X]`——已于 `95be821` 按 `references/new-api` 源码实证重构解决 `[V]`。不要再硬编码 `'Segoe UI'`/`'Microsoft YaHei'` 拦截默认 `sans-serif`，也不要写 `13px` 奇数 `--text-xs` 覆写。
- 仅写 `.dark [data-theme-preset='...']` 后代选择器 → 当 `.dark` 与 `data-theme-preset` 同挂在 `<html>` 时暗色预设完全不匹配 `[V]`——已统一兼容 `.dark[data-theme-preset='...'], .dark [data-theme-preset='...']`。
- 首版复杂 `BrandLogo`（方框内 9 图元）→ `16–28px` 小尺寸糊成一团 `[?]`（继承；已改为无框双棱片 `BrandLogo`，依赖 `web/src/components/BrandLogo.tsx`）。不要再做繁复小图元堆叠。
- 只查当前项目与全局记忆 → 漏掉跨仓服务器连接线索 `[V]`——本会话直接按全局规则检索 `~/.claude/projects/*/memory/` 复用 `aliyun-gz-vps-ssh` 解决。
- 干等 GitHub Actions 多架构构建 → 耗 ~4 分钟被用户叫停 `[V]`——日常继续使用本地编译 `./sub-ui` 流式叠加镜像（本会话复验 ~18s `[V]`）。
- 非特权用户直接写生产 SQLite → `attempt to write a readonly database` `[?]`（继承；依赖 VPS 数据卷容器 `root:root` 属主，操作 DB 前须停容器备份并加 `sudo`）。
- `pnpm --dir web info` → `spawn web EACCES` `[?]`（继承；包版本查询改用 `cd web && npm view ...` 本会话实测成功 `[V]`）。

## 5. 已知坑
- **`SeedBuiltinPresets` 仅按 `slug` 缺省插入不覆写 [?]**（继承；依赖 `internal/database` 启动逻辑）——修改内置预设内容或 `slug` 后存量 SQLite 须停容器备份再清理/迁移旧行。
- **Tag `v1.0.0-Alpha-1` 与 GHCR 镜像尚未与本次提交对齐 [?]**（继承 + 新增现状）——`v1.0.0-Alpha-1` Tag 仍指向旧提交 `3643b03`，GHCR 包权限（`read:packages`）与 CI Run 未核对，本会话新推送 `9b1a26e` / `95be821` / `1f02674` 尚未切入 GHCR 镜像。
- **线上容器当前为本地叠加层镜像 [V]**——VPS 运行基于 `95be821` `./sub-ui` 的叠加镜像（`sha256:52792e0ef789...`）；执行 `compose.prod.yml` `pull && up -d` 会恢复为远端 GHCR 旧镜像。

## 6. 下一步（有序）
1. 与用户确认版本与发布策略：当前 `v1.0.0-Alpha-1` 仍指向 `3643b03`，确认是否基于当前主干走 `/release` 对齐 GHCR 镜像并重新发布，或维持现有版本继续业务测试。
2. 与用户确认下一业务验证项：真实 S-UI 节点端到端联调（流量采集、超额熔断与 `/apiv2/closeSessions` 断流实测）或支付网关（支付宝当面付 / 微信 Native V3 / 易支付）回调验证。

## 7. 留给用户的开放问题
- 本次字体重构已线上验收通过，是否需要将 `main` 最新版本重新对齐 GHCR 镜像并走 `/release` 正式发布？
- 下一阶段优先推进真实 S-UI 节点端到端联调，还是支付渠道回调联调？
