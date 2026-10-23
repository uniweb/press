/**
 * Internal LaTeX format adapter.
 *
 * Walks the compile-pipeline output (src/ir/compile.js) — { sections,
 * header, footer, metadata } of IR node arrays — and produces a LaTeX
 * source bundle, in one of two modes:
 *
 *   sources (default) — return a ZIP Blob of the bundle; the user runs
 *     `latexmk -pdf main.tex` (or `pdflatex` / `xelatex` / `lualatex`)
 *     locally.
 *   server — POST the bundle to an endpoint that runs a TeX engine and
 *     returns a PDF (compileServerSide below). No reference endpoint
 *     ships; the caller supplies one.
 *
 * LaTeX has no realistic WASM path today (TeX-in-browser is heavier and
 * less mature than Typst-in-browser), so the frontend-first story is
 * carried by `sources` mode rather than by in-browser compilation.
 *
 * Bundle shape (sources mode):
 *
 *   main.tex         entry: \documentclass + preamble + \begin{document}
 *                     + \input{content} + \end{document}
 *   meta.tex         \def\unimeta@title{…} \def\unimeta@author{…} (one
 *                     macro per metadata field, namespaced to avoid
 *                     collisions with template macros)
 *   content.tex      assembled body — one "% --- section N ---" block
 *                     per registered section
 *   preamble.tex     foundation-supplied \usepackage stack + custom
 *                     command definitions (chapter-opener, asterism, …)
 *   template.tex     foundation-supplied \documentclass + page geometry
 *                     + show-style declarations (fontspec, geometry,
 *                     hyperref configuration, etc.)
 *   refs.bib         (when foundation supplies bibtex) — biblatex
 *                     bibliography records
 *   assets/          (when foundation supplies bytes) — images, the
 *                     foundation-shipped .cls file, etc., placed at
 *                     paths the foundation specifies via
 *                     adapterOptions.assets
 *
 * This module is internal. It is NOT listed in package.json's exports
 * field; consumers reach it only via the dynamic import inside
 * useDocumentCompile, which keeps jszip and any future TeX runtime out
 * of the main bundle.
 *
 * Mirrors src/adapters/typst.js end-to-end. The IR walker structure is
 * the same; only the emit functions differ (LaTeX commands instead of
 * Typst markup).
 *
 * Entry point: compileLatex(compiledInput, options) → Promise<Blob>
 */

import JSZip from 'jszip'
import { bundleInlineImages } from '../assets/inline-images.js'
import { RAW_BEGIN, RAW_END, markRawLatex } from '../latex/raw.js'

// Re-export so consumers reaching the adapter via the dynamic-import
// path also see markRawLatex. (Static foundations should import it
// from `@uniweb/press/latex` — the builders barrel — to avoid
// triggering the adapter's lazy load. This re-export is for
// completeness and tests.)
export { markRawLatex }

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile walker output into a LaTeX bundle Blob.
 *
 * @param {Object} input - Output of compileOutputs(store, 'latex').
 * @param {Object[][]} input.sections
 * @param {Object[]|null} [input.header]
 * @param {Object[]|null} [input.footer]
 * @param {Object|null} [input.metadata] - Plain data object from the
 *   `role: 'metadata'` registration (title, author, year, …).
 * @param {Object} [options]
 * @param {'sources'|'server'} [options.mode='sources'] - Compile mode.
 * @param {string} [options.preamble] - Foundation-supplied preamble.tex
 *   content (\usepackage stack, custom commands).
 * @param {string} [options.template] - Foundation-supplied template.tex
 *   content (\documentclass, geometry, fonts, hyperref).
 * @param {Object} [options.meta] - Additional metadata to merge over the
 *   `metadata` registration (options.meta wins).
 * @param {Object} [options.assets] - Extra bundle files keyed by path
 *   (path → Uint8Array | Blob | string). Foundation hands the adapter
 *   already-resolved bytes; the adapter just packs them.
 * @param {string} [options.endpoint] - Server-mode endpoint URL.
 * @returns {Promise<Blob>}
 */
