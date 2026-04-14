/**
 * Generic register-and-render wrapper.
 *
 * Combines useDocumentOutput with a <section> wrapper in one call, so
 * foundation code doesn't have to split the JSX into a "markup const"
 * and a separate registration. Format-agnostic — pass `format="xlsx"`
 * when an xlsx adapter lands.
 *
 *   <Section block={block}>
 *     <H1>Cover</H1>
 *     <Paragraph data={content.body} />
 *   </Section>
 *
 * Extra props are forwarded to the rendered <section> element, so this
 * works as a drop-in replacement for a plain wrapper.
 */
import { useDocumentOutput } from '../useDocumentOutput.js'

export function Section({ block, format = 'docx', children, ...props }) {
    useDocumentOutput(block, format, children)
    return <section {...props}>{children}</section>
}
