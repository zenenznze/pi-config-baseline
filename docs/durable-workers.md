# Persistent Pi workers

This baseline keeps **Pi CLI 1.1.0** and installs **pi-durable-subagents
1.0.42** as an independent package. It does not replace the CLI, change
terminals, import existing sessions, or install the experimental Durable Host.
The orchestrator and recovery engine are upstream implementations; this
repository supplies configuration, a worker role and deployment glue.

## Install and activate

This channel is declared separately in `durableWorkers`, outside the universal
`recommendedPackages`: Windows Native must not install an unsupported POSIX
worker as part of an otherwise valid baseline.

Requirements: Linux with a working systemd user manager, Node >=22.19, Pi 1.1.0,
and Pi's existing working provider configuration. The baseline uses Magpie's
configured full model ID; it does not pin a device-specific model prefix.

```sh
pi install npm:pi-durable-subagents@1.0.42
node scripts/durable-worker-setup.mjs --plan
node scripts/durable-worker-setup.mjs --apply
```

The plan prints only paths and non-secret settings. Apply refuses pre-existing
managed files instead of overwriting them. It installs the `durable-worker`
role in the Pi agent directory, merges `onQuit: continue` and
`writerLock: queue` into the orchestrator configuration, and preserves other
settings. It gives Magpie two worker slots only when no limit already exists.
It installs upstream's `pi-durable-subagents.service` and `.timer`, with a
small drop-in for the Pi agent directory, private permissions and startup order.
A stable CLI wrapper is installed in `~/.local/bin`; the service points directly
at the installed package, never at an npx cache or a temporary worktree.

User lingering must be `yes` **before apply**, because a login-only service
cannot meet unattended boot recovery. A platform administrator can enable it
with `loginctl enable-linger <user>`. The current Linux deployment already
has it enabled; the installer does not change login policy.

The timer runs `start` one second after the user manager starts and every
30 seconds thereafter. `start` restores pending work; it never undoes a user's
drain, stop or open question. The orchestrator owns a kernel flock and runs in
its own systemd scope where supported. Starter failure is retried by the timer;
idle orchestrators exit on their own. This is periodic recovery, not a custom
always-running process supervisor or an application-level heartbeat watchdog.

In a VM/container, the outer host must also start the guest/container and mount
its persistent storage. A systemd unit inside an instance cannot start that
instance. Verify the active managed instance record, not an obsolete legacy
record. The current LightOS deployment's active instance has auto-start enabled
and its system component uses `unless-stopped`; those settings were inspected,
not rewritten. No machine or instance was rebooted for this rollout.

Existing interactive Pi processes retain their loaded extensions. New Pi
sessions load `subagents` and `/subagents`; a deliberate `/reload` also loads
them at a safe boundary. The independent CLI and starter are immediately usable
without reloading or restarting another working Agent.

## Submit a task with a stable identity

Use the `durable-worker` role for repository work: it appends its instructions,
keeps project context and skills, and explicitly includes Code Mode. The
upstream generic `worker` role replaces the system prompt and has a narrower
tool list. Neither role inherits the parent transcript automatically. From the
tool, `context: "fork"` deliberately snapshots the parent branch; CLI submissions
have no origin branch and cannot use it. Forking is a new worker session, not
an in-place migration or takeover of the old main Agent.

Save a task specification in the owning project's private task directory,
with its original task text, full working directory, requested scope and
acceptance criteria:

```json
{
  "agent": "durable-worker",
  "cwd": "/absolute/path/to/project",
  "task": "Read the task instructions, complete the authorized change, verify the result, and report the evidence. Preserve concurrent edits. Do not publish or deploy.",
  "once": true,
  "writer": true,
  "isolation": "none"
}
```

```sh
pi-durable-subagents run --request project-task-001 --spec ./task.json --json
pi-durable-subagents describe --key project-task-001 --json
pi-durable-subagents status
pi-durable-subagents events --all
pi-durable-subagents tail <workflow-id>
```

Inside Pi, the equivalent is `subagents({request: "project-task-001",
agent: "durable-worker", task: "...", cwd: "/absolute/path/to/project",
once: true, writer: true})`. Save the returned workflow ID and request ID.
Keep original spec bytes and directory. Exit 75 means pending: retry with the
same ID and content, never invent a second ID to resolve a timeout. The same
ID with other content is a conflict (exit 3), including after pruning. Follow-ups,
answers and stops should also use stable request IDs. CLI submissions launched
from a Pi tool can associate themselves with that session through `DSA_SESSION`;
association affects display, not ownership or recovery.

Split substantial work into deterministic workflow steps using upstream
`chain` or workflow scripts (`runs.run(key, spec)`). Completed calls are returned
from the journal after recovery. Within an interrupted call, the worker
continues its original JSONL session; this is not arbitrary instruction-level
checkpointing. Workflows/scripts/agents are pinned and changes are detected.

