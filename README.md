# Pi configuration baseline

A sanitized, non-secret snapshot of our recommended Pi configuration.
This is **not a Pi Package**: do not run `pi install` on this repository.

## Configuration

- `baseline/pi-config-baseline.json`: pinned packages, model/preferences,
  regular terminal mode, compaction policy and runtime-extension requirements.
- `baseline/platforms/`: Linux/WSL and Windows Native tool profiles.
- `scripts/check-config-baseline.mjs`: read-only configuration checker.
- `snapshot.json`: source revision for this exported snapshot.

Recommended Pi version: **1.1.0** (Node >=22.19.0).
Code Mode is enabled in hybrid `on` mode; native tools are directly callable.
See [tool selection and mode rollback](docs/codemode.md). See [upgrade evidence](docs/pi-1.1.0-upgrade.md)
for tested surfaces and unresolved validation; full compatibility is not claimed.
Windows Native uses PowerShell; Linux/WSL uses Bash. Plugin packages are
installed from public npm sources with the baseline's exact versions.

The startup default is Magpie with the final model ID segment `smart-split`.
`defaultModelMatch: "suffix"` allows device-specific prefixes; keep the full
registered local model ID in Pi settings.

Merge the selected platform fragment and `pi` preferences into your own Pi
configuration (resolving the model suffix first), and install the listed
`recommendedPackages`. Do not overwrite existing settings wholesale.
`tuiMode: "regular"` selects the terminal's normal scrollback; the Pi 1.0+ default
is `fullscreen`, which owns the viewport and scrolls the transcript in-window.
A per-session `--tui-mode fullscreen` still overrides it. Configure provider
credentials locally, outside Git.
The summary follows the session's active model; the provider (for example Magpie)
decides the backend, and Pi's native summarization system prompt is what marks the
request as a compaction. The dedicated compaction extension is a device-local
prerequisite: its implementation and credentials are intentionally not distributed
here, and the versioned copy under `baseline/runtime-extensions/` stays outside this
public snapshot, so its `source`/`sha256` fields are omitted below.
Model availability is checked separately.
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
