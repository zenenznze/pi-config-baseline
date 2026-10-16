# Pi 1.1.0 upgrade — partial compatibility evidence

Audit date: 2026-10-10. Previous recommendation: 0.99.2.
Target and isolated tested runtime: 1.1.0, Linux, Node 24.18.0.
The initial isolated audit did not modify the active installation. Following
explicit user approval, the local Linux installation was upgraded and its
configuration/resource checks passed; see the local upgrade conclusion below.
Full workflow compatibility is **not yet verified**. Existing baseline
lastVerified (2026-10-01) remains unchanged; it is not evidence for this upgrade.

## Authoritative sources

- [GitHub stable release](https://github.com/earendil-works/pi/releases/tag/v1.1.0)
- [npm Registry](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent/latest)
- [Full intervening changelog](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/CHANGELOG.md)
- Versioned official docs: [settings](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/settings.md),
  [codemode](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/codemode.md),
  [MCP](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/mcp.md),
  [extensions](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/extensions.md),
  [compaction](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/docs/compaction.md).

GitHub Releases and Registry both returned stable 1.1.0. Releases 1.0.0,
1.0.1, 1.0.2, 1.0.3, 1.0.4 and 1.1.0 were reviewed in the published changelog.
No prerelease or main build was installed. Pi npm integrity:
`sha512-SeEi/4hdcHNgA9UWlefZl7ZZpm3dzi2OoxNjDHsBJ9o298LNOtbL4DGKgitlEj6uCTccvtw6f2hlCkTPVJ2RXg==`.

## Plugin matrix

Registry latest metadata, public GitHub repository existence, peer constraints,
installed npm source and real SDK resource registrations were inspected.
Registration success is not authenticated integration or UI execution success.

| Package | Previous | Target/latest | Result |
| --- | --- | --- | --- |
| pi-skill-palette | 2.2.0 | 2.2.0 | unchanged; /skill registration |
| pi-auto-compact | 1.2.3 | 1.3.1 | upgraded; registration and mocked actual handlers |
| @leo_aifirst/pi-accounts | 1.0.0 | 1.0.0 | unchanged; /accounts registration |
| @leo_aifirst/pi-usage | 1.0.0 | 1.0.0 | unchanged; /usage, /fast, /accounts-usage registration |
| @specode/pi-subscription-image | 1.1.1 | 1.1.1 | unchanged; commands and image tool registration |
| pi-session-search | 1.6.0 | 1.6.0 | unchanged; commands, tools and session-history skill |
| Dedicated DeepSeek extension | external/unversioned | same external source | loaded read-only; mocked summary, token cap, signal and fallback |

Public sources: [palette](https://github.com/nicobailon/pi-skill-palette),
[Auto Compact](https://github.com/Chasen-Liao/pi-auto-compact),
[accounts](https://github.com/zenenznze/pi-accounts),
[usage](https://github.com/zenenznze/pi-usage),
[image](https://github.com/specode/pi-subscription-image),
[search](https://github.com/samfoy/pi-session-search).
Auto Compact 1.3.1 npm gitHead is
`96aaef869ef43d375082712933bf7fccf54d45c9`; it is provenance, not an npm version.
Accounts/Usage npm versions, integrity and source refs remain unchanged.
Their dependency declarations permit Pi 1.1.0; permissive peer ranges alone
are not compatibility proof. DeepSeek source has no immutable distribution pin,
so reproducing that external prerequisite remains a limitation.

## Minimal migration

The following records the upgrade-time configuration. The current Code Mode
recommendation is hybrid `on`; see [tool selection and rollback](codemode.md).
The mode-only change received static checks, with no new functional or performance
validation; the historical upgrade results below remain unchanged.

- Retain native QuickJS, `codemode.mode=only`, dynamic MCP discovery, explicit
  platform tool lists, provider/model/thinking/light-theme preferences.
- Preserve 78%, DeepSeek V4 Flash and max summary 8192, built-in enabled,
  reserve 16384 and keep recent 20000. Auto Compact 1.3.1 adds optional alignment:
  explicitly keep `alignPiThreshold=false` to avoid changing model budgets.
  *(Superseded 2026-10-14: with the 1M smart-split window Pi's own reserve put the
  mid-run trigger at 98.36%, so alignment is on and the summary model follows the
  active session model; see [过程文档/20261014-compaction-via-magpie.md](../过程文档/20261014-compaction-via-magpie.md).)*
  Its preflight runs only for idle input; tool_call is status-only, concurrent
  inputs share one compaction, hard failure blocks input, soft already-compacted
  failure continues. Pi's native threshold/overflow safety net remains enabled.
- Pi 1.0 defaults to fullscreen, which owns the viewport and bypasses the
  terminal's normal scrollback. The baseline now declares `pi.tuiMode = "regular"`
  as an explicit user preference, superseding the earlier "do not overwrite an
  existing `tuiMode`" caution; the platform fragments themselves still impose no
  TUI preference. A per-session `--tui-mode fullscreen` still overrides it.
- Await searchTools/describeTool/describeNamespace. Use `"name" in tools`,
  not typeof on an absent tool member. Built-in objects are frozen.
- 1.0.3 renamed Azure provider to azure; not used by baseline defaults.
  Provider-only CLI selection now requires --model.
- MCP OAuth now keys credentials by server name and URL; do not copy credential
  stores. 1.0 fixes deferred-tool resume/reload restoration; 1.0.4 fixes closing
  connecting transports. 1.1 fixes OAuth cancellation/deadlines/shutdown and
  manager responsiveness. These are upstream changes, not locally tested OAuth.
- 1.0.4 read-image blocks can feed image(); image output is persisted to private
  temporary files. New native image-model API does not replace the subscription
  plugin. No quota was consumed.

## Executed validation

Isolated npm installation used the versions in the matrix. No real OAuth store,
session history, MCP service or paid model was used.

Two validation commands (repository task limit):
```sh
node scripts/verify-upgrade.mjs <isolated-prefix> <external-dedicated-extension>
node scripts/verify-upgrade.mjs <isolated-prefix> <external-dedicated-extension>
```

Both exited 1; the task is **partial**, not a passing overall regression gate.

First run: checker fixture regression, CLI version/help and most QuickJS assertions
passed; image forwarding failed because the tiny PNG fixture was invalid.
Replaced the fixture with a generated valid PNG, keeping image assertions intact.

Second run passed:
- checker Linux/WSL/Windows configuration fixtures; missing identity reports
  UNVERIFIED, old runtime and installed plugin mismatch fail;
- Linux CLI version/help, real QuickJS async discovery, Promise.all tool composition,
  filtering, exception recovery output, timeout, frozen built-ins, missing-member
  error and read-image forwarding;
- six packages loaded, expected commands/tools/skill registered;
- actual Auto Compact npm handlers under Mock: concurrent deduplication,
  steering exclusion, hard/soft failures, no compaction from tool_call;
- actual external DeepSeek hook with mocked model registry: correct provider/model,
  maxTokens 8192, forwarded AbortSignal, summary boundary and fallback.

Second run failed MCP discovery: direct codemode.execute bypassed the Agent's
tool_call readiness hook, so background tools were not present yet. Source review
identified that hook as the discovery wait boundary. Runner now explicitly emits
it before direct execution, preserving assertions. **This correction has not been
rerun**: the two-command task limit is exhausted.

Not reached / UNVERIFIED: Mock MCP call, timeout, reconnect, resource reload,
close behavior; full resume/CLI reload lifecycle; long-session end-to-end compaction
and cancellation; account switching/usage requests/image generation; Windows and
WSL runtime/PowerShell; visual TUI. No complete compatibility claim is justified.
Run the corrected reusable script in a subsequent authorized validation task.

## 本机升级与最终结论（2026-10-10）

用户明确授权将本机配置升级到目标版本，要求先提醒 reload，再进行检测；
随后要求留下结论，并明确真实 MCP 留待实际使用时再验证。本阶段不再追加检测。

### 实际安装

- 本机升级前 Pi 为 **1.0.0**，不是基线原先记录的 0.99.2。
- 在原有系统 npm 安装前缀执行：
  `sudo -n npm install --global --prefix /usr --ignore-scripts --no-audit --no-fund @earendil-works/pi-coding-agent@1.1.0`。
- 执行 `PI_OFFLINE=1 pi install npm:pi-auto-compact@1.3.1`，
  从 1.2.3 升级至 1.3.1；其他推荐插件版本不变。
- 修改前已在用户 Pi 配置目录下建立私有配置备份；备份未进入 Git。
- Auto Compact 保留 threshold 78，新增显式 alignPiThreshold false。
  保留 Code Mode only、默认 openai-codex/gpt-6.1-sol、low 思考级别、
  light 主题及既有 DeepSeek V4 Flash 扩展。未修改账号凭据或模型来源。
- 安装结束已提醒用户 /reload，并说明核心更新通常还需重启进程；
  用户随后要求继续检测。没有强制关闭或重启其 Pi 进程。

### 升级后实际检测

以本机用户 Pi agent 目录作为 AGENT_DIR，以当前基线仓库作为 BASELINE_DIR，
以系统安装的 Pi 包目录作为 PI_ROOT，执行：

```sh
node scripts/check-config-baseline.mjs --agent-dir "$AGENT_DIR" --pi-root "$PI_ROOT" --platform linux --json
PI_OFFLINE=1 node "$PI_SKILL_DIR/scripts/pi-runtime-check.mjs" --agent-dir "$AGENT_DIR" --baseline-dir "$BASELINE_DIR"
```

两条命令均退出 **0**。同时 CLI 回读为 **1.1.0**，Node 为 **24.18.0**。

- 配置检查 issues 为空；Pi 目标版本、Node 要求及六个推荐插件的实际
  安装版本均 PASS，默认配置和 Linux 工具配置匹配基线。
- Auto Compact 实际配置为 threshold 78、alignPiThreshold false；
  DeepSeek 扩展满足既有模型标识检查。
- 资源检查输出 `Pi runtime resources: OK`，无扩展加载错误，
  预期 Accounts、Usage/accounts-usage、Auto Compact、Palette、
  Session Search 和生图插件命令/工具/技能均注册成功。
- 配置检查 coverage 仍为 PARTIAL：它不把源代码字符串检查当作扩展行为验证，
  也未验证视觉 TUI 行为。新 CLI 的版本不能证明已打开进程完成核心替换。

**结论：本机 Pi 1.1.0 安装及配置/扩展资源层面的升级验收通过，
用户接受本阶段结果。** 这不等于隔离回归脚本已全绿，也不等于全部功能
完成端到端验证。真实 MCP 按用户决定留待实际使用时观察；账号切换、
认证请求、生图、真实长会话压缩与 Windows/WSL 运行时均未在本阶段验证。
未调用付费模型、未进行生图、未访问真实 MCP OAuth 凭据。
本机检测结果不改变先前失败测试的记录，也不自动授权公开发布或全设备同步。

## Checker and reproducibility

Checker remains read-only. `--pi-root` checks package identity and exact target.
Exact installed npm versions are inspected under the supplied agent directory's
npm/node_modules; absent installation evidence is UNVERIFIED, not PASS.
Configuration source pins do not prove installed bytes or authenticated behavior.
Coverage is PARTIAL when evidence is absent. It warns about TUI default migration
and rejects legacy Azure defaults and an Auto Compact alignment that differs from
the baseline (alignment is on since 2026-10-14).

The baseline is not a Pi package: never add a root package.json or install it.
For future validation, use a fresh ignored prefix, install exact versions with
`npm install --prefix <prefix> --save-exact --ignore-scripts --no-audit --no-fund`
followed by the Pi package and six package pins from the matrix. Retain the
generated lockfile for the validation environment; npm top-level pins do not pin
all transitive dependencies. No plugin sources are copied into this repository.

## Publication and rollback

The internal configuration source and existing allowlisted snapshot exporter
were found. Export README now derives the version from the baseline; upgrade
evidence is allowlisted. Snapshot sourceRevision must be generated only after the
source commit exists. Public history must remain independent; never push internal
history to GitHub. Public publication is withheld while the regression gate fails.

Rollback baseline through a new `git revert <upgrade-commit>`, not reset or force
push. Restore the previous exact Pi 0.99.2 / Auto Compact 1.2.3 in an isolated
environment first, then explicitly apply to devices if needed. For this local
installation, the actual prior runtime was Pi **1.0.0**: reinstall that exact
version at the original system npm prefix, reinstall Auto Compact **1.2.3** through
Pi, and restore only the task-owned settings/Auto Compact changes from the private
backup. Reload extensions and restart Pi when appropriate; do not overwrite later
unrelated changes. Keep credentials and unrelated settings intact.
