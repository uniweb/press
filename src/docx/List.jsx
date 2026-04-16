/**
 * List component for document output.
 *
 * Renders nested bullet lists using data-bullet-level for docx mapping.
 * Each list item's paragraphs are rendered via Paragraph.
 *
 * @param {Object} props
 * @param {Array} props.data - Array of list items, each with { paragraphs, links, imgs, lists }.
 * @param {number} [props.level=0] - Nesting level.
 */
import Paragraph, { Paragraphs } from './Paragraph.jsx'
import Image, { Images } from './Image.jsx'
import Link, { Links } from './Link.jsx'

export default function List({ data, level = 0, ...props }) {
    if (!data || !data.length) return null

    return data.map((item, index) => {
        const { paragraphs = [], links = [], imgs = [], images = [], lists = [] } = item

        return (
            <div key={index} style={{ marginLeft: level > 0 ? '2rem' : 0 }} {...props}>
                <Paragraphs
                    data={paragraphs}
                    dataProps={{
                        'data-bullet-level': level,
                        className: `ml-${4 + level * 4}`,
                    }}
                />
                <Images data={imgs.length ? imgs : images} />
                <Links data={links} />
                {lists.map((nestedList, i) => (
                    <List key={i} data={nestedList} level={level + 1} />
                ))}
            </div>
        )
    })
}

/**
 * Render an array of lists. Convenience wrapper.
 */
export function Lists({ data, dataProps = {} }) {
    if (!data || !data.length) return null

    return data.map((list, index) => <List key={index} data={list} {...dataProps} />)
}
