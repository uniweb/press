/**
 * Fenced code block. Emits <pre data-type="codeBlock" data-language="…">
 * with the raw code as text content. The adapter emits:
 *
 *   ```lang
 *   ...
 *   ```
 *
 * as a Typst raw block (`#raw(block: true, lang: "...")[...]`).
 *
 * The child is rendered verbatim — no inline mark parsing.
 */
export default function CodeBlock({ language, children, ...props }) {
    const attrs = { 'data-type': 'codeBlock' }
    if (language) attrs['data-language'] = language

    return (
        <pre {...attrs} {...props}>
            <code>{children}</code>
        </pre>
    )
}
