/**
 * Internal docx format adapter.
 *
 * Takes the output of the compile pipeline (src/ir/compile.js) —
 * { sections, header, footer } of IR node arrays — and produces a .docx
 * Blob via the `docx` library.
 *
 * This module is internal. It is NOT listed in package.json's exports
 * field; consumers reach it only via the dynamic import inside
 * useDocumentCompile, which keeps the ~3.4 MB docx library out of the
 * main bundle.
 *
 * Entry point: compileDocx(compiledInput, options) → Promise<Blob>
 *
 * Supports: Paragraph, TextRun, Table, Headings, Hyperlinks,
 * PositionalTab, Images (async), page numbering, default headers/footers.
 */

import {
    Document,
    Paragraph as DocxParagraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    TableLayoutType,
    VerticalAlign,
    ShadingType,
    Tab as DocxTab,
    TabStopType,
    LeaderType,
    ExternalHyperlink,
    InternalHyperlink,
    ImageRun,
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
    AlignmentType,
    PageNumber,
    NumberFormat,
    TableOfContents as DocxTableOfContents,
    Bookmark,
    FootnoteReferenceRun,
} from 'docx'
import { fetchAsset } from '../assets/fetch.js'
import { buildStylePack } from '../styles/buildStylePack.js'

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile walker output into a .docx Blob ready for browser download.
 *
 * @param {Object} input - Output of compileOutputs(store, 'docx').
 * @param {Object[][]} input.sections - Array of IR node arrays (one per block).
 * @param {Object[]|null} [input.header] - IR nodes for the document header.
 * @param {Object[]|null} [input.footer] - IR nodes for the document footer.
 * @param {Object} [options] - Document-level options. See buildDocument()
 *   for the full shape; metadata fields (title, subject, creator, ...)
 *   pass through to the docx Document constructor, and the special
 *   paragraphStyles and numbering keys are extracted and shaped into
 *   the constructor's styles and numbering blocks.
 * @returns {Promise<Blob>}
 */
export async function compileDocx(input, options = {}) {
    const doc = await buildDocument(input, options)
    return Packer.toBlob(doc)
}

/**
 * Build the docx Document object without packing. Exported for testing —
 * callers that need a Buffer (Node) or need to inspect the tree can use
 * this + `Packer.toBuffer(doc)`.
 *
 * Now async because image IR nodes require fetching image data.
 *
 * @param {Object} input
 * @param {Object} [options] - Document-level options:
 *   - paragraphStyles: Array<ParagraphStyle> — named paragraph styles
 *     that paragraphs can reference via `data-style="…"`. Passed through
 *     to `new Document({ styles: { paragraphStyles } })`. Shape matches
 *     the docx library's ParagraphStyle interface.
 *   - numbering: Array<NumberingConfig> — numbering definitions that
 *     paragraphs can reference via `data-numbering-reference="…"`.
 *     Passed through to `new Document({ numbering: { config } })`.
 *   - pageMargin: Object — page margin overrides, merged into the
 *     section's `properties.page.margin`. Shape matches the docx
 *     library's `IPageMarginAttributes` — all keys are twips (1 inch =
 *     1440): `top`, `right`, `bottom`, `left`, `header`, `footer`,
 *     `gutter`, `mirror`. The `header` and `footer` margins define the
 *     *carrier-paragraph* slot used by registered headers/footers; set
 *     both to a non-zero value or floating anchors inside those slots
 *     may be dropped. Omit to keep the docx library's defaults.
 *   - Any other key (title, subject, creator, description, keywords, …)
 *     is forwarded as-is to the Document constructor.
 *
 *   Callers that omit paragraphStyles/numbering/pageMargin pay nothing —
 *   the adapter still produces a valid document, it just has no named
 *   style, numbering definition, or margin override.
 * @returns {Promise<Document>}
 */
