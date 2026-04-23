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
        numbering,
        pageMargin,
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
    // Use async conversion for image support.
    const children = await convertChildren(sections.flat())

    const sectionOptions = {
        properties: {
            type: SectionType.CONTINUOUS,
            page: {
                pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
                ...(pageMargin ? { margin: pageMargin } : {}),
            },
        },
        children,
    }

    if (header) {
        const headerChildren = await convertChildren(header)
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
        const footerChildren = await convertChildren(footer)
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

    if (paragraphStyles && paragraphStyles.length) {
        docOptions.styles = { paragraphStyles }
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
 * image fetches via Promise.all.
 */
async function convertChildren(nodes) {
    const results = await Promise.all(nodes.map(irToSectionChildrenAsync))
    return results.flat()
}

// ============================================================================
// IR → Section-level children (Paragraph | Table)
// ============================================================================

/**
 * Convert an IR node into section-level docx children (async for images).
 */
async function irToSectionChildrenAsync(node) {
    switch (node.type) {
        case 'table':
            return [await irToTableAsync(node)]
        case 'image':
            return [await irToImageParagraph(node)]
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
    if (node.style) {
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
        case 'externalHyperlink':
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
        options.width = toTableCellWidth(node.width)
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
async function irToImageParagraph(node) {
    try {
        const src = node.src || ''
        if (!src) return new DocxParagraph({})

        const imageData = await fetchImageData(src)

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

        return new DocxParagraph({
            children: [new ImageRun(imageOptions)],
        })
    } catch (err) {
        console.error(`Error creating image element:`, err)
        return new DocxParagraph({})
    }
}

/**
 * Fetch image data from a URL and return as ArrayBuffer.
 * Works in browser (via fetch + blob) and Node (via fetch + arrayBuffer).
 */
async function fetchImageData(url) {
    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(`HTTP error fetching image: ${response.status}`)
    }

    return response.arrayBuffer()
}
