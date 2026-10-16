#!/usr/bin/env node
// Read-only structural check for the Pi configuration baseline and one device.
// Reads only non-secret baseline/settings/model metadata; never reads auth or sessions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { matchesDefaultModel } from "./default-model.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "baseline", "pi-config-baseline.json");

function parseArgs(argv) {
  const args = { agentDir: process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"), platform: process.platform === "win32" ? "windows-native" : "linux", piRoot: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--agent-dir") {
      const value = argv[++i];
      if (!value) throw new Error("--agent-dir requires a path");
      args.agentDir = path.resolve(value);
    } else if (argv[i] === "--platform") {
      args.platform = argv[++i];
      if (!["windows-native", "linux", "wsl"].includes(args.platform)) throw new Error("--platform must be windows-native, linux, or wsl");
    } else if (argv[i] === "--pi-root") {
      const value = argv[++i];
      if (!value) throw new Error("--pi-root requires a path");
      args.piRoot = path.resolve(value);
    } else if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: node scripts/check-config-baseline.mjs [--agent-dir <path>] [--platform windows-native|linux|wsl] [--pi-root <installed-package-root>] [--json]");
      process.exit(0);
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sourceOf(entry) {
  return typeof entry === "string" ? entry : entry?.source;
}

function expandHome(value) {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

// Hash the LF-normalized content: Git/editor CRLF conversion must not read as drift.
function sha256Normalized(buffer) {
  return createHash("sha256").update(buffer.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
}

function matchesModelMetadata(entry, id) {
  const modelId = entry.modelId ?? "";
  if (entry.match === "exact") return id === modelId;
  if (entry.match === "contains") return id.includes(modelId);
  return id.endsWith(modelId);
}

function check({ agentDir, platform, piRoot }) {
  const baseline = readJson(baselinePath, null);
  if (!baseline) throw new Error(`missing baseline: ${baselinePath}`);
  const settingsPath = path.join(agentDir, "settings.json");
  const modelsPath = path.join(agentDir, "models.json");
  const settings = readJson(settingsPath, {});
  const models = readJson(modelsPath, { providers: {} });
  const activeSources = (Array.isArray(settings.packages) ? settings.packages : [])
    .filter((entry) => !(typeof entry === "object" && entry?.autoload === false))
    .map(sourceOf)
    .filter(Boolean);
  const issues = [];
  const checks = [];
  if (piRoot) {
    const pkg = readJson(path.join(piRoot, "package.json"), null);
    const valid = pkg?.name === "@earendil-works/pi-coding-agent" && pkg.version === baseline.recommendedPiVersion;
    checks.push({ id: "pi-version", status: valid ? "PASS" : "FAIL", installed: pkg?.version ?? null, expected: baseline.recommendedPiVersion });
    if (!valid) issues.push("installed Pi package identity/version differs from baseline target");
  } else checks.push({ id: "pi-version", status: "UNVERIFIED", reason: "Supply --pi-root; no runtime identity inferred from settings" });
  const minimum = baseline.minimumNodeVersion ?? "22.19.0";
  const actual = process.versions.node.split(".").map(Number);
  const wanted = minimum.split(".").map(Number);
  const nodeOK = actual[0] > wanted[0] || (actual[0] === wanted[0] && (actual[1] > wanted[1] || (actual[1] === wanted[1] && actual[2] >= wanted[2])));
  checks.push({ id: "checker-node-version", status: nodeOK ? "PASS" : "FAIL", actual: process.versions.node, minimum });
  if (!nodeOK) issues.push("Node version is below baseline minimum");
  checks.push({ id: "extension-behavior", status: "UNVERIFIED", reason: "Source strings and configuration are not runtime/API validation" });
  for (const plugin of baseline.independentPlugins ?? []) {
    const expected = `npm:${plugin.npm?.name}@${plugin.npm?.version}`;
    if (!baseline.recommendedPackages.some(p => p.id === plugin.id && p.source === expected && p.ref === plugin.ref)) issues.push(`inconsistent independent plugin metadata: ${plugin.id}`);
  }
  for (const item of baseline.recommendedPackages ?? []) {
    if (!/^npm:(?:@[^/]+\/)?[^@]+@\d+\.\d+\.\d+$/.test(item.source)) issues.push(`package must use an exact stable npm version: ${item.id}`);
    const name = item.source.replace(/^npm:/, "").replace(/@[^@]+$/, "");
    const expected = item.source.slice(item.source.lastIndexOf("@") + 1);
    const installed = readJson(path.join(agentDir, "npm", "node_modules", name, "package.json"), null);
    checks.push({ id: `installed-package:${item.id}`, status: installed ? (installed.name === name && installed.version === expected ? "PASS" : "FAIL") : "UNVERIFIED", installed: installed?.version ?? null, expected });
    if (installed && (installed.name !== name || installed.version !== expected)) issues.push(`installed package version differs: ${item.id}`);
  }
  if (settings.defaultProvider === "azure-openai-responses") issues.push("deprecated Azure provider: migrate to azure using official migration notes");

  if (!baseline.purpose?.includes("not a Pi Package")) issues.push("baseline purpose must state that this repository is not a Pi Package");
  if (fs.existsSync(path.join(root, "package.json"))) issues.push("baseline repository contains package.json");
  if (!Array.isArray(baseline.recommendedPackages) || baseline.recommendedPackages.length === 0) issues.push("no recommended packages declared");

  for (const key of ["defaultProvider", "defaultModel", "defaultThinkingLevel", "theme", "hideThinkingBlock", "tuiMode"]) {
    const matches = key === "defaultModel"
      ? matchesDefaultModel(baseline, settings[key])
      : settings[key] === baseline.pi?.[key];
    if (!matches) issues.push(`settings.${key} differs from baseline`);
  }
  for (const item of baseline.recommendedPackages ?? []) {
    if (!activeSources.includes(item.source)) issues.push(`recommended package source is not active: ${item.id}`);
  }
  for (const source of activeSources) {
    if (/per-pi-package|pi-config-baseline/i.test(source)) issues.push(`configuration baseline is incorrectly active as a Pi package: ${source}`);
    if (/SoL-Pi/i.test(source)) issues.push(`retired SoL-Pi package is still active: ${source}`);
  }
  if (fs.existsSync(path.join(agentDir, "sol-pi.json"))) issues.push("obsolete sol-pi.json remains in agent directory");

  for (const name of ["windows-native", "linux", "wsl"]) {
    const profile = readJson(path.join(root, baseline.toolConfiguration.profiles[name]), null);
    const shell = name === "windows-native" ? "powershell" : "bash";
    const expected = ["read", "edit", "write", "grep", "find", "ls", shell, "codemode"];
    if (JSON.stringify(profile?.defaultTools) !== JSON.stringify(expected) || profile?.codemode?.mode !== baseline.toolConfiguration.codemode.mode) {
      issues.push(`invalid platform profile: ${name}`);
    }
  }
  const profile = readJson(path.join(root, baseline.toolConfiguration.profiles[platform]), null);
  if (JSON.stringify(settings.defaultTools) !== JSON.stringify(profile.defaultTools)) issues.push(`settings.defaultTools differs from ${platform} profile`);
  if (baseline.toolConfiguration.codemode.mode !== "on") issues.push("baseline.toolConfiguration.codemode.mode must be on");
  if (settings.codemode?.mode !== baseline.toolConfiguration.codemode.mode) issues.push(`settings.codemode.mode must be ${baseline.toolConfiguration.codemode.mode}`);
  if ((settings.extensions ?? []).includes("-builtin:codemode")) issues.push("built-in codemode extension is disabled");
  const autoCompact = readJson(path.join(agentDir, baseline.autoCompaction.configFile), null);
  if (autoCompact?.threshold !== baseline.autoCompaction.config.threshold) issues.push("Auto Compact threshold differs from preserved baseline");
  if (autoCompact?.alignPiThreshold !== baseline.autoCompaction.config.alignPiThreshold) issues.push("Auto Compact alignment differs from baseline");
  for (const [key, reserveTokens] of Object.entries(autoCompact?.alignedReserveTokens ?? {})) {
    if (settings.compaction?.modelOverrides?.[key]?.reserveTokens !== reserveTokens) issues.push(`settings.compaction.modelOverrides.${key}.reserveTokens does not match the reserve Auto Compact recorded`);
  }
  for (const budget of baseline.autoCompaction.exactPiModelBudgets ?? []) {
    for (const [providerId, provider] of Object.entries(models.providers ?? {})) {
      for (const model of provider?.models ?? []) {
        if (model?.contextWindow !== budget.contextWindow) continue;
        const key = `${providerId}/${model.id}`;
        const expected = budget.contextWindow - budget.compactAtTokens;
        if (settings.compaction?.modelOverrides?.[key]?.reserveTokens !== expected) issues.push(`settings.compaction.modelOverrides.${key}.reserveTokens must be ${expected} so the model compacts at ${budget.compactAtTokens} tokens`);
        if (autoCompact?.alignedReserveTokens?.[key] !== undefined) issues.push(`pi-auto-compact must not manage ${key}: its ${baseline.autoCompaction.config.threshold}% alignment would overwrite the exact ${budget.compactAtTokens}-token budget`);
      }
    }
  }
  for (const provider of baseline.forbiddenProviders ?? []) {
    if (models.providers?.[provider]) issues.push(`forbidden provider remains configured: ${provider}`);
  }
  // A registered model must carry the window this baseline records; it need not be registered.
  for (const entry of baseline.modelMetadata ?? []) {
    const registered = models.providers?.[entry.provider]?.models;
    if (!Array.isArray(registered)) continue;
    for (const model of registered) {
      if (!model?.id || !matchesModelMetadata(entry, model.id)) continue;
      if (model.contextWindow !== entry.contextWindow) {
        issues.push(`registered ${entry.provider}/${model.id} declares contextWindow ${String(model.contextWindow)}; the baseline records ${entry.contextWindow}`);
      }
    }
  }
  for (const extension of baseline.independentRuntimeExtensions ?? []) {
    const extensionPath = path.resolve(extension.path.startsWith("~/.pi/agent/")
      ? path.join(agentDir, extension.path.slice("~/.pi/agent/".length))
      : expandHome(extension.path));
    if (extension.source) {
      const versionedPath = path.join(root, extension.source);
      checks.push({ id: `runtime-extension-copy:${extension.id}`, status: fs.existsSync(versionedPath) ? "PASS" : "FAIL", source: extension.source });
      if (!fs.existsSync(versionedPath)) issues.push(`versioned runtime extension copy is missing: ${extension.source}`);
      else if (extension.sha256 && sha256Normalized(fs.readFileSync(versionedPath)) !== extension.sha256) {
        issues.push(`baseline copy ${extension.source} no longer matches its recorded sha256; update the hash only after reviewing the change`);
      }
    }
    if (!fs.existsSync(extensionPath)) {
      checks.push({ id: `runtime-extension:${extension.id}`, status: "FAIL", reason: "missing on device" });
      issues.push(`independent runtime extension is missing: ${extension.id}`);
      continue;
    }
    const source = fs.readFileSync(extensionPath, "utf8");
    const copyMatches = !extension.sha256 || sha256Normalized(Buffer.from(source, "utf8")) === extension.sha256;
    checks.push({ id: `runtime-extension:${extension.id}`, status: copyMatches ? "PASS" : "FAIL", versioned: extension.source ?? null });
    if (!copyMatches) issues.push(`installed runtime extension ${extension.id} differs from the versioned baseline copy; adopt ${extension.source} or update the baseline`);
    if (extension.provider && !source.includes(`"${extension.provider}"`)) issues.push(`${extension.id} does not reference provider ${extension.provider}`);
    if (extension.model && !source.includes(`"${extension.model}"`)) issues.push(`${extension.id} does not reference model ${extension.model}`);
  }

  return {
    checks,
    coverage: checks.some(c => c.status === "UNVERIFIED") ? "PARTIAL" : "CONFIGURATION_ONLY",
    ok: issues.length === 0,
    baseline: {
      repository: baseline.repository,
      recommendedPiVersion: baseline.recommendedPiVersion,
      platform,
      autoCompactThreshold: baseline.autoCompaction.config.threshold,
      packageIds: baseline.recommendedPackages.map((item) => item.id),
      independentPlugins: baseline.independentPlugins,
    },
    settings: { path: settingsPath, activePackageSources: activeSources },
    issues,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = check(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Pi configuration baseline: ${result.ok ? "OK" : "ISSUES FOUND"}`);
    console.log(`Recommended packages: ${result.baseline.packageIds.join(", ")}`);
    console.log(`Active Pi package sources inspected: ${result.settings.activePackageSources.length}`);
    for (const item of result.checks) console.log(`${item.status}: ${item.id}${item.reason ? " — " + item.reason : ""}`);
    for (const issue of result.issues) console.error(`- ${issue}`);
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(`Pi configuration baseline check failed: ${error.message}`);
  process.exitCode = 1;
}