## What is protected

| Work | Terminal closes | Orchestrator/process restarts | System/instance boots without any terminal |
| --- | --- | --- | --- |
| Ordinary existing Pi main session | Depends on its terminal process | History remains; no automatic main-task execution recovery | **Not automatically resumed** |
| Explicit durable worker | Continues with `onQuit: continue` | Same task and worker session; finished workflow calls are reused | Starter recovers pending work after instance and user manager start |
| Finished calls in a durable workflow | Remain in journal | Not dispatched again | Available when workflow resumes |
| An unfinished CLI Code Mode script | Worker survives outside parent | Whole top-level call can be interrupted; nested calls have no durable replay ledger | Same limitation; use `once: true` if any nested operation has effects |
| Shell `&`, `nohup`, render/download/helper started by a worker | May run while its execution lives | Upstream fences the execution's processes on recovery | Process memory is gone; not a durable job |
| An external job with its own service and stable job ID | Independent of Pi | Query its existing job ID before any retry | Depends on that service's boot and checkpoint policy |

Writer locks serialize cooperating durable calls per Git worktree (or directory
outside Git). Explicit `writer: true` also protects calls that write through bash
or Code Mode. Locks do not constrain a human editor, an existing main Agent or
another application. Do not submit a worker into a worktree actively owned by
another writer. Use a dedicated directory/worktree when needed and follow the
project's cleanup policy. No existing task is automatically adopted.

## External effects and unknown outcomes

Request deduplication is not exactly-once delivery to the outside world. A
remote API may finish just before the result is saved locally. A completed
native tool result that reached the session is normally retained; the gap
between external success and local persistence cannot be eliminated by resume.

For effectful calls, submit **`once: true`**. If recovery finds an unfinished
tool, upstream seals that call as `unknown` instead of automatically repeating
it. If interrupted between tools, it may continue. The role explains this
contract, but prompts cannot enforce correct submission fields; the caller
must select `once` and meaningful step boundaries. This is not a sandbox.

Use an external operation key (task ID + named phase), inspect the destination's
receipt/status before invoking an effect, and record its result in the owning
task. When status is uncertain, leave the call `unknown` and surface it to the
user. After checking the real destination, an explicitly authorized follow-up
continues the same session as a new generation. Never automatically follow up
an unknown call. A question uses the durable `ask`/answer path and stays pending
across restarts. Effects in workflow `gate` commands also need their own
idempotency; do not use an effectful gate as a validator.

Long renders, downloads and builds can only resume if their own application
supports checkpoints. Put independently supervised jobs outside the worker's
process tree, persist their stable job identity, and have the worker query them.
A background command surviving a closed tab is not evidence of restart recovery.

## State, health and corruption

Authoritative state is in `${DSA_HOME:-~/.pi/durable-subagents}`:

- `orchestrator.jsonl`: admissions, request identities, process generations,
  config and global locks;
- `w/<wid>/journal.jsonl`: workflow phases, call/exec/seal/fence records;
- `w/<wid>/pinned/`: original specs, script/agent snapshots and content identity;
- `w/<wid>/x/<key>@<generation>/session.jsonl`: original worker session;
- the call directory's `stderr.log` and workflow artifacts: diagnostics/results;
- `events.jsonl`: durable cross-workflow milestones, with deduplication by event ID;
- `cache/`: derived data, not a replacement for journals or sessions.

Do not publish these files: tasks and sessions can contain private content.
The deployment creates the state root with mode 0700 and uses UMask 0077.

```sh
systemctl --user status pi-durable-subagents.timer
journalctl --user -u pi-durable-subagents.service -n 30
pi-durable-subagents doctor
pi-durable-subagents describe --key <request-id> --json
```

Upstream journals use CRC-framed records, fsync and directory sync. The kernel
lock excludes a second writer and disappears when its holder dies. Journal
opening repairs an incomplete/corrupt last frame, but rejects corruption in the
middle. This does not protect against hardware lies, lost/missing data or disk
failure. Pi's worker session JSONL is not a transactional journal and may lose
unsynced tail records on power failure; `once` and external receipts remain
necessary. Back up authoritative state and the working directory together at a
quiet boundary; do not delete lock files or journals to fix an error. Stop new
admissions, inspect `doctor` and preserve a copy before restoration. No automatic
pruning, unknown-outcome retries or corrupt-history reset is configured.

## Current verification boundary

The 2026-10-16 rollout passed `scripts/verify-durable.mjs --preflight` and
`--acceptance` against Pi 1.1.0 / Node 24.18.0. The first offline fixture started
with Pi's placeholder model and refused the prompt before execution; the fixture
was corrected to select its registered scripted model via RPC before prompting.
The successful rerun used the same real recovery engine, not a mocked one.
The acceptance script creates private fixtures and terminates only their own
identity-checked processes. It exercises real Pi 1.1.0 RPC, the real orchestrator,
Code Mode, the upstream systemd starter, a completed predecessor, retained worker
session/cwd/task, request deduplication, writer serialization, `once → unknown`,
and torn-tail/corruption handling. A minimal real Magpie worker request runs
with the same clean environment as a service; credentials are resolved by Pi
internally, never opened or printed by the verifier. Resource loading checks the
existing plugins, compaction extension and session-search alongside the new tool.