export async function buildDocument(input, options = {}) {
    const {
        sections = [],
        header = null,
        footer = null,
        headerFirstPageOnly = false,
        footerFirstPageOnly = false,
    } = input

    const {
        paragraphStyles,
        characterStyles,
        theme,
        typography,
        numbering,
        pageMargin,
        pageSize,
        pageOrientation,
        ...documentMetadata
    } = options

    // Pre-pass: walk every IR tree (sections, header, footer) and assign
    // sequential footnote ids to every `footnoteReference` node, collecting
    // their children into a footnotes map keyed by id. The IR nodes are
    // mutated in place with `footnoteId` so the inline converter below can
    // emit a FootnoteReferenceRun pointing at the right id. Word's footnote
    // registry is document-level, so ids must be unique across all trees.
    const footnotesState = { nextId: 1, footnotes: {} }
    collectFootnotes(sections.flat(), footnotesState)
    if (header) collectFootnotes(header, footnotesState)
    if (footer) collectFootnotes(footer, footnotesState)

    // Flatten all blocks' IR trees into one array of section children.
    // Use async conversion for image support. The host-supplied loadAsset
    // (when present) is threaded down to irToImageParagraph → fetchImageData
    // → fetchAsset, so config-level paths like `assets/diagram.png` resolve
    // to bytes via the framework's content-collector manifest the same way
    // the typst path does.
    const { loadAsset } = options
    const children = await convertChildren(sections.flat(), loadAsset)

    const pageOptions = {
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        ...(pageMargin ? { margin: pageMargin } : {}),
    }
    // Stage 4: page size + orientation. docx's IPageSizeAttributes
    // requires width and height, so the orientation flag only takes
    // effect when an explicit pageSize is set. Foundations that want
    // orientation should pass pageSize too — pageSizes.A4 / .LETTER
    // are exported presets.
    if (pageSize) {
        pageOptions.size = {
            width: pageSize.width,
            height: pageSize.height,
            ...(pageOrientation ? { orientation: pageOrientation } : {}),
        }
    }

    const sectionOptions = {
        properties: {
            type: SectionType.CONTINUOUS,
            page: pageOptions,
        },
        children,
    }

    if (header) {
        const headerChildren = await convertChildren(header, loadAsset)
        const headerObj = new Header({ children: headerChildren })
        const defaultHeaderObj = createDefaultHeaderFooter(true)

        if (headerFirstPageOnly) {
            sectionOptions.headers = { first: headerObj, default: defaultHeaderObj }
            sectionOptions.properties.titlePage = true
        } else {
            sectionOptions.headers = { default: headerObj }
        }
    } else {
        // Default "Page X of Y" header
        sectionOptions.headers = { default: createDefaultHeaderFooter(true) }
    }

    if (footer) {
        const footerChildren = await convertChildren(footer, loadAsset)
        const footerObj = new Footer({ children: footerChildren })
        const defaultFooterObj = createDefaultHeaderFooter(false)

        if (footerFirstPageOnly) {
            sectionOptions.footers = { first: footerObj, default: defaultFooterObj }
            sectionOptions.properties.titlePage = true
        } else {
            sectionOptions.footers = { default: footerObj }
        }
    } else {
        // Default "Page X of Y" footer
        sectionOptions.footers = { default: createDefaultHeaderFooter(false) }
    }

    // When either side opts in to `applyTo: 'first'`, the section gets
    // `titlePage = true`, which tells Word to look up `first` variants on
    // page 1. If the opposite side only registered a `default`, Word leaves
    // page 1's header or footer blank — the default isn't consulted. Mirror
    // `default` into `first` so all-pages content still renders on page 1.
    if (sectionOptions.properties.titlePage) {
        if (sectionOptions.headers && !sectionOptions.headers.first) {
            sectionOptions.headers.first = sectionOptions.headers.default
        }
        if (sectionOptions.footers && !sectionOptions.footers.first) {
            sectionOptions.footers.first = sectionOptions.footers.default
        }
    }

    const docOptions = {
        ...documentMetadata,
        sections: [sectionOptions],
    }

    // Stage 6.0: synthesise OOXML styles from theme.typography (or an
    // explicit typography registry) and merge with caller-supplied
    // paragraphStyles / characterStyles. The synthesised pack provides
    // document defaults (so every run inherits theme.fonts.body without
    // every TextRun emitting `data-font`), built-in style overrides
    // (Word's Title/Heading1-6 routed through `default.*`), and named
    // styles that builders reference via `<Paragraph role="…">` /
    // `<TextRun role="…">`. Caller styles override on id conflict.
    //
    // We synthesise whenever a theme is supplied, even if its
    // typography is partial — buildStylePack falls back to
    // DEFAULT_THEME entries for missing roles so the docx still gets
    // a useful style pack.
    const stylesTheme = typography
        ? { ...(theme || {}), typography }
        : theme
    if (stylesTheme) {
        const pack = buildStylePack(stylesTheme, {
            paragraphStyles,
            characterStyles,
        })
        const stylesBlock = {}
        if (pack.default && Object.keys(pack.default).length) {
            stylesBlock.default = pack.default
        }
        if (pack.paragraphStyles.length) {
            stylesBlock.paragraphStyles = pack.paragraphStyles
        }
        if (pack.characterStyles.length) {
            stylesBlock.characterStyles = pack.characterStyles
        }
        if (Object.keys(stylesBlock).length) docOptions.styles = stylesBlock
    } else if (
        (paragraphStyles && paragraphStyles.length) ||
        (characterStyles && characterStyles.length)
    ) {
        // Legacy path: caller passed only raw styles, no theme. Pass
        // through verbatim so existing foundations keep working.
        docOptions.styles = {}
        if (paragraphStyles?.length) docOptions.styles.paragraphStyles = paragraphStyles
        if (characterStyles?.length) docOptions.styles.characterStyles = characterStyles
    }

    if (numbering && numbering.length) {
        docOptions.numbering = { config: numbering }
    }

    if (Object.keys(footnotesState.footnotes).length) {
        docOptions.footnotes = footnotesState.footnotes
    }

    return new Document(docOptions)
}

