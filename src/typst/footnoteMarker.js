/**
 * A footnote, written into a styled string (a paragraph's `text`): the note, as a
 * styled string of its own, at the place the mark goes. `parseStyledString` reads
 * it back as a `footnote` part, and each lane's `<Paragraph>` builds it: a footnote
 * in Typst and LaTeX, a footnote reference in Word.
 *
 * A browser shows the styled string as HTML, where this is an empty mark. A
 * foundation gives the HTML paths its own note.
 *
 * @param {string} note - The note's text, marks included.
 * @returns {string}
 */
export function footnoteMarker(note) {
    const escaped = String(note ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    return `<span data-type="footnote" data-note="${escaped}">*</span>`
}
