# Code Mode 混合模式

当前推荐 `codemode.mode = "on"`，并在 `defaultTools` 中同时保留原生工具和 `codemode`。`on` 保留原生工具的直接声明与调用能力；Code Mode 仍能通过 `tools.<name>()` 调用它们。模式切换不改变 QuickJS、多工具编排、并行调用、MCP 按需发现、结果过滤、`store/load` 或 `models` API 的能力。

平台片段见 `baseline/platforms/`：Linux、macOS 与 WSL 使用 Bash（Linux/WSL 片段）；Windows Native 使用 PowerShell（Windows 片段）。只合并相应片段，保留其他配置。

推荐的工具选择原则：

- 简单读取、修改、写入：优先直接调用 `read`、`edit`、`write`；搜索和导航可直接调用 `grep`、`find`、`ls`。
- 简单 Shell 命令：直接调用所在平台的 `bash` 或 `powershell`。
- 多个独立工具需要并行执行：优先考虑 Code Mode 的 `Promise.allSettled()`，检查各项结果；有依赖的调用按顺序 `await`。
- 大型日志、JSON 或批量结果：用 Code Mode 程序化过滤，只输出下一步需要的证据。
- 多 MCP 工具复杂协作：用 Code Mode 编排，并通过 `searchTools`、`describeTool`、`describeNamespace` 按需发现。既有 MCP exposure 保持原值；`on` 不会将所有 MCP 工具永久直接声明。
- 不为使用 Code Mode 而使用 Code Mode，不增加自动路由系统。

修改实际 agent directory 的 `settings.json` 后执行 `/reload`。已有会话历史无需迁移；已发送的模型请求不会追溯更新。项目 `.pi/settings.json`、CLI 工具选择和扩展动态工具选择仍有自己的优先级，须保留本来需要的原生工具。尚未 reload 的进程可能继续采用旧模式。

模式切换只进行配置语法、字段一致性、引用和差异静态检查，不进行性能测试、A/B、基准或功能回归测试。后续真实使用由用户判断。历史升级文档中的 `only` 是当时的证据；当前推荐以本页和机器可读基线为准。

如需恢复 `only`，将实际 agent directory 的 `settings.json` 中 `codemode.mode` 改为 `"only"`，并同步修改 `baseline/pi-config-baseline.json` 的 `toolConfiguration.codemode.mode`、两个平台片段及检查器的推荐值约束、工具投影断言和相关说明，然后 `/reload`。回退只改模式，不恢复整个旧配置备份，避免覆盖后续无关修改。
