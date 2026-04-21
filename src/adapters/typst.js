/**
 * Internal Typst format adapter.
 *
 * Walks the compile-pipeline output (src/ir/compile.js) — { sections,
 * header, footer, metadata } of IR node arrays — and produces a Typst
 * source bundle. Phase 1 ships `sources` mode: return a ZIP Blob of the
 * bundle; the user runs `typst compile main.typ` locally.
 *
 * Phase 2 will add `server` mode (POST the bundle to an endpoint backed
 * by the `typst` npm package). Phase 3 may add `wasm` mode if browser
 * PDF compile becomes viable.
 *
 * Bundle shape (sources mode):
 *
 *   main.typ         entry: imports template + meta, includes content
 *   meta.typ         #let title = "…", #let author = "…" (from metadata role)
 *   content.typ      one "// --- section N ---" block per registered section
 *   preamble.typ     foundation-supplied named functions (chapter-opener, …)
 *   template.typ     foundation-supplied page geometry + show rules
 *   assets/          (Phase 2) images fetched + hashed
 *
 * This module is internal. It is NOT listed in package.json's exports
 * field; consumers reach it only via the dynamic import inside
 * useDocumentCompile, which keeps jszip and any future WASM runtime out
 * of the main bundle.
 *
 * Entry point: compileTypst(compiledInput, options) → Promise<Blob>
 */

import JSZip from 'jszip'

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile walker output into a Typst bundle Blob.
 *
 * @param {Object} input - Output of compileOutputs(store, 'typst').
 * @param {Object[][]} input.sections
 * @param {Object[]|null} [input.header]
 * @param {Object[]|null} [input.footer]
 * @param {Object|null} [input.metadata] - Plain data object from the
 *   `role: 'metadata'` registration (title, author, isbn, …).
 * @param {Object} [options]
 * @param {'sources'|'server'|'wasm'} [options.mode='sources'] - Compile mode.
 * @param {string} [options.preamble] - Foundation-supplied preamble.typ
 *   content (named functions like chapter-opener, asterism, etc.).
 * @param {string} [options.template] - Foundation-supplied template.typ
 *   content (page geometry, fonts, show rules).
 * @param {Object} [options.meta] - Additional metadata to merge over the
 *   `metadata` registration (options.meta wins).
 * @returns {Promise<Blob>}
 */
export async function compileTypst(input, options = {}) {
    const { mode = 'sources', ...rest } = options

    const bundle = buildBundle(input, rest)

    if (mode === 'sources') {
        return zipBundle(bundle)
    }

    if (mode === 'server') {
        return compileServerSide(bundle, rest)
    }

    if (mode === 'wasm') {
        throw new Error(
            `Typst adapter: mode "wasm" is not yet implemented. ` +
                `@myriaddreamin/typst.ts currently emits SVG/vector rather than PDF bytes; ` +
                `direct browser PDF compile is on the roadmap.`,
        )
    }

    throw new Error(
        `Typst adapter: unknown mode "${mode}". ` +
            `Valid modes: 'sources' (ZIP of .typ files), 'server' (POST bundle to endpoint, receive PDF).`,
    )
}

/**
 * Server mode: POST the bundle to an endpoint that runs `typst compile`
 * and returns a PDF. The endpoint is provided via options.endpoint (full
 * URL or path-relative string). The default Vite dev plugin at
 * @uniweb/press/vite-plugin-typst answers at /__press/typst/compile, so
 * that's the default when no endpoint is given.
 *
 * Wire protocol: multipart/form-data with one field per bundle file,
 * using the filename as the field name. The server reassembles the
 * bundle into a temp directory, runs `typst compile main.typ`, and
 * returns the compiled PDF as application/pdf.
 *
 * See src/vite-plugin-typst.js for the reference implementation.
 */
async function compileServerSide(bundle, options = {}) {
    const endpoint = options.endpoint || '/__press/typst/compile'

    const form = new FormData()
    for (const [name, contents] of Object.entries(bundle)) {
        form.append(name, new Blob([contents], { type: 'text/plain' }), name)
    }

    let res
    try {
        res = await fetch(endpoint, { method: 'POST', body: form })
    } catch (err) {
        throw new Error(
            `Typst adapter (server mode): request to ${endpoint} failed. ` +
                `Is the dev server (or your compile endpoint) running? ` +
                `Original error: ${err.message || err}`,
        )
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '(no body)')
        throw new Error(
            `Typst adapter (server mode): ${endpoint} returned ${res.status} ${res.statusText}.\n${text}`,
        )
    }

    const blob = await res.blob()
    // Force application/pdf regardless of what the server sent, so the
    // Blob round-trips through triggerDownload with the right MIME.
    return blob.type === 'application/pdf'
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
}

