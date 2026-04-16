/**
 * Inline Word footnote reference.
 *
 * Inside a <Paragraph>, drop a <FootnoteReference> at the exact point
 * where you want the superscript marker to appear. The children are the
 * footnote body — typically one <Paragraph> of text, but anything that
 * compiles into valid docx paragraph content works. The docx adapter's
 * pre-pass collects every FootnoteReference in the document, assigns
 * sequential ids, and registers the bodies in Word's document-level
 * footnote map; inline emission drops a FootnoteReferenceRun at the
 * reference point, and Word typesets the body at the bottom of
 * whichever page the reference ends up on.
 *
 * Web behavior: this element is hidden (`display: none`). The reader
 * experience in the browser is the responsibility of the surrounding
 * component — a typical pattern is to pair FootnoteReference with a
 * `<WebOnly>`-marked inline anchor that the reader clicks to jump
 * somewhere (a bibliography, an in-page footnotes list). Web and docx
 * then present channel-appropriate affordances for the same reference.
 *
 * @example
 *   <Paragraph>
 *     <TextRun>As argued elsewhere</TextRun>
 *     <FootnoteReference>
 *       <Paragraph data="Smith, J. (2024). A study of references." />
 *     </FootnoteReference>
 *     <TextRun>, this pattern is common.</TextRun>
 *   </Paragraph>
 */
export default function FootnoteReference({ children }) {
    return (
        <span data-type="footnoteReference" style={{ display: 'none' }}>
            {children}
        </span>
    )
}