/**
 * Recursively walk an IR tree, assigning a sequential `footnoteId` to
 * every node of type `footnoteReference` and collecting its children
 * into `state.footnotes` as `[id]: { children: [Paragraph] }`. The
 * footnote body's children are converted here (sync — footnote bodies
 * don't support images) so the main async convertChildren pass just
 * sees the annotated reference node and emits FootnoteReferenceRun.
 *
 * The ids count up from 1 across the entire document, matching Word's
 * document-level footnote numbering.
 */
function collectFootnotes(nodes, state) {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        if (node.type === 'footnoteReference') {
            const id = state.nextId
            state.nextId += 1
            node.footnoteId = id

            // Footnote body children must be docx Paragraph instances.
            // Each paragraph-type IR node becomes one; anything else
            // (raw text, hyperlinks at the top level) gets wrapped in
            // a paragraph so the output is valid.
            const bodyChildren = []
            for (const child of node.children || []) {
                if (child.type === 'paragraph') {
                    bodyChildren.push(irToParagraph(child))
                } else {
                    const inline = irToInlineChildren(child)
                    if (inline.length) {
                        bodyChildren.push(new DocxParagraph({ children: inline }))
                    }
                }
            }
            // Word requires at least one paragraph in a footnote.
            if (!bodyChildren.length) {
                bodyChildren.push(new DocxParagraph({}))
            }
            state.footnotes[id] = { children: bodyChildren }
        }
        if (node.children) collectFootnotes(node.children, state)
    }
}

/**
 * Create a default header or footer with "Page X of Y" text.
 * Mirrors legacy docxGenerator.createDefaultHeaderFooter().
 */
