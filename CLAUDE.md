# Sub-UI

## Cross-session handoff

- On session start: read [HANDOFF.md](HANDOFF.md) fully, then summarize the previous session's goal, current state, and next step before proceeding.

## 项目定位

Go + React 19 + TypeScript + Rsbuild + Tailwind CSS 4 单二进制控制面板，负责多节点 S-UI（`/apiv2`）聚合订阅下发、分布式流量配额熔断、ACL 分层规则编译与多渠道自助支付。用户代理流量直连边缘 S-UI 节点，不经过控制面。

## 常用命令

- **全栈单二进制构建**：`bash scripts/build.sh`（Windows 用 `pwsh -File scripts/build.ps1`）。该脚本先构建 `web/`，再把 `web/dist/*` 同步至 `webdist/dist/`，最后以 `CGO_ENABLED=0` 编译 `./sub-ui`。仅执行 `go build` 不会更新内嵌前端。
- **前端校验与构建**：`pnpm --dir web typecheck`（`tsc --noEmit`）、`pnpm --dir web build`。
- **前后端联调**：后端执行 `SUBUI_LOG_LEVEL=debug go run .`（默认监听 `:8080`），前端执行 `pnpm --dir web dev`（端口 `3000`，`web/rsbuild.config.ts` 将 `/api` 与 `/s` 代理至 `SUBUI_DEV_API`，默认 `http://127.0.0.1:8080`）。
- **后端全量测试**：`go test -v ./...`（各测试使用 `t.TempDir()` SQLite 与 `httptest` mock，不依赖外部节点或 PostgreSQL）。

## 架构与核心约定

- **单二进制与内嵌 SPA**：`webdist/embed.go` 通过 `//go:embed all:dist` 嵌入 `webdist/dist/`；非 `/api/*`、`/s/*` 请求由 `internal/api/server.go` 回退到 `index.html`。即使清空构建产物，也必须保留 `webdist/dist/.gitkeep`，否则 Go 编译失败。
- **数据库与纯 Go 构建**：`internal/database/database.go` 默认使用纯 Go 驱动 `github.com/glebarez/sqlite`（WAL 模式、`busy_timeout(5000)`、`SetMaxOpenConns(1)`），构建保持 `CGO_ENABLED=0`，不要引入依赖 CGO 的数据库驱动。
- **配置与密钥**：环境变量以 `SUBUI_*` 为前缀（见 `.env.example` 与 `internal/config/config.go`）。`SUBUI_JWT_SECRET` 为空时，首次启动会随机生成并持久化在 `settings` 表的 `jwt_secret` 键中；认证同时接受 `Authorization: Bearer` 与 `subui_token` Cookie。
- **S-UI 流量采集与单用户重置**：`internal/sync/engine.go` 按 `SUBUI_SYNC_INTERVAL`（最小 5s，默认 30s）轮询启用的 `sui` 节点，依据 `UserNodeBinding.last_raw_up` / `last_raw_down` 计算增量并乘以节点 `traffic_multiplier`；超额或到期时下发 `enable: false` 并调用 `/apiv2/closeSessions` 断流。重置单用户当期流量时，向 `/apiv2/save`（`edit`）传 `up: 0, down: 0` 触发 S-UI 仅对该客户端滚存 `totalUp/totalDown`。
- **分层规则编译**：`internal/rules/engine.go` 的规则优先级固定为：用户 `prepend` → 全局管理员 `prepend` → 预设 `StaticRules` → 预设 `RuleSets` → 用户/全局 `append` → 尾随 `GEOIP`/`FINAL`。全局管理员覆写以 `user_id = 0` 存储在 `user_rule_overrides` 表中，不要将该哨兵记录当作普通用户删除。
- **支付幂等核销**：`internal/payment/payment.go` 的 `FulfillOrder` 在数据库事务中以 `status = 'pending'` 条件更新防重入，并触发节点 `ProvisionUserToNodes`；新增或修改支付回调须维持该幂等边界。
- **前端界面约定**：页面路由通过 `web/src/App.tsx` 的 `PageKey` 状态切换（未引入 `react-router`）；TypeScript 严格开启 `noUnusedLocals` 与 `noUnusedParameters`；样式统一使用 `web/src/styles/theme.css` 定义的 OKLCH 语义令牌以兼容多主题预设与明暗切换。

## 协作与提交约束

- 不要提交 `/sub-ui`、`web/dist/`、`webdist/dist/*`（保留 `.gitkeep`）、`.env` 及 `*.db*` 等构建与本地状态文件。
- 改动后端逻辑后运行 `go test ./...`，改动前端后运行 `pnpm --dir web typecheck`；涉及静态资源或发布流程变更时运行 `bash scripts/build.sh` 验证完整打包。
