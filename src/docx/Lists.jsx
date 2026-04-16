/**
 * BulletList and NumberedList — thin sugar over <Paragraph> for the
 * common flat-list case where every item is a plain string.
 *
 *   <BulletList items={['finch', 'tortoise', 'mockingbird']} />
 *   <NumberedList items={observations} reference="decimal-numbering" />
 *
 * For nested lists with mixed content per item (paragraphs, links,
 * sub-lists), use the original <List> builder — its item shape is
 * richer: { paragraphs, links, images, lists }.
 *
 * NumberedList requires a numbering definition in the compile options:
 *
 *   compile('docx', {
 *     numbering: [
 *       { reference: 'decimal-numbering', levels: [...] },
 *     ],
 *   })
 *
 * The default `reference='decimal-numbering'` is a convention, not a
 * built-in — your style pack must define it (or pass a different name).
 */
import Paragraph from './Paragraph.jsx'

/**
 * @param {Object} props
 * @param {Array<string|number>} props.items
 * @param {number} [props.level=0]
 * @param {string} [props.className]
 */
export function BulletList({ items, level = 0, className }) {
    if (!items || !items.length) return null
    return items.map((item, i) => (
        <Paragraph
            key={i}
            data={typeof item === 'string' ? item : String(item)}
            className={className}
            data-bullet-level={level}
        />
    ))
}

/**
 * @param {Object} props
 * @param {Array<string|number>} props.items
 * @param {number} [props.level=0]
 * @param {string} [props.reference='decimal-numbering'] - Matches a numbering
 *   definition id passed to compile('docx', { numbering: [...] }).
 * @param {string} [props.className]
 */
export function NumberedList({
    items,
    level = 0,
    reference = 'decimal-numbering',
    className,
}) {
    if (!items || !items.length) return null
    return items.map((item, i) => (
        <Paragraph
            key={i}
            data={typeof item === 'string' ? item : String(item)}
            className={className}
            data-numbering-reference={reference}
            data-numbering-level={level}
        />
    ))
}
