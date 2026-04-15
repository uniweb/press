/**
 * TableOfContents — builder for a Word table-of-contents field.
 *
 * Emits a docx-only node. The browser preview renders a small
 * placeholder that makes it obvious a TOC is registered here;
 * foundations that want a richer visible TOC should render their
 * own (e.g., a simple <ol> of headings) alongside the Press
 * builder, typically within the same section component.
 *
 * Why the placeholder: a Word TOC is generated from the section
 * headings of the compiled document, and those headings don't
 * exist yet at React-render time. There's nothing semantically
 * correct we can display without knowing the final set of
 * headings. So Press keeps the builder docx-only and leaves the
 * visible preview to the foundation.
 *
 * The builder accepts three props matching the most useful
 * subset of the docx library's ITableOfContentsOptions:
 *
 *   - title          The alias displayed above the TOC entries in
 *                    the compiled file (default: "Contents").
 *   - hyperlink      Whether each entry links to its heading
 *                    (default: true).
 *   - headingRange   Which heading levels to include, in the form
 *                    "1-3" (default) or "2-4", etc.
 *
 * Additional options the docx library supports can be passed via
 * data-toc-* attributes and will be forwarded verbatim — see
 * src/ir/attributes.js.
 */

export default function TableOfContents({
    title = 'Contents',
    hyperlink = true,
    headingRange = '1-3',
    ...props
}) {
    return (
        <div
            data-type="tableOfContents"
            data-toc-title={title}
            data-toc-hyperlink={hyperlink ? 'true' : 'false'}
            data-toc-heading-range={headingRange}
            {...props}
            style={{
                padding: '0.75rem 1rem',
                border: '1px dashed currentColor',
                borderRadius: '0.25rem',
                fontStyle: 'italic',
                opacity: 0.7,
                fontSize: '0.875rem',
                ...props.style,
            }}
        >
            Table of contents — generated on download
        </div>
    )
}