The isolated systemd test submits pending work **without starting an orchestrator**,
then lets a timer start it with no main Pi or TTY in the fixture. After killing
only that orchestrator, the timer starts its successor, which restores the same
worker session and keeps the predecessor finished. This proves the unattended
startup path without opening a Herdr tab or invoking a manual resume. It is
**not a physical reboot/power-cut test**. Existing Herdr, SSH and Agent processes
remain running. A full cold-boot result cannot be claimed without a future
separately authorized reboot and read-back. Provider/network availability after
boot is still required; lost auth or a long provider outage may need intervention.

## Long-term Durable Host evaluation

Sources inspected on 2026-10-16:

- [official pi-durable](https://github.com/earendil-works/pi/tree/4954d760504c11df9b2cbdc040346107b6a8153d/packages/durable),
  npm **1.3.0** (newer than this baseline's CLI);
- [pi-durable-subagents](https://github.com/purboo/pi-durable-subagents/tree/c63ff881edf62530f8a11dc6ae7f1966fa9da164),
  npm **1.0.42**; upstream tests target Pi 1.0.2, this deployment verifies 1.1.0;
- [disler/durable-pi](https://github.com/disler/durable-pi/tree/37165c619573dbaf425463038bbffecfe576beec),
  currently pins **pi-durable 1.0.3** and calls it experimental.

The official library makes model generations, tools and sub-tasks durable.
A tool's intent is persisted before execution; `replay: "safe"` tools can replay,
other interrupted tools return an interrupted result. Its Durable Code Mode
journals nested results and replays deterministically. That guarantee belongs
to the Host's Code Mode, not the installed CLI's Code Mode. A host must open
storage, reinstall its registry and start `resume()` from its own boot service.

The ordinary CLI `ExtensionAPI` and durable registry/hooks/tasks are different
interfaces. Accounts, usage, compaction, session-search, subscription images and
Moshi's CLI lifecycle extension cannot be presumed compatible or loaded directly.
Existing JSONL branch/history/compaction entries need an explicit validated
import/export mapping to durable conversations; neither inspected project
provides a verified drop-in migration for this baseline. Retain originals and
migrate copies only in a later pilot.

Disler provides a backend, REST/SSE, web client and terminal client: the terminal
can run inside Herdr, but it is a different client. It constructs an OpenRouter
provider and curated model catalog rather than inheriting Pi CLI's Magpie model
runtime or auth store. Adopting it requires a Magpie provider/credential adapter,
explicit model policy, CLI plugin replacements, session migration and Moshi event
bridging. Herdr layout does not solve those API gaps. Multi-agent durable tasks
are supported in a Host; overlapping filesystem writers still need a policy.

Official Node SQLite storage uses WAL and `synchronous=NORMAL`: process-crash
recovery is supported, but newest commits can be lost on host/power failure.
It requires one process per storage and provides **no cross-process lock**;
a Host needs an exclusive lock and appropriate storage placement. A production
pilot must define SQLite quick/integrity checks, consistent backup with WAL,
restore/quarantine procedures, and a stricter flush policy where supported.
Disler adds lock files, opens stored agents at backend startup and calls resume,
but its pin is older than the current library. Check storage/API compatibility
before changing that pin. Backend deployment needs restart/backoff, health checks,
startup ordering and a verified unattended startup path on each platform.

Linux systemd with lingering supports boot before login. The upstream macOS
LaunchAgent starts at login, so it cannot guarantee recovery before login.
Windows Native is unsupported by this package's POSIX flock/containment and
starter; WSL also needs Windows to start the distribution before user systemd can
run. No startup service was installed on another device. These boundaries are
why the existing CLI is retained and the worker channel is delivered first.

## Rollback without deleting work

First prevent new submissions. Let work finish, or explicitly drain/stop only
the workflows you own. Do not kill a shared orchestrator to uninstall UI code.

```sh
node scripts/durable-worker-setup.mjs --rollback
```

Rollback checks receipt hashes, disables/removes the installed starter files,
removes the exact Pi package/role/wrapper/drop-in, and restores the old orchestrator
config. It leaves all journals, sessions, artifacts and existing running workers.
Changed managed files cause a refusal for manual review. Existing Pi processes
keep loaded code until a deliberate reload/exit. Removing the starter does not
immediately kill the detached orchestrator. Removing future recovery is an
operator decision; save state and keep the package installed until live work has
finished when continuing recovery matters. Reinstall the same version and restore
the recorded configuration before resuming retained work.
