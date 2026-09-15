export const RESONANCE_TYPES = ["vida", "equilibrio", "ruptura"];

export const CONCORDANCES = {
  ve: ["vida", "equilibrio"],
  er: ["equilibrio", "ruptura"],
  vr: ["vida", "ruptura"]
};

export function heraldCapacity(level) {
  const value = Number(level) || 0;
  return value >= 20 ? 10 : value >= 17 ? 7 : 5;
}

export function heraldDuration(level) {
  return Number(level) >= 11 ? 3 : 2;
}

export function heraldOverloadThreshold(level) {
  const value = Number(level) || 0;
  if (value >= 20) return Infinity;
  return value >= 11 ? 5 : 4;
}

export function resonanceCounts(resonances = []) {
  return Object.fromEntries(RESONANCE_TYPES.map(type => [type, resonances.filter(entry => entry.type === type).length]));
}

export function availableConcordances(resonances = []) {
  const counts = resonanceCounts(resonances);
  return Object.entries(CONCORDANCES)
    .filter(([, types]) => types.every(type => counts[type] > 0))
    .map(([key]) => key);
}

export function normalizeHeraldState(raw = {}, level = 1) {
  const capacity = heraldCapacity(level);
  const resonances = Array.isArray(raw.resonances)
    ? raw.resonances
      .filter(entry => RESONANCE_TYPES.includes(entry?.type))
      .slice(0, capacity)
      .map((entry, index) => ({
        id: String(entry.id ?? `echo-${index}`),
        type: entry.type,
        expires: Math.max(1, Number(entry.expires) || 1)
      }))
    : [];
  const concordanceLimit = Number(level) >= 13 ? 2 : 1;
  const concordances = Array.isArray(raw.concordances)
    ? raw.concordances
      .filter(entry => CONCORDANCES[entry?.key])
      .slice(0, concordanceLimit)
      .map(entry => ({ key: entry.key, expires: Math.max(1, Number(entry.expires) || 1) }))
    : [];
  return {
    turn: Math.max(1, Number(raw.turn) || 1),
    resonances,
    concordances,
    pendingEcho: Array.isArray(raw.pendingEcho) ? raw.pendingEcho.filter(key => CONCORDANCES[key]) : [],
    echoUsedTurn: String(raw.echoUsedTurn ?? ""),
    satzUsedTurn: String(raw.satzUsedTurn ?? ""),
    flowUsedTurn: String(raw.flowUsedTurn ?? ""),
    flowUses: Math.max(0, Number(raw.flowUses) || 0),
    naturalUsedTurn: String(raw.naturalUsedTurn ?? ""),
    overflowUsedTurn: String(raw.overflowUsedTurn ?? ""),
    empathyUsedTurn: String(raw.empathyUsedTurn ?? ""),
    empathyTargets: Array.isArray(raw.empathyTargets) ? raw.empathyTargets.map(String) : [],
    perfectTuning: raw.perfectTuning && typeof raw.perfectTuning === "object" ? raw.perfectTuning : null,
    absoluteTurns: Math.max(0, Number(raw.absoluteTurns) || 0),
    absoluteUsed: Boolean(raw.absoluteUsed),
    absoluteSpellTurn: String(raw.absoluteSpellTurn ?? ""),
    releaseUsedTurn: String(raw.releaseUsedTurn ?? ""),
    pendingRelease: raw.pendingRelease && typeof raw.pendingRelease === "object" ? raw.pendingRelease : null
  };
}

export function compositionCost(kind, affinity) {
  if (!RESONANCE_TYPES.includes(affinity)) return null;
  if (kind === "modulacao") return { [affinity]: 1 };
  if (kind === "pura") return { [affinity]: 3 };
  if (kind === "triade") return { vida: 1, equilibrio: 1, ruptura: 1 };
  return null;
}

function discountedCompositionCost(cost, affinity, discount) {
  const required = Object.fromEntries(RESONANCE_TYPES.map(type => [type, Number(cost[type] ?? 0)]));
  const total = Object.values(required).reduce((sum, value) => sum + value, 0);
  let reductions = Math.min(Math.max(0, Number(discount) || 0), Math.max(0, total - 1));
  const order = [affinity, ...RESONANCE_TYPES.filter(type => type !== affinity)];
  for (const type of order) {
    while (reductions > 0 && required[type] > 0) {
      required[type] -= 1;
      reductions -= 1;
    }
  }
  return required;
}

export function canPayComposition(resonances, kind, affinity, discount = 0) {
  const cost = compositionCost(kind, affinity);
  if (!cost) return false;
  const counts = resonanceCounts(resonances);
  const required = discountedCompositionCost(cost, affinity, discount);
  for (const type of RESONANCE_TYPES) {
    if (counts[type] < required[type]) return false;
  }
  return true;
}

export function removeComposition(resonances, kind, affinity, discount = 0) {
  const cost = compositionCost(kind, affinity);
  if (!cost || !canPayComposition(resonances, kind, affinity, discount)) return null;
  const remaining = [...resonances];
  const spent = [];
  const required = discountedCompositionCost(cost, affinity, discount);
  for (const type of RESONANCE_TYPES) {
    for (let index = 0; index < required[type]; index += 1) {
      const position = remaining.findIndex(entry => entry.type === type);
      spent.push(...remaining.splice(position, 1));
    }
  }
  return { remaining, spent };
}

export function expireHeraldTurn(raw, level) {
  const state = normalizeHeraldState(raw, level);
  const expired = state.resonances.filter(entry => entry.expires <= state.turn);
  return {
    ...state,
    turn: state.turn + 1,
    resonances: state.absoluteTurns > 0 ? state.resonances : state.resonances.filter(entry => entry.expires > state.turn),
    concordances: state.concordances.filter(entry => entry.expires > state.turn + 1),
    pendingEcho: [],
    absoluteTurns: Math.max(0, state.absoluteTurns - 1),
    expired
  };
}