/**
 * Build the in-memory Typst bundle. Exported for testing — callers that
 * want to inspect the emitted source before zipping can use this directly.
 *
 * @returns {{ [filename: string]: string }} Map of path → source content.
 */
export function buildBundle(input, options = {}) {
    const {
        sections = [],
        header = null, // TODO Phase 2: wire into template.typ header hook
        footer = null, // TODO Phase 2: wire into template.typ footer hook
        metadata = null,
    } = input

    const {
        preamble = DEFAULT_PREAMBLE,
        template = DEFAULT_TEMPLATE,
        meta: metaOverride = {},
    } = options

    // Merge: metadata role (document-level) + options.meta (call-site override)
    const resolvedMeta = { ...(metadata || {}), ...metaOverride }

    return {
        'main.typ': emitMain(),
        'meta.typ': emitMeta(resolvedMeta),
        'content.typ': emitContent(sections),
        'preamble.typ': preamble,
        'template.typ': template,
    }
}

// ============================================================================
// Bundle serialisation
// ============================================================================

async function zipBundle(bundle) {
    const zip = new JSZip()
    for (const [path, content] of Object.entries(bundle)) {
        zip.file(path, content)
    }
    return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

// ============================================================================
// main.typ — stable entry
// ============================================================================

function emitMain() {
    return [
        '// Auto-generated by @uniweb/press/typst.',
        '// Do not edit by hand — re-run the book build to regenerate.',
        '',
        '#import "template.typ": template',
        '#import "preamble.typ": *',
        '#import "meta.typ": meta',
        '',
        '#show: template.with(meta: meta)',
        '',
        '#include "content.typ"',
        '',
    ].join('\n')
}

// ============================================================================
// meta.typ — document metadata as typst #let bindings
// ============================================================================

function emitMeta(meta) {
    const lines = [
        '// Document metadata. Generated from the role:"metadata" registration',
        '// in the book foundation\'s layout, merged with any options.meta',
        '// passed to compile(\'typst\', options).',
        '//',
        '// Exported as a single `meta` dictionary so templates can read',
        '// fields as `meta.title` or `meta.at("author", default: "")`.',
        '',
    ]

    // Known keys in stable emission order, for readability.
    const known = [
        'title',
        'subtitle',
        'author',
        'date',
        'language',
        'isbn',
        'identifier',
        'rights',
        'publisher',
        'subject',
        'description',
        'coverImage',
        'hook',
        'blurb',
        'tocDepth',
    ]

    // Build an ordered list of (key, value) pairs: known first, then the rest.
    const entries = []
    const seen = new Set()
    for (const key of known) {
        if (meta?.[key] != null) {
            entries.push([key, meta[key]])
            seen.add(key)
        }
    }
    for (const [key, value] of Object.entries(meta || {})) {
        if (seen.has(key)) continue
        entries.push([key, value])
    }

    // Guarantee toc_depth so templates can read it without defaulting.
    if (!seen.has('tocDepth') && meta?.toc_depth == null) {
        entries.push(['tocDepth', 2])
    }

    lines.push('#let meta = (')
    for (const [key, value] of entries) {
        lines.push(`  ${toTypstIdent(key)}: ${toTypstValue(value)},`)
    }
    lines.push(')')
    lines.push('')

    return lines.join('\n')
}

/**
 * Convert a JS key to a valid Typst identifier.
 * Camel-case (`coverImage`) → snake-case (`cover_image`) to match the
 * legacy metadata.yaml → meta.typ convention.
 */
function toTypstIdent(key) {
    return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
}

/**
 * Convert a JS value to a Typst literal.
 * Strings → quoted + escaped. Numbers → as-is. Booleans → true/false.
 * Arrays / objects → best-effort Typst dictionary / array syntax.
 * Null / undefined → `none`.
 */
function toTypstValue(value) {
    if (value == null) return 'none'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'string') return quoteTypstString(value)
    if (Array.isArray(value)) {
        return '(' + value.map(toTypstValue).join(', ') + ')'
    }
    if (typeof value === 'object') {
        const parts = Object.entries(value).map(
            ([k, v]) => `${toTypstIdent(k)}: ${toTypstValue(v)}`,
        )
        return '(' + parts.join(', ') + ')'
    }
    return 'none'
}

