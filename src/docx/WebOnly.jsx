/**
 * Inline subtree that is rendered in the browser but dropped by the
 * docx adapter.
 *
 * Use when a component needs to surface a web-specific affordance
 * (an inline anchor, a hover card, a tooltip trigger) whose docx
 * equivalent is emitted separately (e.g., via <FootnoteReference>
 * or <Link> with an internal href). The docx walker sees
 * `data-type="webOnly"` and drops the whole subtree, leaving no
 * trace in the compiled Word document.
 *
 * Renders as a plain `<span>` in the browser. The `data-type` attribute
 * has no effect on web rendering — it's just a marker the walker reads.
 *
 * @example
 *   // Citation inset — web shows a linked anchor, docx shows a
 *   // Word footnote (emitted by <FootnoteReference>, below).
 *   <>
 *     <WebOnly>
 *       <a href="#ref-smith-2024">(Smith, 2024)</a>
 *     </WebOnly>
 *     <FootnoteReference>
 *       <Paragraph data="Smith, J. (2024). …" />
 *     </FootnoteReference>
 *   </>
 */
export default function WebOnly({ children, ...props }) {
    return (
        <span data-type="webOnly" {...props}>
            {children}
        </span>
    )
}
