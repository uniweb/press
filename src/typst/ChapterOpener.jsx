/**
 * Book-specific helper: the opening page of a chapter.
 *
 * Emits data-type="chapterOpener" with number/title/subtitle attributes.
 * The adapter translates this to a call into the foundation's preamble:
 *
 *   #chapter-opener(number: 3, title: "...", subtitle: "...")
 *
 * The foundation's preamble.typ defines chapter-opener to produce the
 * book's chosen look (page break, vertical padding, centered title, etc.).
 */
export default function ChapterOpener({ number, title, subtitle, ...props }) {
    const attrs = { 'data-type': 'chapterOpener' }
    if (number != null) attrs['data-number'] = String(number)
    if (title) attrs['data-title'] = title
    if (subtitle) attrs['data-subtitle'] = subtitle

    return <div {...attrs} {...props} />
}
