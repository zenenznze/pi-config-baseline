// Match baseline model preferences and resolve a configured device ID.
// Used by the baseline checker and skill-pi's ensure command.
// Model metadata only; no credentials, network requests or writes.
export function matchesDefaultModel(baseline, modelId) {
  const expected = baseline.pi?.defaultModel;
  if (typeof expected !== "string" || typeof modelId !== "string") return false;
  const mode = baseline.defaultModelMatch ?? "exact";
  if (mode === "exact") return modelId === expected;
  if (mode !== "suffix") throw new Error("unsupported defaultModelMatch: " + mode);
  return modelId.split("/").at(-1) === expected;
}

export function resolveDefaultModel(baseline, settings, models, modelsStore = {}) {
  if (baseline.defaultModelMatch !== "suffix") return baseline.pi?.defaultModel;
  const provider = baseline.pi.defaultProvider;
  const store = modelsStore.providers ?? modelsStore;
  const ids = [...new Set([
    ...(models.providers?.[provider]?.models ?? []),
    ...(store[provider]?.models ?? []),
  ].map(model => model.id).filter(id => matchesDefaultModel(baseline, id)))];
  if (settings.defaultProvider === provider && ids.includes(settings.defaultModel)) return settings.defaultModel;
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error("no configured model with final segment " + baseline.pi.defaultModel + " for provider " + provider);
  throw new Error("ambiguous default model for provider " + provider + ": " + ids.join(", "));
}