function quoteTypstString(s) {
    // Typst strings: double-quoted, backslash-escape " and \.
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

// ============================================================================
// content.typ — assembled from IR section arrays
// ============================================================================

function emitContent(sections) {
    const parts = [
        '// Book body. Assembled from registered section fragments in',
        '// registration order. Regenerated on every `compile(\'typst\')`.',
        '',
        // Typst `#include` inserts content in a separate scope, so imports',
        // from main.typ are not visible here. Import the preamble locally',
        // so that chapter-opener / section-break / friends resolve.',
        '#import "preamble.typ": *',
        '',
    ]

    sections.forEach((ir, index) => {
        parts.push(`// --- section ${index + 1} ---`)
        parts.push(irNodesToTypst(ir).trimEnd())
        parts.push('')
    })

    return parts.join('\n')
}

// ============================================================================
// IR → Typst source
// ============================================================================

/**
 * Walk an array of block-level IR nodes and concatenate their Typst
 * source with blank-line separators.
 */
function irNodesToTypst(nodes) {
    if (!nodes || !nodes.length) return ''
    const parts = []
    for (const node of nodes) {
        const emitted = blockNodeToTypst(node)
        if (emitted) parts.push(emitted)
    }
    return parts.join('\n\n') + '\n'
}

/**
 * Convert one block-level IR node to a chunk of Typst source.
 * Returns '' for unknown / unsupported node types (walker is additive —
 * new node types just need a new case here).
 */
function blockNodeToTypst(node) {
    if (!node || typeof node !== 'object') return ''

    switch (node.type) {
        case 'text':
            // Bare text appearing at block level (e.g., a table cell whose
            // content is a plain string). Emit the inline form.
            return inlineNodeToTypst(node)

        case 'link':
            return inlineNodeToTypst(node)

        case 'paragraph':
            return inlineChildrenToTypst(node.children || []).trim()

        case 'heading': {
            const level = clampLevel(Number(node.level) || 1)
            const marker = '='.repeat(level)
            const text = inlineChildrenToTypst(node.children || []).trim()
            return `${marker} ${text}`
        }

        case 'chapterOpener': {
            // Call into the foundation's preamble.
            const args = []
            if (node.number != null)
                args.push(`number: ${quoteTypstString(String(node.number))}`)
            if (node.title) args.push(`title: ${quoteTypstString(node.title)}`)
            if (node.subtitle)
                args.push(`subtitle: ${quoteTypstString(node.subtitle)}`)
            return `#chapter-opener(${args.join(', ')})`
        }

        case 'codeBlock': {
            const lang = node.language || ''
            // Pull raw text from text-child content. Text-inside-code is
            // preserved verbatim (no inline mark processing).
            const text = rawTextFromChildren(node.children || [])
            // Use Typst raw literal with three-backtick fence. Escape any
            // triple-backtick inside the text (rare but possible).
            const fence = '```'
            const safeText = text.replace(/```/g, '``​`')
            return `${fence}${lang}\n${safeText}\n${fence}`
        }

        case 'list': {
            const ordered = node.ordered === 'true' || node.ordered === true
            const marker = ordered ? '+' : '-'
            const lines = []
            for (const item of node.children || []) {
                if (!item || item.type !== 'listItem') continue
                // Item children are paragraphs / nested lists.
                const itemParts = (item.children || []).map(blockNodeToTypst)
                const firstLine = (itemParts[0] || '').split('\n')
                lines.push(`${marker} ${firstLine.join('\n  ')}`)
                for (let i = 1; i < itemParts.length; i++) {
                    // Indent follow-up blocks by two spaces to stay inside
                    // the list item scope.
                    lines.push(
                        '  ' + itemParts[i].split('\n').join('\n  '),
                    )
                }
            }
            return lines.join('\n')
        }

        case 'blockQuote': {
            const inner = (node.children || [])
                .map(blockNodeToTypst)
                .filter(Boolean)
                .join('\n\n')
            return `#quote(block: true)[${inner}]`
        }

        case 'image': {
            const src = node.src
            // Skip images with no resolvable URL — emitting #image("") makes
            // `typst compile` abort with a "failed to load file" error.
            // Books frequently end up with empty-src images when an asset
            // reference in the markdown didn't resolve (missing alt text
            // `![](...)`, placeholder URL, etc.). The web reader tolerates
            // this gracefully; the PDF shouldn't block compilation.
            if (!src) return ''
            const width = node.width
            const caption = node.caption
            const widthArg = width ? `, width: ${toTypstLength(width)}` : ''
            const imgCall = `image(${quoteTypstString(src)}${widthArg})`
            if (caption) {
                return `#figure(${imgCall}, caption: [${escapeTypstInline(caption)}])`
            }
            return `#${imgCall}`
        }

        case 'table': {
            const columns = Number(node.columns) || detectColumns(node)
            const rows = (node.children || []).filter(
                (c) => c.type === 'tableRow',
            )
            const cells = []
            for (const row of rows) {
                for (const cell of row.children || []) {
                    if (cell.type !== 'tableCell') continue
                    const cellText = (cell.children || [])
                        .map(blockNodeToTypst)
                        .filter(Boolean)
                        .join('\n')
                    cells.push(`[${cellText}]`)
                }
            }
            return `#table(\n  columns: ${columns},\n  ${cells.join(',\n  ')},\n)`
        }

        case 'asterism':
            return '#section-break()'

        case 'raw':
            return rawTextFromChildren(node.children || [])

        // Content wrappers: Sequence.jsx emits one. Walk through.
        case 'contentWrapper':
            return irNodesToTypst(node.children || []).trimEnd()

        default:
            // Unknown types: drop silently. Additive walker.
            return ''
    }
}

// ============================================================================
// Inline (paragraph children) → Typst source
// ============================================================================

function inlineChildrenToTypst(children) {
    return (children || []).map(inlineNodeToTypst).join('')
}

function inlineNodeToTypst(node) {
    if (!node || typeof node !== 'object') return ''

    if (node.type === 'text') {
        let text = escapeTypstInline(node.content || '')
        if (node.code === 'true') text = '`' + (node.content || '') + '`'
        if (node.bold === 'true') text = `*${text}*`
        if (node.italics === 'true') text = `_${text}_`
        if (node.underline && (node.underline === 'true' || typeof node.underline === 'object')) {
            text = `#underline[${text}]`
        }
        return text
    }

    if (node.type === 'link') {
        const href = node.href || ''
        const inner = inlineChildrenToTypst(node.children || [])
        return `#link(${quoteTypstString(href)})[${inner}]`
    }

    return ''
}

// ============================================================================
// Helpers
// ============================================================================

function clampLevel(n) {
    if (n < 1) return 1
    if (n > 6) return 6
    return n
}

function rawTextFromChildren(children) {
    return (children || [])
        .map((c) => {
            if (c?.type === 'text') return c.content || ''
            if (c?.children) return rawTextFromChildren(c.children)
            return ''
        })
        .join('')
}

function detectColumns(tableNode) {
    const firstRow = (tableNode.children || []).find(
        (c) => c?.type === 'tableRow',
    )
    if (!firstRow) return 1
    return (firstRow.children || []).filter((c) => c?.type === 'tableCell')
        .length
}

function toTypstLength(width) {
    // Numbers default to points; numeric strings default to points;
    // strings with a unit (pt, mm, cm, %, em, in, …) pass through.
    if (typeof width === 'number') return `${width}pt`
    const s = String(width)
    if (/^\d+(?:\.\d+)?$/.test(s)) return `${s}pt`
    return s
}

/**
 * Escape characters that have special meaning in Typst content mode.
 * The set here is conservative — we escape the markers Press builders
 * might accidentally emit via user text. Book prose is almost always
 * fine without escaping, but defensive escaping avoids surprises.
 */
function escapeTypstInline(s) {
    return String(s)
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/\$/g, '\\$')
        .replace(/#/g, '\\#')
        .replace(/@/g, '\\@')
        .replace(/</g, '\\<')
}

// ============================================================================
// Defaults — minimal templates usable without a foundation override
// ============================================================================

export const DEFAULT_PREAMBLE = `// Minimal default preamble.
// Book foundations should replace this with their own preamble.typ.
#let chapter-opener(number: none, title: "", subtitle: "") = {
  pagebreak(weak: true)
  v(2in)
  if number != none {
    align(center, text(size: 12pt, weight: "regular")[Chapter #number])
    v(0.5em)
  }
  align(center, text(size: 22pt, weight: "bold")[#title])
  if subtitle != "" {
    v(0.5em)
    align(center, text(size: 14pt, style: "italic")[#subtitle])
  }
  v(1em)
}

#let section-break() = {
  v(1em)
  align(center, text(size: 12pt, "⁂"))
  v(1em)
}
`

export const DEFAULT_TEMPLATE = `// Minimal default template.
// Book foundations should replace this with their own template.typ.
#let template(meta: (), doc) = [
  #set document(title: meta.title, author: meta.at("author", default: ""))

  #set page(
    width: 6in,
    height: 9in,
    margin: (inside: 0.75in, outside: 0.5in, top: 0.75in, bottom: 0.75in),
    numbering: "1",
  )

  #set text(size: 11pt, lang: "en", hyphenate: true)
  #set par(justify: true, leading: 0.7em, first-line-indent: 1.2em)

  #set heading(numbering: "1.")

  // Title page
  #page(header: none, footer: none, numbering: none)[
    #v(3in)
    #align(center, text(size: 24pt, weight: "bold")[#meta.title])
    #if meta.at("subtitle", default: "") != "" [
      #v(0.5em)
      #align(center, text(size: 14pt, style: "italic")[#meta.subtitle])
    ]
    #v(1em)
    #align(center, text(size: 14pt)[by #meta.at("author", default: "")])
  ]
  #pagebreak()

  // Table of contents
  #outline(indent: auto, depth: meta.at("toc_depth", default: 2))
  #pagebreak()

  #doc
]
`
