/**
 * dsh-more-agent-presets — the bundle's own loader entry (node half).
 *
 * This package's substance is its declarative preset bundle: `dsh.bundle.patch`
 * lists `cordis.patch.yml` followed by one `presets/<id>.patch.yml` per preset,
 * each of which declares one `@deepseek-ai/dsh-agent-preset` row.
 *
 * This module is loadable on purpose, for two independent reasons:
 *
 *  1. `cordis.patch.yml` inserts a row naming this package — the shape every
 *     bundle uses for itself (`dshmarket` inserts `dsh-market` / `dshmarket`,
 *     `@deepseek-ai/dsh-web-app` inserts `web-runtime` /
 *     `@deepseek-ai/dsh-web-app`). That row needs a real plugin module behind
 *     it, so `apply` exists and does nothing: this bundle ships no host code.
 *     The empty node half is the same shape
 *     `@deepseek-ai/dsh-client-ui-agent-preset` ships, whose own header says it
 *     best — "the empty apply exists so the plugin appears in the host
 *     cordis.yml / Loader".
 *
 *  2. Third-party tooling judges a bundle by its declared entry artifact.
 *     dshmarket's `entryArtifactExists`/`hasLoadableEntry` read `main` and
 *     `exports["."]` and otherwise probe `index.js`, and its carrier fallback
 *     cannot read the ordered array form of `dsh.bundle.patch` (it accepts only
 *     a string). Without a loadable artifact it reports the installed bundle as
 *     broken ("声明的入口产物缺失…") and refuses market installs and updates
 *     with "updated build has no loadable entry".
 *
 * Mounting the row adds nothing to the composition: the five presets come from
 * the declared patch layers, never from this module.
 */

/** Host plugin body — deliberately empty; see the module header. */
export function apply() {}
