/**
 * Low-level escape: emits verbatim Typst source into the output. The child
 * must be a plain string; it will appear unmodified in the emitted `.typ`
 * file, surrounded by blank lines.
 *
 * Use sparingly — Raw bypasses the IR, so content inside isn't portable
 * across format adapters. Keep for the cases where the builder surface
 * isn't enough (custom show rules, scripting, calling foundation-specific
 * functions that don't have a dedicated builder).
 *
 * Example:
 *   <Raw>{'#show raw: set text(font: "JetBrains Mono")'}</Raw>
 *
 * The element is rendered invisibly in the browser (display:none) because
 * its child isn't meaningful HTML — it's a raw Typst source string we
 * want to preserve verbatim through renderToStaticMarkup without React
 * trying to escape it further.
 */
export default function Raw({ children, ...props }) {
    return (
        <div
            data-type="raw"
            style={{ display: 'none' }}
            {...props}
        >
            {children}
        </div>
    )
}
