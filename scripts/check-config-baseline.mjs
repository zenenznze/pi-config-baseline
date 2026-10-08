#!/usr/bin/env node
// Read-only structural check for the Pi configuration baseline and one device.
// Reads only non-secret baseline/settings/model metadata; never reads auth or sessions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "baseline", "pi-config-baseline.json");

function parseArgs(argv) {
  const args = { agentDir: process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"), platform: process.platform === "win32" ? "windows-native" : "linux", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--agent-dir") {
      const value = argv[++i];
      if (!value) throw new Error("--agent-dir requires a path");
      args.agentDir = path.resolve(value);
    } else if (argv[i] === "--platform") {
      args.platform = argv[++i];
      if (!["windows-native", "linux", "wsl"].includes(args.platform)) throw new Error("--platform must be windows-native, linux, or wsl");
    } else if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: node scripts/check-config-baseline.mjs [--agent-dir <path>] [--platform windows-native|linux|wsl] [--json]");
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

function check({ agentDir, platform }) {
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

  if (!baseline.purpose?.includes("not a Pi Package")) issues.push("baseline purpose must state that this repository is not a Pi Package");
  if (fs.existsSync(path.join(root, "package.json"))) issues.push("baseline repository contains package.json");
  if (!Array.isArray(baseline.recommendedPackages) || baseline.recommendedPackages.length === 0) issues.push("no recommended packages declared");

  for (const key of ["defaultProvider", "defaultModel", "defaultThinkingLevel", "theme", "hideThinkingBlock"]) {
    if (settings[key] !== baseline.pi?.[key]) issues.push(`settings.${key} differs from baseline`);
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
    if (JSON.stringify(profile?.defaultTools) !== JSON.stringify(expected) || profile?.codemode?.mode !== "only") {
      issues.push(`invalid platform profile: ${name}`);
    }
  }
  const profile = readJson(path.join(root, baseline.toolConfiguration.profiles[platform]), null);
  if (JSON.stringify(settings.defaultTools) !== JSON.stringify(profile.defaultTools)) issues.push(`settings.defaultTools differs from ${platform} profile`);
  if (settings.codemode?.mode !== "only") issues.push("settings.codemode.mode must be only");
  if ((settings.extensions ?? []).includes("-builtin:codemode")) issues.push("built-in codemode extension is disabled");
  const autoCompact = readJson(path.join(agentDir, baseline.autoCompaction.configFile), null);
  if (autoCompact?.threshold !== baseline.autoCompaction.config.threshold) issues.push("Auto Compact threshold differs from preserved baseline");
  for (const provider of baseline.forbiddenProviders ?? []) {
    if (models.providers?.[provider]) issues.push(`forbidden provider remains configured: ${provider}`);
  }
  for (const extension of baseline.independentRuntimeExtensions ?? []) {
    const extensionPath = path.resolve(extension.path.startsWith("~/.pi/agent/")
      ? path.join(agentDir, extension.path.slice("~/.pi/agent/".length))
      : expandHome(extension.path));
    if (!fs.existsSync(extensionPath)) {
      issues.push(`independent runtime extension is missing: ${extension.id}`);
      continue;
    }
    const source = fs.readFileSync(extensionPath, "utf8");
    if (extension.provider && !source.includes(`"${extension.provider}"`)) issues.push(`${extension.id} does not reference provider ${extension.provider}`);
    if (extension.model && !source.includes(`"${extension.model}"`)) issues.push(`${extension.id} does not reference model ${extension.model}`);
  }

  return {
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
    for (const issue of result.issues) console.error(`- ${issue}`);
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(`Pi configuration baseline check failed: ${error.message}`);
  process.exitCode = 1;
}