export async function compileLatex(input, options = {}) {
    const { mode = 'sources', loadAsset, ...rest } = options

    // Fetch inline body images and rewrite their IR src to a bundle-local
    // assets/<hash>.<ext> path, then merge the bytes into the bundle so
    // latexmk/pdflatex resolves \includegraphics{...} against the extracted
    // sources. Cover art arrives pre-bundled in rest.assets via the
    // foundation's getOptions; this handles document-body images.
    const inlineImageAssets = await bundleInlineImages(input, loadAsset)
    const bundle = buildBundle(input, {
        ...rest,
        assets: { ...(rest.assets || {}), ...inlineImageAssets },
    })

    if (mode === 'sources') {
        return zipBundle(bundle)
    }

    if (mode === 'server') {
        return compileServerSide(bundle, rest)
    }

    throw new Error(
        `LaTeX adapter: unknown mode "${mode}". ` +
            `Valid modes: 'sources' (ZIP of .tex files), 'server' (POST bundle to endpoint, receive PDF).`,
    )
}

/**
 * Server mode: POST the bundle to an endpoint that runs `latexmk` (or
 * `pdflatex` etc.) and returns a PDF. Mirrors the typst adapter's
 * server-mode wire protocol — multipart/form-data with one field per
 * bundle file, using the filename as the field name.
 *
 * No reference dev plugin ships today; foundations or hosts that want
 * server mode supply their own endpoint. See
 * docs/architecture/deployment.md for the wire-protocol contract.
 */
async function compileServerSide(bundle, options = {}) {
    const endpoint = options.endpoint || '/__press/latex/compile'

    const form = new FormData()
    for (const [name, contents] of Object.entries(bundle)) {
        if (contents instanceof Blob) {
            form.append(name, contents, name)
        } else if (
            contents instanceof Uint8Array ||
            contents instanceof ArrayBuffer
        ) {
            form.append(
                name,
                new Blob([contents], { type: 'application/octet-stream' }),
                name,
            )
        } else {
            form.append(name, new Blob([contents], { type: 'text/plain' }), name)
        }
    }

    let res
    try {
        res = await fetch(endpoint, { method: 'POST', body: form })
    } catch (err) {
        throw new Error(
            `LaTeX adapter (server mode): request to ${endpoint} failed. ` +
                `Is the dev server (or your compile endpoint) running? ` +
                `Original error: ${err.message || err}`,
        )
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '(no body)')
        throw new Error(
            `LaTeX adapter (server mode): ${endpoint} returned ${res.status} ${res.statusText}.\n${text}`,
        )
    }

    const blob = await res.blob()
    return blob.type === 'application/pdf'
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })
}

/**
 * Build the in-memory LaTeX bundle. Exported for testing — callers that
 * want to inspect the emitted source before zipping can use this directly.
 *
 * @returns {{ [filename: string]: string | Uint8Array | Blob }}
 */
