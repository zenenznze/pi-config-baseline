# Pi configuration baseline

A sanitized, non-secret snapshot of our recommended Pi configuration.
This is **not a Pi Package**: do not run `pi install` on this repository.

## Configuration

- `baseline/pi-config-baseline.json`: pinned packages, model/preferences,
  compaction policy and runtime-extension requirements.
- `baseline/platforms/`: Linux/WSL and Windows Native tool profiles.
- `scripts/check-config-baseline.mjs`: read-only configuration checker.
- `snapshot.json`: source revision for this exported snapshot.

Recommended Pi version: **0.99.2**. Code Mode is enabled in `only` mode.
Windows Native uses PowerShell; Linux/WSL uses Bash. Plugin packages are
installed from public npm sources with the baseline's exact versions.

Merge the selected platform fragment and `pi` preferences into your own
Pi settings, and install the listed `recommendedPackages`. Do not overwrite
existing settings wholesale. Configure provider credentials locally, outside Git.
The summary model is explicitly pinned to `deepseek/deepseek-v4-flash` (DeepSeek V4 Flash),
not the unversioned `deepseek-flash` ID. A stale local model catalog must not
change this configured identity. Model availability is checked separately.
The dedicated DeepSeek compaction extension is an external prerequisite; its
implementation and credentials are intentionally not distributed here.
This snapshot documents our configuration, not a universal recommendation;
model availability depends on your provider/account.

Check a configured installation:

```sh
node scripts/check-config-baseline.mjs --agent-dir "$HOME/.pi/agent"
# Windows Native: add --platform windows-native and the appropriate agent directory.
```

The checker does not install packages or modify settings. It reads settings,
model metadata and the declared extension source, but not authentication stores.
A successful check applies only to the inspected installation.

## Publication boundary

This repository has independent snapshot history, not the internal Git history.
Only the baseline, platform profiles and reviewed structural checker are exported.
Internal release automation, operational records, release evidence, private
service references, device settings, sessions and credentials are excluded.
Legacy private Git installation sources are omitted; use the public npm sources.
This is not a live mirror: updates require a fresh reviewed export.
See [SECURITY.md](SECURITY.md).
