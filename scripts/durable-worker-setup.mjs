#!/usr/bin/env node
// Deployment glue only. Recovery, task identity and locks belong to pi-durable-subagents.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agent = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi/agent');
const home = process.env.DSA_HOME || path.join(os.homedir(), '.pi/durable-subagents');
const settingsFile = path.join(agent, 'settings.json');
const pkg = path.join(agent, 'npm/node_modules/pi-durable-subagents');
const cli = path.join(pkg, 'dist/cli/main.js');
const source = 'npm:pi-durable-subagents@1.0.42';
const configFile = path.join(home, 'config.json');
const roleFile = path.join(agent, 'agents/durable-worker.md');
const bin = path.join(os.homedir(), '.local/bin/pi-durable-subagents');
const receiptFile = path.join(home, 'baseline-install.json');
const serviceDir = path.join(os.homedir(), '.config/systemd/user');
const dropin = path.join(serviceDir, 'pi-durable-subagents.service.d/baseline.conf');
const action = process.argv[2] || '--plan';
if (!['--plan', '--apply', '--rollback'].includes(action)) throw new Error('Use --plan, --apply or --rollback');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function run(command, args, env = process.env) {
  const r = spawnSync(command, args, { encoding: 'utf8', env, timeout: 30000 });
  if (r.status !== 0) throw new Error(`${command} failed (${r.status}); no runtime secrets are printed`);
  return r.stdout.trim();
}
function atomic(file, text, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + `.tmp-${process.pid}`;
  const fd = fs.openSync(temp, 'wx', mode);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
  const dir = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
const sourceOf = e => typeof e === 'string' ? e : e.source;
const quoted = s => '"' + s.replace(/[\\"$`]/g, '\\$&') + '"';
const unitQuoted = s => '"' + s.replace(/[%\\"\n\r]/g, c => ({'%':'%%','\\':'\\\\','"':'\\"','\n':'\\n','\r':'\\r'}[c])) + '"';
if (action === '--rollback') {
  const r = json(receiptFile);
  // Refuse removal if any state changed since installation; never overwrite a later edit.
  for (const f of r.files) if (fs.existsSync(f.path) && hash(fs.readFileSync(f.path)) !== f.hash) throw new Error(`Changed deployment file: ${f.path}`);
  if (fs.existsSync(configFile) && hash(fs.readFileSync(configFile)) !== r.configHash) throw new Error('Worker config changed; perform scoped manual rollback');
  const s = json(settingsFile);
  if (hash(JSON.stringify(s.packages.filter(e => sourceOf(e) !== source))) !== r.otherPackagesHash) throw new Error('Package list changed; perform scoped manual rollback');
  run('systemctl', ['--user', 'disable', '--now', 'pi-durable-subagents.timer']);
  // Does not signal the detached orchestrator or any worker. Existing work can finish.
  run('pi', ['remove', source]);
  for (const f of r.files) if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
  if (r.oldConfig !== null) atomic(configFile, r.oldConfig);
  else fs.unlinkSync(configFile);
  run('systemctl', ['--user', 'daemon-reload']);
  fs.renameSync(receiptFile, receiptFile + '.rolled-back-' + Date.now());
  console.log('Automatic starter and package removed; journals, sessions and running workers retained.');
  process.exit(0);
}
if (process.platform !== 'linux') throw new Error('Automated deployment supports Linux/systemd only; see docs/durable-workers.md for platform limits');
const s = json(settingsFile);
const oldConfig = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : null;
const wanted = { ...(oldConfig ? JSON.parse(oldConfig) : {}), onQuit: 'continue', writerLock: 'queue' };
wanted.providers = { ...wanted.providers, magpie: wanted.providers?.magpie || { slots: 2 } };
const piBin = run('which', ['pi']);
const linger = run('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger', '--value']);
const files = [
  {path: roleFile, text: fs.readFileSync(path.join(root, 'baseline/durable/durable-worker.md'), 'utf8'), mode: 0o600},
  {path: bin, text: `#!/bin/sh\n# Stable installed npm source; no npx cache and no shell credential loader.\nexport PI_CODING_AGENT_DIR=${quoted(agent)}\nexport DSA_HOME=${quoted(home)}\nexport DSA_PI_BIN=${quoted(piBin)}\nexec ${quoted(process.execPath)} ${quoted(cli)} "$@"\n`, mode: 0o700},
  {path: dropin, text: `[Unit]\nAfter=magpie.service\n\n[Service]\nEnvironment=${unitQuoted('PI_CODING_AGENT_DIR=' + agent)}\nEnvironment="PI_OFFLINE=1"\nEnvironment="PI_SKIP_VERSION_CHECK=1"\nUMask=0077\nTimeoutStartSec=90\n`, mode: 0o600},
];
const env = { HOME: os.homedir(), USER: os.userInfo().username, PATH: '/usr/local/bin:/usr/bin:/bin', XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS, PI_CODING_AGENT_DIR: agent, DSA_HOME: home, DSA_PI_BIN: piBin };
console.log(JSON.stringify({action, source, agentDir: agent, stateDir: home, piBin, linger, files: files.map(f => f.path), config: {onQuit:'continue',writerLock:'queue'}, existingConfigPreserved: oldConfig !== null}, null, 2));
if (action === '--plan') process.exit(0);
if (linger !== 'yes') throw new Error('User lingering is required for boot without login; enable it explicitly before apply');
if (fs.existsSync(receiptFile)) throw new Error('Installation receipt already exists; inspect current deployment instead of replacing it');
if (s.packages.some(e => /^npm:pi-durable-subagents(?:@|$)/.test(sourceOf(e)) && sourceOf(e) !== source)) throw new Error('Another durable package version is configured; preserve it and review an explicit migration');
for (const f of files) if (fs.existsSync(f.path)) throw new Error(`Existing file must be preserved: ${f.path}`);
for (const name of ['pi-durable-subagents.service', 'pi-durable-subagents.timer']) if (fs.existsSync(path.join(serviceDir, name))) throw new Error(`Existing unit: ${name}`);
if (!s.packages.some(e => sourceOf(e) === source)) run('pi', ['install', source]);
if (json(path.join(pkg, 'package.json')).version !== '1.0.42') throw new Error('Installed worker version differs');
// No auth file is opened, copied or parsed. Children use Pi's own provider runtime.
fs.mkdirSync(home, { recursive: true, mode: 0o700 });
fs.chmodSync(home, 0o700);
const r = {version:1, source, installedAt:new Date().toISOString(), oldConfig, files: [], configHash:hash(JSON.stringify(wanted, null, 2) + '\n'), otherPackagesHash:hash(JSON.stringify(s.packages.filter(e => sourceOf(e) !== source)))};
// Persist rollback metadata before activation.
for (const f of files) { atomic(f.path, f.text, f.mode); r.files.push({path:f.path,hash:hash(f.text)}); }
atomic(configFile, JSON.stringify(wanted, null, 2) + '\n');
atomic(receiptFile, JSON.stringify(r, null, 2) + '\n');
run(process.execPath, [cli, 'install-service'], env);
for (const name of ['pi-durable-subagents.service','pi-durable-subagents.timer']) {
  const file = path.join(serviceDir, name);
  r.files.push({path:file, hash:hash(fs.readFileSync(file))});
}
r.configHash = hash(fs.readFileSync(configFile));
atomic(receiptFile, JSON.stringify(r, null, 2) + '\n');
console.log('Installed exact worker package and upstream timer; no existing Pi process was reloaded or restarted.');
