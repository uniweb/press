/**
 * HTML → IR walker built on parse5.
 *
 * The walker takes an HTML fragment string (typically the output of
 * `ReactDOMServer.renderToStaticMarkup(jsx)`) and produces an array of
 * intermediate representation (IR) nodes that format adapters consume.
 *
 * This is the modern equivalent of legacy `htmlToDocx()` at
 * report-sdk/src/utils.js:212-487, with two improvements:
 *   1. Uses parse5 instead of browser DOMParser → testable in Node.
 *   2. Attribute parsing is data-driven (see ./attributes.js) instead of
 *      a giant switch statement.
 *
 * IR node shape:
 *
 *   Element node:  { type, ...properties, children?: [...] }
 *   Text node:     { type: 'text', content: string }
 *
 * Special node types handled by the walker:
 *
 *   - emptyLine:      Element is dropped entirely (returns null).
 *   - contentWrapper: Element is transparent — its children are spread
 *                     into the parent's children list.
 *
 * Type resolution:
 *
 *   - If `data-type` is present, it determines the node type.
 *   - Otherwise, the lowercased tag name is used (e.g., a bare <p> becomes
 *     `{ type: 'p', ... }`). Builder components always set data-type, so
 *     bare-element fallthrough mostly affects raw HTML embedded by
 *     foundation authors.
 */

import { parseFragment } from 'parse5'
import { attributesToProperties } from './attributes.js'

/**
 * Parse an HTML fragment string into an array of IR nodes.
 *
 * @param {string} htmlString - HTML fragment (NOT a full document).
 * @returns {Object[]} IR nodes from the fragment's top level.
 *
 * @example
 * htmlToIR('<p data-type="paragraph">Hello</p>')
 * // => [{ type: 'paragraph', children: [{ type: 'text', content: 'Hello' }] }]
 */
export function htmlToIR(htmlString) {
    const fragment = parseFragment(htmlString)
    return collectChildren(fragment)
}

/**
 * HTML metadata / resource-hint elements that React 18.3+ and 19 emit
 * alongside regular DOM (e.g. `<link rel="preload" as="image">` next to
 * an `<img>`). They are browser-only directives with no document
 * meaning, so the walker drops them.
 *
 * A foundation author who deliberately placed one of these in their
 * JSX had a browser concern in mind — documents don't carry stylesheets
 * or preload hints, so dropping them here is correct regardless.
 */
const SKIP_ELEMENTS = new Set([
    'link',
    'meta',
    'script',
    'style',
    'base',
    'title',
    'noscript',
])

/**
 * Convert a single parse5 node to an IR node, an array of IR nodes
 * (for `contentWrapper`), or null (for ignored nodes).
 *
 * @param {Object} node - parse5 node
 * @returns {Object|Object[]|null}
 */
function nodeToIR(node) {
    // Text node — parse5 marks these with nodeName === '#text'.
    if (node.nodeName === '#text') {
        return node.value ? { type: 'text', content: node.value } : null
    }

    // Skip non-element nodes (comments, doctypes, etc.).
    if (!node.tagName) return null

    const tagName = node.tagName.toLowerCase()
    if (SKIP_ELEMENTS.has(tagName)) return null

    const dataType = getAttr(node, 'data-type')
    const type = dataType || tagName

    // emptyLine: drop entirely.
    if (type === 'emptyLine') return null

    // contentWrapper: transparent — return children for the caller to spread.
    if (type === 'contentWrapper') {
        return collectChildren(node)
    }

    const properties = attributesToProperties(node.attrs || [])
    const children = collectChildren(node)

    // A plain <a href> carries its destination in a normal HTML attribute, not
    // a data-* one, so attributesToProperties drops it. Foundations reach this
    // shape by writing an ordinary anchor in JSX that serves both the browser
    // preview and the compile input — the same-source property principles.md
    // §8 asks us to pursue. Without the href the adapters still emit the link
    // TEXT and silently lose the destination, which is precisely the
    // preview/output drift that principle exists to eliminate.
    //
    // Only `href` is lifted, and only for an anchor: it is the one plain
    // attribute whose document meaning is unambiguous. The IR stays data-*
    // driven everywhere else.
    if (type === 'a' && properties.href === undefined) {
        const href = getAttr(node, 'href')
        if (href) properties.href = href
    }

    const obj = { type, ...properties }

    if (type === 'text') {
        // Element-level type='text' — concatenate text content from descendants.
        // (This path covers the case where a foundation author wraps text in a
        // <span data-type='text'> rather than emitting raw text.)
        obj.content = children.map((c) => c.content || '').join('')
    } else if (children.length > 0) {
        obj.children = children
    }

    return obj
}

// The elements that sit in a line of text.
const INLINE_ELEMENTS = new Set([
    'a',
    'abbr',
    'b',
    'cite',
    'code',
    'em',
    'i',
    'kbd',
    'mark',
    'q',
    's',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'u',
])

const isInline = (node) => INLINE_ELEMENTS.has(node?.tagName?.toLowerCase())

/**
 * Whether a text node holding only whitespace is part of the text. Between blocks it only lays
 * out the markup. But `**bold** *italic*` is three runs, and the one in the middle, a lone space,
 * is what keeps two words apart: it counts inside a run, and between two inline neighbours.
 * ⛔ Until 2026-11-01 every one was dropped, and that printed `bolditalic`, on every output built
 * from this tree. A numbered reference printed `[1]R. M. Karp`, and a report `Technical Report388`.
 *
 * @param {Object} parent - parse5 node holding the text node
 * @param {Object[]} siblings - its childNodes
 * @param {number} at - the text node's place among them
 */
function isTextSpace(parent, siblings, at) {
    return isInline(parent) || getAttr(parent, 'data-type') === 'text' || (isInline(siblings[at - 1]) && isInline(siblings[at + 1]))
}

/**
 * Walk a parent node's childNodes, converting each to IR and flattening
 * any contentWrapper-spread arrays. Whitespace-only text nodes that aren't
 * part of the text are dropped (`isTextSpace`).
 *
 * @param {Object} parent - parse5 element, fragment, or document node
 * @returns {Object[]} Flat array of IR child nodes
 */
function collectChildren(parent) {
    const out = []
    const childNodes = parent.childNodes || []
    for (const [at, child] of childNodes.entries()) {
        if (child.nodeName === '#text' && !child.value.trim() && !isTextSpace(parent, childNodes, at)) continue
        const ir = nodeToIR(child)
        if (ir == null) continue
        if (Array.isArray(ir)) {
            out.push(...ir)
        } else {
            out.push(ir)
        }
    }
    return out
}

/**
 * Read a single attribute by name from a parse5 element node.
 *
 * @param {Object} node
 * @param {string} name
 * @returns {string|null}
 */
function getAttr(node, name) {
    if (!node.attrs) return null
    for (const attr of node.attrs) {
        if (attr.name === name) return attr.value
    }
    return null
}
