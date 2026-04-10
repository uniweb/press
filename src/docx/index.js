/**
 * @uniweb/documents/docx — Word document adapter.
 *
 * Takes the IR tree (from htmlToIR) and the walker output (from the
 * orchestrator) and produces a .docx Blob via the `docx` library.
 *
 * This is the modern replacement for legacy docxGenerator.js.
 *
 * Entry point: `compileDocx(walkerOutput, options)` → `Promise<Blob>`
 *
 * Images are deferred to a follow-up — text/table/heading/hyperlink
 * support is complete.
 */

import {
    Document,
    Paragraph as DocxParagraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    ExternalHyperlink,
    InternalHyperlink,
    Packer,
    Header,
    Footer,
    HeadingLevel,
    WidthType,
    BorderStyle,
    SectionType,
    PositionalTab,
    PositionalTabAlignment,
    PositionalTabLeader,
    PositionalTabRelativeTo,
} from 'docx'

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile walker output into a .docx Blob ready for browser download.
 *
 * @param {Object} input - Output of the orchestrator's `compile('docx')`.
 * @param {Object[][]} input.sections - Array of IR node arrays (one per block).
 * @param {Object[]|null} [input.header] - IR nodes for the document header.
 * @param {Object[]|null} [input.footer] - IR nodes for the document footer.
 * @param {Object} [options] - Passed through to docx `Document` constructor
 *   (title, subject, creator, description, etc.).
 * @returns {Promise<Blob>}
 */
export async function compileDocx(input, options = {}) {
    const doc = buildDocument(input, options)
    return Packer.toBlob(doc)
}

/**
 * Build the docx Document object without packing. Exported for testing —
 * callers that need a Buffer (Node) or need to inspect the tree can use
 * this + `Packer.toBuffer(doc)`.
 *
 * @param {Object} input
 * @param {Object} [options]
 * @returns {Document}
 */
export function buildDocument(input, options = {}) {
    const { sections = [], header = null, footer = null } = input

    // Flatten all blocks' IR trees into one array of section children.
    const children = sections.flat().flatMap(irToSectionChildren)

    const sectionOptions = {
        properties: { type: SectionType.CONTINUOUS },
        children,
    }

    if (header) {
        const headerChildren = header.flatMap(irToSectionChildren)
        sectionOptions.headers = {
            default: new Header({ children: headerChildren }),
        }
    }

    if (footer) {
        const footerChildren = footer.flatMap(irToSectionChildren)
        sectionOptions.footers = {
            default: new Footer({ children: footerChildren }),
        }
    }

    return new Document({
        ...options,
        sections: [sectionOptions],
    })
}

// ============================================================================
// IR → Section-level children (Paragraph | Table)
// ============================================================================

/**
 * Convert an IR node into section-level docx children. Returns an array
 * because some nodes might expand to multiple children.
 */
function irToSectionChildren(node) {
    switch (node.type) {
        case 'table':
            return [irToTable(node)]
        default:
            return [irToParagraph(node)]
    }
}

// ============================================================================
// Paragraph conversion
// ============================================================================

function irToParagraph(node) {
    const options = {}

    if (node.heading) {
        options.heading = toHeadingLevel(node.heading)
    }
    if (node.spacing) {
        options.spacing = {}
        const before = toInt(node.spacing.before)
        const after = toInt(node.spacing.after)
        if (before != null) options.spacing.before = before
        if (after != null) options.spacing.after = after
    }
    if (node.bullet) {
        options.bullet = { level: toInt(node.bullet.level) ?? 0 }
    }
    if (node.numbering) {
        options.numbering = {
            reference: node.numbering.reference,
            level: toInt(node.numbering.level) ?? 0,
        }
        const instance = toInt(node.numbering.instance)
        if (instance != null) options.numbering.instance = instance
    }

    const children = (node.children || []).flatMap(irToInlineChildren)
    if (children.length) options.children = children

    return new DocxParagraph(options)
}

// ============================================================================
// Inline children (TextRun, Hyperlink, PositionalTab, etc.)
// ============================================================================

/**
 * Convert an IR node into inline docx children. Returns an array
 * because a text node with positionalTab expands to [PositionalTab, TextRun].
 */
function irToInlineChildren(node) {
    switch (node.type) {
        case 'text':
            return irToTextRunPair(node)
        case 'externalHyperlink':
            return [irToExternalHyperlink(node)]
        case 'internalHyperlink':
            return [irToInternalHyperlink(node)]
        case 'image':
            // Deferred to follow-up — skip images for now.
            return []
        default:
            // Unknown inline: try text extraction, then recurse children.
            if (node.content) {
                return [new TextRun({ text: node.content })]
            }
            if (node.children) {
                return node.children.flatMap(irToInlineChildren)
            }
            return []
    }
}

/**
 * Convert a text IR node to one or two inline docx children. If the node
 * carries positionalTab, the tab is emitted first, then the text run.
 */
