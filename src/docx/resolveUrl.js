/**
 * Prepend a base path to a site-absolute URL, if needed.
 *
 * Only URLs that start with a single leading '/' get the prefix. External
 * URLs ('https://…'), protocol-relative URLs ('//cdn.example.com/…'),
 * data/blob URIs, fragment links ('#anchor'), and already-relative paths
 * ('./foo', 'foo') pass through unchanged. Idempotent: URLs already
 * prefixed with the basePath are returned as-is.
 *
 * Mirrors the helper in framework/runtime/src/components/Background.jsx
 * so preview and background rendering use the same rules.
 *
 * @param {string} url
 * @param {string} [basePath] - Trailing slash stripped (e.g. '/docs').
 * @returns {string}
 */
export function resolveUrl(url, basePath) {
    if (!url || !basePath) return url
    if (typeof url !== 'string') return url
    if (!url.startsWith('/')) return url
    // Protocol-relative URL ('//host/…') — not site-absolute.
    if (url.startsWith('//')) return url
    // Already prefixed.
    if (url === basePath || url.startsWith(basePath + '/')) return url
    return basePath + url
}