export function createDefaultHeaderFooter(isHeader) {
    const alignment = isHeader ? AlignmentType.RIGHT : AlignmentType.CENTER

    const PartType = isHeader ? Header : Footer

    return new PartType({
        children: [
            new DocxParagraph({
                alignment,
                children: [
                    new TextRun('Page '),
                    new TextRun({ children: [PageNumber.CURRENT] }),
                    new TextRun(' of '),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
            }),
        ],
    })
}

/**
 * Convert an array of IR nodes to section children, handling async
 * image fetches via Promise.all. `loadAsset` (when provided) is forwarded
 * to image-emitting paths so host-supplied byte loaders take precedence
 * over the URL-based fetch fallback.
 */
async function convertChildren(nodes, loadAsset) {
    const results = await Promise.all(
        nodes.map((node) => irToSectionChildrenAsync(node, loadAsset)),
    )
    return results.flat()
}

// ============================================================================
// IR → Section-level children (Paragraph | Table)
// ============================================================================

/**
 * Convert an IR node into section-level docx children (async for images).
 */
async function irToSectionChildrenAsync(node, loadAsset) {
    switch (node.type) {
        case 'table':
            return [await irToTableAsync(node)]
        case 'image':
            return [await irToImageParagraph(node, loadAsset)]
        case 'tableOfContents':
            return [irToTableOfContents(node)]
        case 'webOnly':
            // See the matching case in irToInlineChildren — a block-level
            // webOnly subtree is dropped from the docx output.
            return []
        default:
            return [await irToParagraphAsync(node)]
    }
}

/**
 * Convert a `tableOfContents` IR node into a docx TableOfContents
 * instance. The node's `toc` sub-object carries the options set via
 * data-toc-* attributes on the Press <TableOfContents> builder.
 *
 * See https://docx.js.org/#/usage/table-of-contents and the library's
 * ITableOfContentsOptions interface for the full set of options.
 */
function irToTableOfContents(node) {
    const opts = node.toc || {}
    const title = opts.title || 'Contents'
    const tocOptions = {
        hyperlink:
            opts.hyperlink === 'true' || opts.hyperlink === true || opts.hyperlink == null,
        headingStyleRange: opts.headingRange || '1-3',
    }
    return new DocxTableOfContents(title, tocOptions)
}

/**
 * Synchronous version for non-image nodes (backward compat).
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
    // Paragraph-level named style (data-paragraph-style on the element,
    // emitted by `<Paragraph role="…">`). Wins over node.style which is
    // the legacy run-level 'Hyperlink' marker.
    if (node.paragraphStyle) {
        options.style = node.paragraphStyle
    } else if (node.style) {
        options.style = node.style
    }
    if (node.alignment) {
        options.alignment = toAlignment(node.alignment)
    }
    if (node.pageBreakBefore) {
        options.pageBreakBefore = true
    }
    if (node.spacing) {
        options.spacing = {}
        const before = toInt(node.spacing.before)
        const after = toInt(node.spacing.after)
        const line = toInt(node.spacing.line)
        if (before != null) options.spacing.before = before
        if (after != null) options.spacing.after = after
        if (line != null) options.spacing.line = line
        if (node.spacing.lineRule) options.spacing.lineRule = node.spacing.lineRule
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
    if (node.indent) {
        const indent = {}
        for (const key of ['left', 'right', 'start', 'end', 'firstLine', 'hanging']) {
            const v = node.indent[key]
            if (v == null) continue
            const n = typeof v === 'string' ? parseInt(v, 10) : v
            if (Number.isFinite(n)) indent[key] = n
        }
        if (Object.keys(indent).length) options.indent = indent
    }
    if (Array.isArray(node.tabStops) && node.tabStops.length) {
        options.tabStops = node.tabStops
            .map(toTabStopDefinition)
            .filter(Boolean)
    }

    const children = (node.children || []).flatMap(irToInlineChildren)

    // A paragraph with data-bookmark="id" wraps its inline children in
    // a Bookmark so InternalHyperlink({ anchor: "id" }) elsewhere in the
    // document can jump here. The Word Bookmark is a run-level element,
    // so it goes inside the paragraph rather than wrapping it.
    if (node.bookmark && children.length) {
        options.children = [new Bookmark({ id: node.bookmark, children })]
    } else if (children.length) {
        options.children = children
    }

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
        case 'tab':
            // Stage 3: <Tab/> inline builder. Emits a docx Tab element
            // that interacts with the paragraph's tabStops. Wrapped in
            // a TextRun so the OOXML parent is <w:r>.
            return [new TextRun({ children: [new DocxTab()] })]
        case 'externalHyperlink':
        // A plain <a href> from same-source JSX — same destination, same
        // emitter. See the href note in ir/parser.js.
        case 'a':
            return [irToExternalHyperlink(node)]
        case 'internalHyperlink':
            return [irToInternalHyperlink(node)]
        case 'image':
            // Images in inline context are skipped — they need async handling
            // at the section level via irToImageParagraph.
            return []
        case 'webOnly':
            // `data-type="webOnly"` marks a subtree that's meaningful for the
            // React preview but has no docx analogue — e.g., an inline
            // anchor that lets readers jump to a bibliography entry, where
            // the Word equivalent is a separate mechanism (footnote, field
            // reference) emitted elsewhere. Dropping the whole subtree.
            return []
        case 'footnoteReference':
            // The pre-pass (collectFootnotes) assigned the id and registered
            // the body; here we just emit the inline reference run.
            return node.footnoteId
                ? [new FootnoteReferenceRun(node.footnoteId)]
                : []
        case 'math': {
            // v1 fallback: emit the LaTeX source as plain text. Better
            // than the MathML soup that was leaking before this case
            // existed (`<mo>…</mo>` operator names appearing as letters
            // in the document). A faithful OMML emitter is tracked as
            // future work.
            return [new TextRun({ text: node.latex || '' })]
        }
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
        // <w:ptab> must live inside <w:r> per the OOXML schema — Word
        // flags and repairs bare paragraph-level ptabs on open. Wrap in
        // a TextRun so the library emits `<w:r><w:ptab .../></w:r>`.
        result.push(
            new TextRun({
                children: [
                    new PositionalTab({
                        alignment: toTabAlignment(node.positionalTab.alignment),
                        leader: toTabLeader(node.positionalTab.leader),
                        relativeTo: toTabRelativeTo(node.positionalTab.relativeTo),
                    }),
                ],
            }),
        )
    }

    const content = node.content || ''

    // Handle page number placeholders
    if (content === '_currentPage') {
        result.push(new TextRun({ children: [PageNumber.CURRENT] }))
        return result
    }
    if (content === '_totalPages') {
        result.push(new TextRun({ children: [PageNumber.TOTAL_PAGES] }))
        return result
    }

    const options = { text: content }
    if (node.bold === 'true' || node.bold === true) options.bold = true
    if (node.italics === 'true' || node.italics === true) options.italics = true
    if (node.underline) options.underline = node.underline
    if (node.style) options.style = node.style
    // Stage 1 of press-professional-docx: branded text needs color/size/font.
    // The IR's color/size/font come from the default fallthrough rule on
    // unknown data-* attributes (data-color, data-size, data-font set by
    // the TextRun builder). docx@9.x expects: color = hex without '#',
    // size = half-points (28pt = 56), font = family name string.
    if (node.color) options.color = node.color
    if (node.size != null) {
        const sz = typeof node.size === 'string' ? parseInt(node.size, 10) : node.size
        if (Number.isFinite(sz)) options.size = sz
    }
    if (node.font) options.font = node.font
    // Stage 3: smallCaps / allCaps / strike — boolean run formatting.
    if (node.smallCaps === 'true' || node.smallCaps === true) options.smallCaps = true
    if (node.allCaps === 'true' || node.allCaps === true) options.allCaps = true
    if (node.strike === 'true' || node.strike === true) options.strike = true
    // Subscript / superscript — mutually exclusive vertical alignment.
    if (node.subScript === 'true' || node.subScript === true) options.subScript = true
    else if (node.superScript === 'true' || node.superScript === true)
        options.superScript = true

    result.push(new TextRun(options))
    return result
}

function irToExternalHyperlink(node) {
    // `link` is the data-* spelling (data-link); `href` arrives from a plain
    // <a href>. Same destination either way.
    const destination = node.link || node.href || ''
    const children = (node.children || []).flatMap(irToInlineChildren)
    return new ExternalHyperlink({
        children: children.length ? children : [new TextRun({ text: destination })],
        link: destination,
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

    const options = { rows }

    // Column widths (twips array). Parsed from `data-table-column-widths`.
    if (Array.isArray(node.tableColumnWidths) && node.tableColumnWidths.length) {
        options.columnWidths = node.tableColumnWidths
    }

    // Layout. Default to FIXED whenever explicit column widths are
    // present — Word's autofit otherwise redistributes the columns to
    // fit content, undoing the foundation's layout intent. Foundations
    // that want autofit can opt out with `layout="autofit"`.
    if (node.tableLayout) {
        options.layout =
            node.tableLayout === 'autofit'
                ? TableLayoutType.AUTOFIT
                : TableLayoutType.FIXED
    } else if (options.columnWidths) {
        options.layout = TableLayoutType.FIXED
    }

    // Whole-table width (distinct from per-cell width).
    if (node.tableWidth) {
        options.width = toTableCellWidth(node.tableWidth)
    }

    // Table-default borders. Per-cell borders still win.
    if (node.tableBorders) {
        options.borders = toBorders(node.tableBorders)
    }

    return new Table(options)
}

function irToTableRow(node) {
    const children = (node.children || [])
        .filter((child) => child.type === 'tableCell')
        .map(irToTableCell)

    const options = { children }

    // Header rows repeat at the top of each new page when the table breaks.
    if (node.tableHeader) {
        options.tableHeader = true
    }

    return new TableRow(options)
}

function irToTableCell(node) {
    const options = {}

    if (node.width) {
        options.width = toTableCellWidth(node.width)
    }
    if (node.margins) {
        options.margins = toIntObject(node.margins)
    }
    if (node.borders) {
        options.borders = toBorders(node.borders)
    }
    if (node.shading) {
        options.shading = toShading(node.shading)
    }
    if (node.verticalAlign) {
        options.verticalAlign = toVerticalAlign(node.verticalAlign)
    }
    // Merge spans. docx's `rowSpan` is the starting-cell shorthand —
    // the library handles the continue cells internally, so we don't
    // need to emit explicit vMerge=continue on subsequent rows from
    // the foundation side.
    if (node.columnSpan) {
        const n = typeof node.columnSpan === 'string' ? parseInt(node.columnSpan, 10) : node.columnSpan
        if (Number.isFinite(n) && n > 1) options.columnSpan = n
    }
    if (node.rowSpan) {
        const n = typeof node.rowSpan === 'string' ? parseInt(node.rowSpan, 10) : node.rowSpan
        if (Number.isFinite(n) && n > 1) options.rowSpan = n
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

// --- Paragraph alignment ---

const ALIGNMENTS = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justified: AlignmentType.JUSTIFIED,
    both: AlignmentType.JUSTIFIED,
}

function toAlignment(v) {
    return ALIGNMENTS[v] ?? AlignmentType.LEFT
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

/**
 * Build a TableCell `width` option from an IR width node.
 *
 * OOXML ECMA-376 expects `w:w` to be in fiftieths of a percent when
 * `w:type="pct"` (so 50% = 2500). The docx library, when given a
 * number size with `WidthType.PERCENTAGE`, serialises it as `${n}%`
 * (e.g. `w:w="18%"`) which Word flags as a validation error and
 * auto-repairs on open. To get a plain-number output we multiply by
 * 50 and pass the value as a string — that takes the library's
 * universal-measure branch, which emits the value verbatim as a
 * plain integer while keeping `w:type="pct"`.
 */
function toTableCellWidth(width) {
    const rawSize = toInt(width.size) ?? 0
    const t = width.type
    if (t === 'pct' || t === 'percentage') {
        return {
            size: String(rawSize * 50),
            type: WidthType.PERCENTAGE,
        }
    }
    return {
        size: rawSize,
        type: toWidthType(t),
    }
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

// --- Cell shading ---

const SHADING_TYPES = {
    clear: ShadingType.CLEAR,
    nil: ShadingType.NIL,
    solid: ShadingType.CLEAR, // alias — `solid` is the natural prop name
    diagonalCross: ShadingType.DIAGONAL_CROSS,
    diagonalStripe: ShadingType.DIAGONAL_STRIPE,
    horizontalStripe: ShadingType.HORIZONTAL_STRIPE,
    verticalStripe: ShadingType.VERTICAL_STRIPE,
}

/**
 * Build a TableCell `shading` option from an IR shading object.
 *
 * Foundations almost always want a solid background: `<Td shading="4775b2">`.
 * That JSX shorthand resolves to `{ fill: '4775b2' }` here, and we default
 * `type: CLEAR` and `color: 'auto'` — the standard OOXML idiom for "plain
 * fill, no overlay pattern". Without `type`, Word may render unpredictably
 * across versions; without `color: 'auto'`, the library may emit
 * `w:color=""` which Word repairs on open.
 */
function toShading(shading) {
    const fill = shading.fill || '000000'
    const type = SHADING_TYPES[shading.type] ?? ShadingType.CLEAR
    const color = shading.color || 'auto'
    return { type, fill, color }
}

// --- Cell vertical alignment ---

const VERTICAL_ALIGNS = {
    top: VerticalAlign.TOP,
    center: VerticalAlign.CENTER,
    middle: VerticalAlign.CENTER, // alias — natural-language CSS-ish
    bottom: VerticalAlign.BOTTOM,
}

function toVerticalAlign(v) {
    return VERTICAL_ALIGNS[v] ?? VerticalAlign.TOP
}

// --- Tab stops ---

const TAB_STOP_TYPES = {
    left: TabStopType.LEFT,
    right: TabStopType.RIGHT,
    center: TabStopType.CENTER,
    decimal: TabStopType.DECIMAL,
    bar: TabStopType.BAR,
    clear: TabStopType.CLEAR,
    end: TabStopType.END,
    num: TabStopType.NUM,
    start: TabStopType.START,
}

const TAB_STOP_LEADERS = {
    none: LeaderType.NONE,
    dot: LeaderType.DOT,
    hyphen: LeaderType.HYPHEN,
    underscore: LeaderType.UNDERSCORE,
    middleDot: LeaderType.MIDDLE_DOT,
}

/**
 * Build a docx TabStopDefinition from an IR tab-stop entry.
 *
 * Foundations write `tabStops={[{position: cm(12), type: 'right', leader: 'dot'}]}`
 * on a Paragraph. The builder JSON-stringifies the array; the IR
 * transform parses it back here we coerce strings to docx enums.
 *
 * @returns {{type: string, position: number, leader?: string} | null}
 */
function toTabStopDefinition(stop) {
    if (!stop || typeof stop !== 'object') return null
    const type = TAB_STOP_TYPES[stop.type] ?? TabStopType.LEFT
    const positionRaw =
        typeof stop.position === 'string' ? parseInt(stop.position, 10) : stop.position
    if (!Number.isFinite(positionRaw)) return null
    const def = { type, position: positionRaw }
    if (stop.leader) {
        const leader = TAB_STOP_LEADERS[stop.leader]
        if (leader) def.leader = leader
    }
    return def
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

// ============================================================================
// Async variants (for image support)
// ============================================================================

async function irToParagraphAsync(node) {
    // For now, paragraphs don't need async — delegate to sync version.
    return irToParagraph(node)
}

async function irToTableAsync(node) {
    // Tables don't need async either — delegate to sync.
    return irToTable(node)
}

/* ============================================================================
 * Image emission — three independent Word-compatibility invariants.
 * ============================================================================
 *
 * Producing a .docx with images that Word opens cleanly (no repair dialog,
 * no outright rejection) requires three things the docx library does NOT
 * enforce for us. All three must hold; violating any one surfaces as a
 * different symptom, so they're easy to confuse. Getting only two right
 * still produces broken files.
 *
 * Regression guard: tests/docx/monograph-docx.test.jsx — the
 * 'drawing IDs are unique per document' block asserts all three.
 *
 * 1. UNIQUE <wp:docPr id=""> PER IMAGE
 *    The library's DocProperties class instantiates its own id generator
 *    in each constructor, so every ImageRun otherwise emits
 *    <wp:docPr id="1">. A document with N images collides on N identical
 *    drawing IDs; Word flags the file and auto-repairs on open.
 *    Fix: supply an explicit `id` via altText — it wins over the
 *    per-instance generator. We use a module-level monotonic counter
 *    (`nextImageId` below). Scope is the document only, so we never
 *    reset — just never hand out the same number twice.
 *    Symptom if violated: Word opens with repair dialog; images survive.
 *
 * 2. ALWAYS EMIT `name` ON <wp:docPr>
 *    ECMA-376 declares `name` required on CT_NonVisualDrawingProps. The
 *    docx library's DocProperties constructor only supplies the default
 *    `name: ''` when its argument is entirely undefined — any partial
 *    object (`{ id }`, `{ description }`, …) skips the default and
 *    emits <wp:docPr> without a name attribute.
 *    Fix: always spread `{ name: '' }` into altText before merging caller
 *    fields. Look for `name: ''` in `irToImageParagraph` — it LOOKS like
 *    a no-op but is load-bearing. Do not remove.
 *    Symptom if violated: Word-for-Mac refuses to open the file (hard
 *    reject, no repair offered). Word-for-Windows tolerates it.
 *
 * 3. PASS A VALID `type` TO ImageRun
 *    docx@9.x writes each image as `word/media/<hash>.<type>` and binds
 *    the file's content-type through the `<Default Extension="...">`
 *    entries in [Content_Types].xml (png, jpeg, jpg, gif, bmp, svg are
 *    pre-declared). If we omit `type`, the library interpolates the
 *    string literal 'undefined' → the ZIP entry becomes
 *    `<hash>.undefined`, which has no content-type binding.
 *    Fix: infer type from the URL extension, falling back to magic-byte
 *    sniffing, then to 'png'. See `inferImageType` below.
 *    Symptom if violated: Word opens with repair dialog ("found
 *    unreadable content"); the repair adds a
 *    <Default Extension="undefined" ContentType="application/octet-stream"/>
 *    entry to rescue the file.
 *
 * What makes this class of bug hard to debug: each symptom looks like a
 * generic "corrupted docx" error — and the three cross-cut (fix #1 while
 * leaving #2 wrong and you STILL get the Mac rejection; fix #2 and #3
 * while leaving #1 wrong and you still get repair). Diff the unzipped
 * XML of a repaired copy against the original to see what Word added.
 * ========================================================================= */

let nextImageId = 1

/**
 * Pick the docx `type` string from the image src URL or, when the
 * extension is missing/unknown, sniff the first bytes of the fetched
 * image. docx@9.x's RegularImageOptions.type is 'jpg' | 'png' | 'gif'
 * | 'bmp'; SVG has a separate options shape (with a fallback raster)
 * that we don't handle here — SVGs fall back to the default raster
 * type ('png') which Word will accept as an opaque container when
 * the magic bytes don't match.
 *
 * See the file header for why `type` matters (invariant #3).
 */
function inferImageType(src, data) {
    const ext = (src.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase()
    if (ext === 'png') return 'png'
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
    if (ext === 'gif') return 'gif'
    if (ext === 'bmp') return 'bmp'

    const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data?.buffer ?? data)
    if (bytes.length >= 4) {
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif'
        if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp'
    }
    return 'png'
}

/**
 * Convert an image IR node to a Paragraph containing an ImageRun.
 * Fetches the image data asynchronously.
 *
 * See the file-header comment block for the three Word-compatibility
 * invariants this function upholds (unique docPr id, non-null name,
 * valid type). Do not simplify the altText spread — `name: ''` looks
 * like a no-op but Word-for-Mac rejects the file without it.
 */
async function irToImageParagraph(node, loadAsset) {
    try {
        const src = node.src || ''
        if (!src) return new DocxParagraph({})

        const imageData = await fetchImageData(src, loadAsset)

        const width = toInt(node.transformation?.width) ?? 400
        const height = toInt(node.transformation?.height) ?? 300

        const imageOptions = {
            type: inferImageType(src, imageData),
            data: imageData,
            transformation: { width, height },
            altText: {
                id: nextImageId++,
                name: '',
                ...(node.altText || {}),
            },
        }

        if (node.floating) {
            imageOptions.floating = node.floating
        }

        const paragraphOptions = {
            children: [new ImageRun(imageOptions)],
        }
        if (node.alignment) {
            paragraphOptions.alignment = toAlignment(node.alignment)
        }

        return new DocxParagraph(paragraphOptions)
    } catch (err) {
        console.error(`Error creating image element:`, err)
        return new DocxParagraph({})
    }
}

/**
 * Fetch image bytes for a docx ImageRun.
 *
 * Thin wrapper over the shared src/assets/fetch.js helper — docx wants
 * a raw ArrayBuffer (Uint8Array.buffer works too; the library accepts
 * either). The shared helper is what EPUB and any future asset-embedding
 * adapter use; see principle 6 ("Extract shared logic when a second
 * adapter needs it") in docs/architecture/principles.md.
 */
async function fetchImageData(url, loadAsset) {
    const { bytes } = await fetchAsset(url, { loadAsset })
    return bytes
}
