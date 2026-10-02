/**
 * Root entry artifact for dsh-more-agent-presets.
 *
 * This package's substance is its declarative preset bundle: `dsh.bundle.patch`
 * lists `cordis.patch.yml` (an empty anchor layer) followed by one
 * `presets/<id>.patch.yml` per preset. This module carries no runtime API —
 * like `@deepseek-ai/dsh-base`, which ships `export {}` for the same reason.
 *
 * It exists so static tooling can judge the declared entry artifact truthfully.
 * dshmarket's `entryArtifactExists`/`hasLoadableEntry` reads `main` and
 * `exports["."]` and, failing that, probes `index.js`; it also cannot read the
 * ordered array form of `dsh.bundle.patch` (it accepts only a string), so its
 * carrier fallback finds no target either. With none of those present it
 * reports the installed bundle as broken ("声明的入口产物缺失…") and refuses
 * market installs and updates with "updated build has no loadable entry".
 * DSH core never imports a bundle's root — it composes the declared patch
 * files — so this file changes nothing at composition time.
 */
export {}