export function buildBundle(input, options = {}) {
    const {
        sections = [],
        header = null, // TODO Phase 2: wire into template.tex header hook
        footer = null, // TODO Phase 2: wire into template.tex footer hook
        metadata = null,
    } = input

    const {
        preamble = DEFAULT_PREAMBLE,
        template = DEFAULT_TEMPLATE,
        meta: metaOverride = {},
        assets = {}, // extra bundle files (path → Uint8Array / Blob / string)
    } = options

    // Merge: metadata role (document-level) + options.meta (call-site override)
    const resolvedMeta = { ...(metadata || {}), ...metaOverride }

    return {
        'main.tex': emitMain(),
        'meta.tex': emitMeta(resolvedMeta),
        'content.tex': emitContent(sections),
        'preamble.tex': preamble,
        'template.tex': template,
        ...assets,
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
// main.tex — stable entry
// ============================================================================

function emitMain() {
    return [
        '% Auto-generated by @uniweb/press/latex.',
        '% Do not edit by hand — re-run the document build to regenerate.',
        '%',
        '% template.tex declares \\documentclass and the document-shape',
        '% packages (geometry, fontspec, hyperref, biblatex, etc.).',
        '% preamble.tex declares custom commands and macros the body uses',
        '% (e.g. \\chapteropener, \\sectionbreak).',
        '% meta.tex defines \\unimeta@title / \\unimeta@author / … macros',
        '% the template can read.',
        '',
        '\\input{template}',
        '\\input{preamble}',
        '\\input{meta}',
        '',
        '\\begin{document}',
        '',
        '\\input{content}',
        '',
        '\\end{document}',
        '',
    ].join('\n')
}

// ============================================================================
// meta.tex — document metadata as namespaced LaTeX macros
// ============================================================================

function emitMeta(meta) {
    const lines = [
        '% Document metadata. Generated from the role:"metadata" registration',
        '% in the foundation\'s layout, merged with any options.meta passed',
        '% to compile(\'latex\', options).',
        '%',
        '% Each field is exposed as \\unimeta@<key>; templates read these',
        '% via \\title{\\unimeta@title}, \\author{\\unimeta@author}, etc.',
        '% Camel-case JS keys map to lowercase LaTeX macro names so the',
        '% TeX engine accepts them as control sequences (no @ in the body).',
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

    // Templates can rely on tocDepth always being defined.
    if (!seen.has('tocDepth') && meta?.toc_depth == null) {
        entries.push(['tocDepth', 2])
    }

    lines.push('\\makeatletter')
    for (const [key, value] of entries) {
        lines.push(`\\def\\unimeta@${toLatexIdent(key)}{${escapeLatexInline(stringifyMetaValue(value))}}`)
    }
    lines.push('\\makeatother')
    lines.push('')

    return lines.join('\n')
}

/**
 * Convert a JS key to a LaTeX-safe macro identifier suffix. LaTeX
 * control sequences (post-\makeatletter) accept letters and @; we also
 * lowercase camelCase for readability (`coverImage` → `coverimage`).
 */
function toLatexIdent(key) {
    return key.replace(/[A-Z]/g, (m) => m.toLowerCase()).replace(/[^a-z@]/gi, '')
}

/**
 * Stringify a metadata value for emission as the body of a \def macro.
 * Strings → as-is. Numbers/booleans → toString. Arrays/objects →
 * comma-joined first-level values (rare for meta; templates that want
 * structured metadata should request it via separate fields).
 */
function stringifyMetaValue(value) {
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
        return value.map(stringifyMetaValue).filter(Boolean).join(', ')
    }
    if (typeof value === 'object') {
        return Object.entries(value)
            .map(([k, v]) => `${k}: ${stringifyMetaValue(v)}`)
            .join('; ')
    }
    return ''
}

// ============================================================================
// content.tex — assembled from IR section arrays
// ============================================================================

function emitContent(sections) {
    const parts = [
        '% Document body. Assembled from registered section fragments in',
        '% registration order. Regenerated on every compile(\'latex\').',
        '',
    ]

    sections.forEach((ir, index) => {
        parts.push(`% --- section ${index + 1} ---`)
        parts.push(irNodesToLatex(ir).trimEnd())
        parts.push('')
    })

    return parts.join('\n')
}

// ============================================================================
// IR → LaTeX source
// ============================================================================

/**
 * Walk an array of block-level IR nodes and concatenate their LaTeX
 * source with blank-line separators.
 */
function irNodesToLatex(nodes) {
    if (!nodes || !nodes.length) return ''
    const parts = []
    for (const node of nodes) {
        const emitted = blockNodeToLatex(node)
        if (emitted) parts.push(emitted)
    }
    return parts.join('\n\n') + '\n'
}

/**
 * Convert one block-level IR node to a chunk of LaTeX source.
 * Returns '' for unknown / unsupported node types (walker is additive —
 * new node types just need a new case here).
 */
function blockNodeToLatex(node) {
    if (!node || typeof node !== 'object') return ''

    switch (node.type) {
        case 'text':
            return inlineNodeToLatex(node)

        case 'link':
            return inlineNodeToLatex(node)

        case 'math':
            // Bare math at block level (not wrapped in a paragraph). The
            // inline emitter already produces the right `\[…\]` shape
            // for display:true.
            return inlineNodeToLatex(node)

        case 'paragraph':
            return inlineChildrenToLatex(node.children || []).trim()

        case 'heading': {
            const level = clampLevel(Number(node.level) || 1)
            const cmd = HEADING_CMD_BY_LEVEL[level]
            const text = inlineChildrenToLatex(node.children || []).trim()
            // \label{id} immediately follows the heading command so
            // \autoref{id} resolves to the heading's number. id flows
            // from the {#sec-id} markdown attribute through the
            // semantic parser and the Sequence walker (preserved on
            // <Heading id=…>) to the IR's data-id attribute.
            const label = node.id ? `\n\\label{${node.id}}` : ''
            return `\\${cmd}{${text}}${label}`
        }

        case 'chapterOpener': {
            // Foundation's preamble.tex defines \chapteropener{number}{title}{subtitle}.
            // Empty arguments are acceptable; the foundation decides how to
            // render them. Numeric `number` is stringified — LaTeX takes a
            // brace group either way.
            const number = node.number != null ? String(node.number) : ''
            const title = node.title || ''
            const subtitle = node.subtitle || ''
            return `\\chapteropener{${escapeLatexInline(number)}}{${escapeLatexInline(title)}}{${escapeLatexInline(subtitle)}}`
        }

        case 'codeBlock': {
            // verbatim is in core LaTeX (no package needed). lstlisting /
            // minted are optional upgrades the foundation can layer in via
            // preamble; emitting verbatim keeps the source compilable on
            // any TeX install.
            const text = rawTextFromChildren(node.children || [])
            return `\\begin{verbatim}\n${text}\n\\end{verbatim}`
        }

        case 'list': {
            const ordered = node.ordered === 'true' || node.ordered === true
            const env = ordered ? 'enumerate' : 'itemize'
            const items = []
            for (const item of node.children || []) {
                if (!item || item.type !== 'listItem') continue
                const itemParts = (item.children || [])
                    .map(blockNodeToLatex)
                    .filter(Boolean)
                if (itemParts.length === 0) {
                    items.push('  \\item')
                    continue
                }
                const [first, ...rest] = itemParts
                // Indent follow-up blocks by two spaces to keep them
                // visually inside the item — LaTeX itself doesn't care
                // about indentation, but it makes the source readable.
                const firstLines = first.split('\n')
                const indentedFirst = `  \\item ${firstLines[0]}`
                const indentedRest = firstLines
                    .slice(1)
                    .map((l) => `  ${l}`)
                    .join('\n')
                const blockTail = rest
                    .map((b) => b.split('\n').map((l) => `  ${l}`).join('\n'))
                    .join('\n')
                items.push(
                    [indentedFirst, indentedRest, blockTail]
                        .filter(Boolean)
                        .join('\n'),
                )
            }
            return `\\begin{${env}}\n${items.join('\n')}\n\\end{${env}}`
        }

        case 'blockQuote': {
            const inner = (node.children || [])
                .map(blockNodeToLatex)
                .filter(Boolean)
                .join('\n\n')
            return `\\begin{quotation}\n${inner}\n\\end{quotation}`
        }

        case 'image': {
            const src = node.src
            // Skip images with no resolvable URL — emitting
            // \includegraphics{} aborts pdflatex with "File `' not found".
            // The web reader tolerates empty src gracefully; the PDF
            // shouldn't block compilation either.
            if (!src) return ''
            const width = node.width
            const caption = node.caption
            const id = node.id
            const widthArg = width ? `[width=${toLatexLength(width)}]` : ''
            // Quote the path with braces so spaces / special characters
            // don't trip pdflatex's filename parser.
            const includeStmt = `\\includegraphics${widthArg}{${src}}`
            // \label has to land INSIDE the figure environment and AFTER
            // \caption — LaTeX scopes counter assignments to the
            // immediately preceding \refstepcounter, which \caption
            // triggers. Putting \label before \caption labels the
            // enclosing chapter/section instead of the figure.
            if (caption || id) {
                const lines = ['\\begin{figure}[htbp]', '  \\centering', `  ${includeStmt}`]
                if (caption) lines.push(`  \\caption{${escapeLatexInline(caption)}}`)
                if (id) lines.push(`  \\label{${id}}`)
                lines.push('\\end{figure}')
                return lines.join('\n')
            }
            return includeStmt
        }

        case 'table': {
            const columns = Number(node.columns) || detectColumns(node)
            const colSpec = 'l'.repeat(Math.max(1, columns))
            const rows = (node.children || []).filter(
                (c) => c.type === 'tableRow',
            )
            const formattedRows = []
            for (const row of rows) {
                const cells = []
                for (const cell of row.children || []) {
                    if (cell.type !== 'tableCell') continue
                    const cellText = (cell.children || [])
                        .map(blockNodeToLatex)
                        .filter(Boolean)
                        .join(' ')
                    cells.push(cellText)
                }
                if (cells.length > 0) formattedRows.push(cells.join(' & ') + ' \\\\')
            }
            return [
                `\\begin{tabular}{${colSpec}}`,
                `  \\hline`,
                ...formattedRows.map((r) => `  ${r}`),
                `  \\hline`,
                `\\end{tabular}`,
            ].join('\n')
        }

        case 'asterism':
            // Foundation's preamble.tex defines \sectionbreak. Default
            // (DEFAULT_PREAMBLE below) renders as three centered asterisks.
            return '\\sectionbreak'

        case 'raw':
            // Verbatim pass-through — Raw is the escape hatch for inline
            // LaTeX commands that don't have a builder yet (custom
            // environments, foundation-defined macros).
            return rawTextFromChildren(node.children || [])

        // Content wrappers: Sequence.jsx emits one. Walk through.
        case 'contentWrapper':
            return irNodesToLatex(node.children || []).trimEnd()

        default:
            // Unknown types: drop silently. Additive walker.
            return ''
    }
}

// LaTeX heading commands by level under \documentclass{book}. Level 1
// → chapter; deeper levels follow LaTeX's section hierarchy.
//
// `report` and `book` classes both have \chapter; `article` does not
// (use \section as the top level there). Foundations targeting an
// articleclass should override the template — but the IR-level mapping
// is book-class by default since this adapter ships alongside
// @uniweb/book.
const HEADING_CMD_BY_LEVEL = {
    1: 'chapter',
    2: 'section',
    3: 'subsection',
    4: 'subsubsection',
    5: 'paragraph',
    6: 'subparagraph',
}

// ============================================================================
// Inline (paragraph children) → LaTeX source
// ============================================================================

function inlineChildrenToLatex(children) {
    return (children || []).map(inlineNodeToLatex).join('')
}

function inlineNodeToLatex(node) {
    if (!node || typeof node !== 'object') return ''

    if (node.type === 'text') {
        const raw = node.content || ''
        // Code spans skip the body-text escape pass — \texttt arguments
        // inside the brace group still need the LaTeX-special characters
        // protected, but the underlying text is preserved verbatim
        // structurally (no markdown-like asterisks etc. survive here).
        if (node.code === 'true') return `\\texttt{${escapeLatexInline(raw)}}`

        let text = escapeLatexInline(raw)
        // Apply marks from innermost (text emphasis) outward (font weight).
        // The order doesn't matter semantically for LaTeX, but emit a
        // stable nesting so output diffs cleanly across runs.
        if (node.italics === 'true') text = `\\emph{${text}}`
        if (node.bold === 'true') text = `\\textbf{${text}}`
        if (
            node.underline &&
            (node.underline === 'true' || typeof node.underline === 'object')
        ) {
            text = `\\underline{${text}}`
        }
        return text
    }

    if (node.type === 'link') {
        const href = node.href || ''
        const inner = inlineChildrenToLatex(node.children || [])
        // \href is supplied by the hyperref package; templates load it.
        // The URL passes through unescaped — hyperref tolerates LaTeX-
        // special characters inside its first argument.
        return `\\href{${href}}{${inner}}`
    }

    if (node.type === 'math') {
        // LaTeX is its own native math source — pass through verbatim.
        // `$…$` for inline; `\[…\]` for display. The optional `\label{}`
        // makes the equation referenceable from elsewhere via `\ref{}`
        // / `\eqref{}`. The `amsmath` package (loaded by the standard
        // preamble) provides `\eqref`; bare `\ref` works without it.
        const display = node.display === 'true' || node.display === true
        const src = node.latex || ''
        const label = node.id ? `\\label{${node.id}}` : ''
        return display ? `\\[${src}${label}\\]` : `$${src}$${label}`
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

function toLatexLength(width) {
    // Numbers default to points; numeric strings default to points;
    // strings with a unit (pt, mm, cm, in, em, ex, %, …) pass through
    // with one substitution: CSS `%` becomes `\linewidth` since LaTeX
    // doesn't support `%` as a length unit.
    if (typeof width === 'number') return `${width}pt`
    const s = String(width).trim()
    if (/^\d+(?:\.\d+)?$/.test(s)) return `${s}pt`
    const pctMatch = /^(\d+(?:\.\d+)?)\s*%$/.exec(s)
    if (pctMatch) {
        const fraction = (Number(pctMatch[1]) / 100).toFixed(4).replace(/\.?0+$/, '')
        return `${fraction}\\linewidth`
    }
    return s
}


/**
 * The standard LaTeX body-text escape: & % $ # _ { } ~ ^ \ — plus < and
 * > which are not strictly special but are commonly typeset wrong
 * without an upright font (and the `\textless` / `\textgreater`
 * substitutions are safe in any class).
 *
 * Order matters: backslash must be replaced first so the substitution
 * commands we introduce afterwards don't get re-escaped.
 */
function escapeChunk(s) {
    return String(s)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/&/g, '\\&')
        .replace(/%/g, '\\%')
        .replace(/\$/g, '\\$')
        .replace(/#/g, '\\#')
        .replace(/_/g, '\\_')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/</g, '\\textless{}')
        .replace(/>/g, '\\textgreater{}')
}

/**
 * Escape body text, honouring raw-LaTeX sentinel sections. Foundations
 * mark verbatim LaTeX with `markRawLatex(s)` (or by wrapping with
 * RAW_BEGIN / RAW_END directly); the inner contents pass through
 * unescaped, and the sentinel characters are stripped on emission.
 *
 * Fast path (no sentinel present): identical to the simple escape.
 * Slow path (sentinels present): split into alternating regular / raw
 * segments, escape only the regular ones.
 */
function escapeLatexInline(s) {
    const str = String(s)
    if (!str.includes(RAW_BEGIN)) return escapeChunk(str)

    const parts = str.split(RAW_BEGIN)
    const out = [escapeChunk(parts[0])]
    for (let i = 1; i < parts.length; i++) {
        const seg = parts[i]
        const endIdx = seg.indexOf(RAW_END)
        if (endIdx === -1) {
            // Unterminated sentinel — defensive fallback, escape the
            // whole tail so we don't leak a bare U+E000 into output.
            out.push(escapeChunk(seg))
        } else {
            // Verbatim segment — emit unescaped.
            out.push(seg.slice(0, endIdx))
            // Anything after the closing sentinel is regular text again.
            out.push(escapeChunk(seg.slice(endIdx + 1)))
        }
    }
    return out.join('')
}

// ============================================================================
// Defaults — minimal templates usable without a foundation override
// ============================================================================

export const DEFAULT_PREAMBLE = `% Minimal default preamble.
% Foundations should replace this with their own preamble.tex.

% Asterism — three centered asterisks as a section break.
\\newcommand{\\sectionbreak}{%
  \\par\\bigskip\\centerline{\\Large *\\quad *\\quad *}\\bigskip\\par%
}

% Chapter opener — falls back to LaTeX's built-in \\chapter command when
% the foundation hasn't defined a richer renderer. Number argument is
% currently ignored (LaTeX numbers chapters automatically); subtitle is
% emitted as a small italicised line below the title when non-empty.
\\providecommand{\\chapteropener}[3]{%
  \\chapter{#2}%
  \\ifx&#3&\\else{\\par\\medskip\\noindent\\itshape #3\\par\\medskip}\\fi%
}
`

export const DEFAULT_TEMPLATE = `% Minimal default template.
% Foundations should replace this with their own template.tex.
\\documentclass[11pt]{book}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[a4paper, margin=1in]{geometry}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\hypersetup{colorlinks=true, linkcolor=black, urlcolor=blue!50!black}

\\setcounter{tocdepth}{2}
\\setcounter{secnumdepth}{2}
`
