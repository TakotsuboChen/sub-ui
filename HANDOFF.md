# HANDOFF — 读全文再开始干活

生成时间: 2026-11-26T12:36:45+08:00 · Git HEAD: d3bb4f49b851da8b3e08c8a7d5df8cd6fc7ecd47
信任规则: [V] = 交接时已用命令验证；[?] = 仅记忆未复核，当线索对待；[X] = 已证伪，别用。

## 0. 复核（下一会话先做）
- 锚点: `main` 最近提交 `d3bb4f49b851da8b3e08c8a7d5df8cd6fc7ecd47` 作参考（2026-11-26T12:36:45+08:00；权威以 `git log` 实际输出为准）
- 漂移检查: `git rev-parse HEAD~1` 是否仍 = `d3bb4f49b851da8b3e08c8a7d5df8cd6fc7ecd47`，并用 `git status --porcelain` 与 `git log --oneline -5` 核对
- 待重探的 `[?]`: 5 条（见 §4 与 §5 标记）
- 先读: [CLAUDE.md](CLAUDE.md)、[VERSION](VERSION)、全局记忆 `aliyun-gz-vps-ssh`、项目记忆 `vps-deploy-compose-prod`

## 1. 当前目标
完成侧边栏视口锁定修复与 `references/new-api` 全套动效/外壳/组件 1:1 复刻，并已完成全栈编译及广州生产节点叠加部署验证。

