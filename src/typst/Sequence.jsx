/**
 * Document-order walker. Takes a Uniweb `content.sequence` array and emits
 * the appropriate Press/typst builder per element type.
 *
 * Parallel to Kit's `<Prose>` component: one walker per format, same data
 * source. A book chapter (or any article-shaped section) just does:
 *
 *   <Sequence data={content.sequence} />
 *
 * and the framework takes care of heading levels, code blocks, lists,
 * tables, images, and blockquotes in document order.
 *
 * Element types handled (from content-structure.md):
 *   - heading      { level, text }
 *   - paragraph    { text }                        (HTML string with inline marks)
 *   - codeBlock    { text, attrs: { language } }
 *   - list         { style: 'bullet'|'ordered', children: [...] }
 *   - blockquote   { children: [...] }
 *   - image        { attrs: { url, alt, caption, width } }
 *   - table        { children: [...] }              (future)
 *   - inset        { refId }                        (future)
 *   - dataBlock    { ... }                          (skipped — not prose)
 *   - video        { ... }                          (skipped — not in print)
 *
 * Unknown or unsupported types are silently dropped. If a foundation needs
 * coverage for a new element type, extend this walker; the IR walker and
 * adapter will already understand the resulting builder output because
 * both are type-driven.
 */
import Heading from './Heading.jsx'
import Paragraph from './Paragraph.jsx'
import CodeBlock from './CodeBlock.jsx'
import List from './List.jsx'
import BlockQuote from './BlockQuote.jsx'
import Image from './Image.jsx'
import Math from './Math.jsx'

function renderElement(element, key) {
    if (!element || typeof element !== 'object') return null

    switch (element.type) {
        case 'heading':
            return (
                <Heading
                    key={key}
                    level={element.level || 1}
                    id={element.attrs?.id || undefined}
                    data={element.text || ''}
                />
            )

        case 'paragraph':
            if (!element.text) return null
            return <Paragraph key={key} data={element.text} />

        case 'codeBlock':
            return (
                <CodeBlock key={key} language={element.attrs?.language || ''}>
                    {element.text || ''}
                </CodeBlock>
            )

        case 'list':
            return (
                <List
                    key={key}
                    items={element.children || []}
                    ordered={element.style === 'ordered'}
                />
            )

        case 'blockquote':
            // Children are inline content in this variant — if they are a
            // list of sequence-shaped elements, recurse; otherwise treat as
            // paragraphs.
            return (
                <BlockQuote key={key}>
                    {(element.children || []).map((child, i) =>
                        renderElement(child, i)
                    )}
                </BlockQuote>
            )

        case 'image':
            return (
                <Image
                    key={key}
                    src={element.attrs?.url}
                    alt={element.attrs?.alt}
                    caption={element.attrs?.caption}
                    width={element.attrs?.width}
                    id={element.attrs?.id || undefined}
                />
            )

        case 'math':
            // Block (display:true) and inline (display:false) share the
            // builder. Inline math doesn't reach the sequence walker —
            // it's wrapped inside paragraph HTML — but render the same
            // way for safety in case a future caller surfaces it here.
            return (
                <Math
                    key={key}
                    latex={element.latex || ''}
                    display={element.display !== false}
                    id={element.id || undefined}
                />
            )

        case 'document':
            // A file, not a picture. In print it can only be shown, not opened:
            // its preview when it has one, captioned with its name — and
            // nothing when it has none, as a video is skipped. Until 2026-09-29
            // the parser delivered a document as an image, and this printed
            // the file itself as one.
            if (!element.attrs?.preview) return null
            return (
                <Image
                    key={key}
                    src={element.attrs.preview}
                    alt=""
                    caption={element.attrs.caption || element.attrs.alt}
                    id={element.attrs.id || undefined}
                />
            )

        // Skipped: dataBlock (not prose), video (not in print), inset (Phase 3).
        default:
            return null
    }
}

export default function Sequence({ data, ...props }) {
    if (!data || !Array.isArray(data) || data.length === 0) return null

    return (
        <div data-type="contentWrapper" {...props}>
            {data.map((element, i) => renderElement(element, i))}
        </div>
    )
}
