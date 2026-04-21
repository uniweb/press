/**
 * Bullet or numbered list. Emits a <ul>/<ol>-shaped tree using <div>s so
 * React doesn't inject auto-tbody style wrappers, with
 * data-type="list" and data-ordered attribute. Each list item is emitted
 * as <div data-type="listItem"> containing the item's rendered children.
 *
 * Accepted item shapes:
 *
 *   1. Plain string: `'one'` → a single paragraph whose text is the string.
 *
 *   2. Kit-style list-item object: `{ paragraphs: [...], lists: [[...]] }`.
 *      Used by older Uniweb list rendering.
 *
 *   3. **Semantic-parser shape**: an **array of sequence elements**.
 *      Example: `[{ type: 'paragraph', text: '...' }, { type: 'list', ... }]`.
 *      This is what `content.sequence`'s `list.children[i]` looks like.
 *
 * The adapter (src/adapters/typst.js) walks the emitted IR's `listItem`
 * children and emits Typst `- ` / `+ ` markers.
 */
import Paragraph from './Paragraph.jsx'

// Forward declaration for the recursive call inside renderItem.
let renderSequenceInList

function renderItem(item, index) {
    // Shape 1: bare string.
    if (typeof item === 'string') {
        return (
            <div key={index} data-type="listItem">
                <Paragraph data={item} />
            </div>
        )
    }

    // Shape 3: array of sequence elements (from semantic parser).
    if (Array.isArray(item)) {
        return (
            <div key={index} data-type="listItem">
                {item.map((el, i) => renderSequenceInList(el, i))}
            </div>
        )
    }

    // Shape 2: kit-style object.
    if (item && typeof item === 'object') {
        const paragraphs =
            item.paragraphs || (item.text ? [item.text] : [])
        const childLists = item.lists || []

        return (
            <div key={index} data-type="listItem">
                {paragraphs.map((p, i) => (
                    <Paragraph key={`p${i}`} data={p} />
                ))}
                {childLists.map((child, i) => (
                    <List key={`l${i}`} items={child} ordered={item.ordered} />
                ))}
            </div>
        )
    }

    return null
}

/**
 * Render one sequence element inside a list item. Pared-down vs Sequence.jsx —
 * list items in real books only carry paragraphs, nested lists, and occasional
 * inline code. Unknown types fall through as `null` without erroring, so
 * this stays additive as the semantic parser grows.
 */
renderSequenceInList = function renderSeq(el, key) {
    if (!el || typeof el !== 'object') return null

    switch (el.type) {
        case 'paragraph':
            if (!el.text) return null
            return <Paragraph key={key} data={el.text} />

        case 'list':
            return (
                <List
                    key={key}
                    items={el.children || []}
                    ordered={el.style === 'ordered'}
                />
            )

        // Dropped: headings (markdown invalid inside list items anyway),
        // codeBlock (rare inside a list item; add later if needed),
        // image (handled as a bare paragraph by the markdown parser).
        default:
            return null
    }
}

export default function List({ items, ordered = false, ...props }) {
    if (!items || !items.length) return null

    const Tag = ordered ? 'ol' : 'ul'
    const attrs = { 'data-type': 'list' }
    if (ordered) attrs['data-ordered'] = 'true'

    return (
        <Tag {...attrs} {...props}>
            {items.map((item, i) => renderItem(item, i))}
        </Tag>
    )
}

export function BulletList(props) {
    return <List {...props} ordered={false} />
}

export function NumberedList(props) {
    return <List {...props} ordered={true} />
}