## 2. 已验证状态 — 工作实际停在哪
- **仓库与工作区**：工作切片（`c8e0542`，修复侧边栏视口锁定并复刻 NewAPI 动效与 UI 外壳）与固化产物切片（`d3bb4f4`，更新 [CLAUDE.md](CLAUDE.md#L27) 前端布局/动效规范）均已提交并推送至 `origin/main` [V] `git push → exit 0`。
- **生产部署与线上校验**：已流式叠加 `./sub-ui` 至广州节点镜像（`sha256:5c5da8e215e4894f5849154b271f04c4d8f5c55194abc7dc13d3dd7488caca74`）并重建 `compose.prod.yml`，容器 `Up 1 second` [V]；`http://127.0.0.1:18080/` 返回 `/static/js/index.5939fb0702.js` 与 `/static/css/index.3d7db4caae.css`，`/api/system/public` 返回 `"version":"1.0.0-Alpha-1"` [V] `ssh ... → exit 0`。
- **全栈构建**：`bash scripts/build.sh`（exit 0，`./sub-ui --version` → `sub-ui v1.0.0-Alpha-1`，前端 1.02s 打包）[V]。
- **经验固化去向（不在此复述正文）**：项目 [CLAUDE.md#L27](CLAUDE.md#L27)（提交 `d3bb4f4`，`AGENTS.md` 软链自动同步）[V]。

### 测试/build 输出（本次交接 run 的真实输出，含退出码）
```text
$ go test -count=1 ./... && pnpm --dir web typecheck   (exit 0)
ok  	github.com/TakotsuboChen/sub-ui/internal/api	0.178s
ok  	github.com/TakotsuboChen/sub-ui/internal/rules	0.038s
ok  	github.com/TakotsuboChen/sub-ui/internal/sync	0.060s
> tsc --noEmit (exit 0)
```

## 3. 决策与理由
- **采用 `h-svh overflow-hidden` 锁定视口外壳 [V]**——修复原 `min-h-svh` 被 `<main>` 撑高、导致 `<aside>` 随页面内容无限拉长的 bug；配合 `<aside h-full overflow-y-auto>` 与 `min-h-full` 内部排版，桌面端侧栏与底部余额卡恒贴视口且可独立滚动。否决方案：外层保留 `min-h-svh` 仅加 `sticky`，受 `html { overflow-x: hidden }` 隐式产生滚动上下文与双层 sticky 兼容风险。
- **1:1 复刻 `references/new-api` 动效与壳层体系 [V]**——引入 `motion`（`14.14.0`）实现 `AnimatedPage` 切页入场、`StaggerContainer`/`CardStaggerContainer` 交错入场、弹簧滑块高亮、`AnimatePresence` 抽屉/弹窗；`Layout.tsx` 完整支持 `inset`（默认圆角浮岛工作区）/ `floating` / `sidebar` 与 `icon` / `offcanvas` 收起；`theme-presets.css` 补全 10 套预设与 Semantic Surface Bridge；`ConfigDrawer` 复刻 SVG 预览卡片。

## 4. 失败的尝试 — 不要再试
- `Layout.tsx` 外层使用 `min-h-svh` 未锁定视口高度 → `<aside>` 高度随 `<main>` 内容拉长且底部余额卡片沉底 `[X]`——已于 `c8e0542` 改为 `h-svh flex-col overflow-hidden` + 独立滚动解决 `[V]`。不要改回 `min-h-svh`。
- 仅移植字体令牌而未接入 `motion/react`、外壳变体与 `data-slot` 微交互 → 用户实机指出「没有动效，UI 没有完全复刻 NewAPI」 `[X]`——已于 `c8e0542` 全量复刻补齐 `[V]`。
- 手写 `'Segoe UI'`/`'Microsoft YaHei'` 字体栈 + `0.8125rem` (`13px`) `--text-xs` 覆写 + 全站数字套用 `font-mono` → Windows 实机持续像素字 `[?]`（继承；依赖 `web/index.html` 与 `web/src/styles/`）。不要再硬编码拦截默认 `sans-serif`。
- 仅写 `.dark [data-theme-preset='...']` 后代选择器 → `.dark` 与 `data-theme-preset` 同挂在 `<html>` 时暗色预设不生效 `[V]`——已统一保持 `.dark[data-theme-preset='...'], .dark [data-theme-preset='...']`。
- 首版复杂 `BrandLogo`（方框内 9 图元）→ 小尺寸糊成一团 `[V]`（已核实 `BrandLogo.tsx` 现行无框双棱片路径）。不要再堆砌复杂图元。
- 只查当前项目与全局记忆 → 漏掉跨仓服务器连接线索 `[?]`（继承；本会话直接复用跨项目记忆 `aliyun-gz-vps-ssh` 部署成功 `[V]`）。
- 干等 GitHub Actions 多架构构建 → 耗 ~4 分钟被叫停 `[?]`（继承；本会话实测 `./sub-ui` 流式叠加镜像 ~13–14s 完成 `[V]`）。
- 非特权用户直接写生产 SQLite → `attempt to write a readonly database` `[?]`（继承；依赖 VPS 数据卷属主 `root:root`，操作 DB 前须停容器备份并加 `sudo`）。
- `pnpm --dir web info` → `spawn web EACCES` `[?]`（继承；版本查询改用 `cd web && npm view ...`，本会话 `npm view motion version` 返回 `14.14.0` `[V]`）。

## 5. 已知坑
- **`SeedBuiltinPresets` 仅按 `slug` 缺省插入不覆写 `[V]`**（本会话已实证 `internal/rules/engine.go#L84-L139`）——修改内置预设内容或 `slug` 后存量 SQLite 须停容器备份并清理旧行。
- **Tag `v1.0.0-Alpha-1` 与 GHCR 镜像未与主干最新提交对齐**：本地 `git rev-parse v1.0.0-Alpha-1^{commit}` 仍指向 `3643b03b489a63f59c0fe186c1cdaf7c2d6a214c` `[V]`；远端 GHCR 包权限与 CI Run 状态未核查 `[?]`。
- **线上容器当前为本地叠加层镜像 `[V]`**——VPS 运行基于 `c8e0542` `./sub-ui` 的叠加镜像（`sha256:5c5da8e215...`）；执行 `compose.prod.yml` `pull && up -d` 会恢复为远端 GHCR 旧镜像。

## 6. 下一步（有序）
1. 等待用户对当前已部署的新版 NewAPI 动效与 UI 外壳做浏览器实机验收反馈，若有视觉细节微调再局部迭代。
2. 与用户确认版本与发布策略：是否基于当前主干走 `/release` 对齐 GHCR 镜像并重新打标/发布。
3. 与用户确认下一业务验证项：真实 S-UI 节点端到端联调（流量采集、超额熔断与 `/apiv2/closeSessions` 断流实测）或支付渠道（支付宝当面付 / 微信 Native V3 / 易支付）回调验证。

## 7. 留给用户的开放问题
- 线上新版 NewAPI 风格外壳（`Inset` 浮岛、十套色板、动效滑块、可视化外观抽屉）与侧边栏视口锁定表现是否符合预期？
- 确认 UI 验收通过后，是否需要将 `main` 最新代码走 `/release` 对齐 GHCR 镜像，并推进 S-UI 真实节点或支付通道联调？
