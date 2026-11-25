# HANDOFF — 读全文再开始干活

生成时间: 2026-11-25T23:22:45+08:00 · Git HEAD: d736cec4bcd9341145c4f235b73d37253c9372a6
信任规则: [V] = 交接时已用命令验证；[?] = 仅记忆未复核，当线索对待；[X] = 已证伪，别用。

## 0. 复核（下一会话先做）
- 锚点: main @ d736cec4bcd9341145c4f235b73d37253c9372a6 (2026-11-25T23:22:45+08:00)
- 漂移检查: `git rev-parse HEAD~1` 是否仍 = `d736cec4bcd9341145c4f235b73d37253c9372a6`——HEAD 必是本次 handoff 提交，其 parent 才是文档记录的 SHA；不一致以 `git log` 实际输出为准
- 待重探的 [?]: 0 条
- 先读: `CLAUDE.md`、`README.md`

## 1. 当前目标
完成项目 `CLAUDE.md`（含跨会话交接入口）初始化并打通 Claude Code / Antigravity 双 CLI 同步挂载，当前初始化目标已完成，仓库处于干净待命状态。

## 2. 已验证状态 — 工作实际停在哪
- `CLAUDE.md` 已写入（31 行、3,928 字节）并提交推送至 `origin/main`（最近提交为 `d736cec` 作参考） [V] `wc -lc CLAUDE.md && git push` → 退出码 0 → `748bfa9..d736cec main -> main`
- 双端规则同步已挂载：`AGENTS.md -> CLAUDE.md` 本地软链已创建，且 `/AGENTS.md` 已写入 `.git/info/exclude` 不污染 Git 跟踪 [V] `dual-cli-sync mount-project --exclude-git . && ls -la AGENTS.md CLAUDE.md` → 退出码 0 → `[mount] sub-ui: AGENTS.md -> CLAUDE.md (3928B)`
- 后端单元/集成测试与前端类型检查全量通过 [V] `go test -v ./... && pnpm --dir web typecheck` → 退出码 0 → `internal/api`、`internal/rules`、`internal/sync` 全部 PASS，`tsc --noEmit` 无报错
- 工作区: 写本文件前 `git status --short --branch -uall` 输出 `## main...origin/main`（干净）；本文件随独立 handoff 提交收口

### 测试/build 输出（本次交接 run 的真实输出，含退出码）
```
=== RUN   TestInviteRegistrationCheckoutAndKeyedSubscription
--- PASS: TestInviteRegistrationCheckoutAndKeyedSubscription (0.14s)
PASS
ok  	github.com/TakotsuboChen/sub-ui/internal/api	0.149s
=== RUN   TestRuleOverrideAndClashGeneration
--- PASS: TestRuleOverrideAndClashGeneration (0.02s)
=== RUN   TestParseSubconverterINI
--- PASS: TestParseSubconverterINI (0.00s)
PASS
ok  	github.com/TakotsuboChen/sub-ui/internal/rules	0.027s
=== RUN   TestDistributedTrafficSyncQuotaAndReset
--- PASS: TestDistributedTrafficSyncQuotaAndReset (0.03s)
PASS
ok  	github.com/TakotsuboChen/sub-ui/internal/sync	0.037s

> sub-ui-web@1.0.0 typecheck /home/takotsubo/projects/sub-ui/web
> tsc --noEmit
(exit code 0)
```

## 3. 决策与理由
- 将 `CLAUDE.md` 精简在 31 行（`<200` 行 / `<22 KB`），仅沉淀读代码不易察觉的构建、数据库、S-UI 滚存、规则哨兵记录与支付幂等约束 [V]——避免上下文膨胀和稀释遵循度；否决方案：将全量目录树与 API 列表写入 `CLAUDE.md`，易过时且浪费 token。
- 使用 `dual-cli-sync mount-project --exclude-git .` 维护 `AGENTS.md -> CLAUDE.md` 本地软链 [V]——同时满足 Claude Code 与 Antigravity CLI 读取入口且仅在 Git 中维护单文件真源；否决方案：仓库同时提交 `CLAUDE.md` 与 `AGENTS.md` 实体副本，易造成双真源漂移。

## 4. 失败的尝试 — 不要再试
- 本会话无失败尝试（首次建置交接记录，无历史失败条目可搬运）。

## 5. 已知坑
- 暂无未解决的代码或构建阻塞；项目固有踩坑点（`webdist/dist/.gitkeep` 嵌入约束、`CGO_ENABLED=0` 纯 Go SQLite、`user_id = 0` 全局规则哨兵等）已固化至 `CLAUDE.md`，不再在此重复。

## 6. 下一步（有序）
1. 运行 `git status --short --branch -uall` 与 `git log --oneline -5` 核对 `HEAD~1` 锚点是否无漂移。
2. 与用户确认下一阶段具体目标（功能开发、问题排查或全栈打包/部署验证）。

## 7. 留给用户的开放问题
- 下一会话希望优先推进哪个模块或任务（如新增后端/前端测试、全栈二进制 `bash scripts/build.sh` 验证、Docker 部署调试或新功能开发）？
