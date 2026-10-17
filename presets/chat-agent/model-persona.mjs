// ≤1.6.2 shipped the model→persona table at this path, so a profile patch that
// overrode the `preset-chat-agent` declaration may still restate this specifier.
// The table now lives in `presets/shared/` (both chat presets read it); this
// re-export keeps the old path resolvable and yields the SAME module instance —
// one cached table, one read, exactly as before the move.
export * from '../shared/model-persona.mjs'