function irToTextRunPair(node) {
    const result = []

    if (node.positionalTab) {
        result.push(
            new PositionalTab({
                alignment: toTabAlignment(node.positionalTab.alignment),
                leader: toTabLeader(node.positionalTab.leader),
                relativeTo: toTabRelativeTo(node.positionalTab.relativeTo),
            }),
        )
    }

    const options = { text: node.content || '' }
    if (node.bold === 'true' || node.bold === true) options.bold = true
    if (node.italics === 'true' || node.italics === true) options.italics = true
    if (node.underline) options.underline = node.underline
    if (node.style) options.style = node.style

    result.push(new TextRun(options))
    return result
}

function irToExternalHyperlink(node) {
    const children = (node.children || []).flatMap(irToInlineChildren)
    return new ExternalHyperlink({
        children: children.length ? children : [new TextRun({ text: node.link || '' })],
        link: node.link || '',
    })
}

function irToInternalHyperlink(node) {
    const children = (node.children || []).flatMap(irToInlineChildren)
    return new InternalHyperlink({
        children: children.length ? children : [new TextRun({ text: node.anchor || '' })],
        anchor: node.anchor || '',
    })
}

// ============================================================================
// Table conversion
// ============================================================================

function irToTable(node) {
    const rows = (node.children || [])
        .filter((child) => child.type === 'tableRow')
        .map(irToTableRow)
    return new Table({ rows })
}

function irToTableRow(node) {
    const children = (node.children || [])
        .filter((child) => child.type === 'tableCell')
        .map(irToTableCell)
    return new TableRow({ children })
}

function irToTableCell(node) {
    const options = {}

    if (node.width) {
        options.width = {
            size: toInt(node.width.size) ?? 0,
            type: toWidthType(node.width.type),
        }
    }
    if (node.margins) {
        options.margins = toIntObject(node.margins)
    }
    if (node.borders) {
        options.borders = toBorders(node.borders)
    }

    // Table cell children must be Paragraph or Table instances.
    const children = (node.children || []).flatMap((child) => {
        if (child.type === 'table') return [irToTable(child)]
        // Everything else becomes a paragraph (either directly or wrapped).
        return [irToParagraph(child)]
    })

    // docx requires at least one child in a cell.
    options.children = children.length ? children : [new DocxParagraph({})]

    return new TableCell(options)
}

// ============================================================================
// Value converters — IR strings to docx enums and numbers
// ============================================================================

function toInt(v) {
    if (v == null) return undefined
    const n = parseInt(v, 10)
    return isNaN(n) ? undefined : n
}

function toIntObject(obj) {
    const result = {}
    for (const [key, val] of Object.entries(obj)) {
        const n = toInt(val)
        if (n != null) result[key] = n
    }
    return result
}

// --- Heading levels ---

const HEADING_LEVELS = {
    HEADING_1: HeadingLevel.HEADING_1,
    HEADING_2: HeadingLevel.HEADING_2,
    HEADING_3: HeadingLevel.HEADING_3,
    HEADING_4: HeadingLevel.HEADING_4,
    HEADING_5: HeadingLevel.HEADING_5,
    HEADING_6: HeadingLevel.HEADING_6,
}

function toHeadingLevel(v) {
    return HEADING_LEVELS[v]
}

// --- Width type ---

const WIDTH_TYPES = {
    percentage: WidthType.PERCENTAGE,
    pct: WidthType.PERCENTAGE,
    dxa: WidthType.DXA,
    auto: WidthType.AUTO,
    nil: WidthType.NIL,
}

function toWidthType(v) {
    return WIDTH_TYPES[v] ?? WidthType.DXA
}

// --- Border style ---

const BORDER_STYLES = {
    single: BorderStyle.SINGLE,
    double: BorderStyle.DOUBLE,
    dotted: BorderStyle.DOTTED,
    dashed: BorderStyle.DASHED,
    none: BorderStyle.NONE,
    nil: BorderStyle.NIL,
    thick: BorderStyle.THICK,
    triple: BorderStyle.TRIPLE,
}

function toBorders(borders) {
    const result = {}
    for (const [side, props] of Object.entries(borders)) {
        result[side] = {
            style: BORDER_STYLES[props.style] ?? BorderStyle.SINGLE,
            size: toInt(props.size) ?? 1,
            color: props.color || '000000',
        }
    }
    return result
}

// --- Positional tab ---

const TAB_ALIGNMENTS = {
    left: PositionalTabAlignment.LEFT,
    center: PositionalTabAlignment.CENTER,
    right: PositionalTabAlignment.RIGHT,
}

function toTabAlignment(v) {
    return TAB_ALIGNMENTS[v] ?? PositionalTabAlignment.LEFT
}

const TAB_LEADERS = {
    none: PositionalTabLeader.NONE,
    dot: PositionalTabLeader.DOT,
    hyphen: PositionalTabLeader.HYPHEN,
    underscore: PositionalTabLeader.UNDERSCORE,
    heavy: PositionalTabLeader.HEAVY,
    middleDot: PositionalTabLeader.MIDDLE_DOT,
}

function toTabLeader(v) {
    return TAB_LEADERS[v] ?? PositionalTabLeader.NONE
}

const TAB_RELATIVE_TO = {
    indent: PositionalTabRelativeTo.INDENT,
    margin: PositionalTabRelativeTo.MARGIN,
}

function toTabRelativeTo(v) {
    return TAB_RELATIVE_TO[v] ?? PositionalTabRelativeTo.MARGIN
}
