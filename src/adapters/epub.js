/**
 * Internal EPUB3 format adapter.
 *
 * Consumes the 'html' passthrough shape shared with the Paged.js adapter —
 * `{ sections: string[], metadata }` — and produces a valid, reflowable
 * EPUB3 Blob. Each registered section becomes one chapter XHTML file in
 * the EPUB spine.
 *
 * Input-shape sharing: a foundation that wired `useDocumentOutput(block,
 * 'html', fragment)` for Paged.js gets EPUB for free — the adapter
 * descriptor declares `consumes: 'html', ir: false` (see
 * src/adapters/dispatch.js).
 *
 * Three EPUB envelope invariants this adapter upholds — the analogues of
 * the three docx image invariants. All three must hold or e-readers reject
 * the file:
 *
 *   1. `mimetype` is the FIRST entry in the ZIP and stored uncompressed
 *      (compression method 0). Readers sniff the first ~60 bytes.
 *   2. Every item in `<spine>` appears in `<manifest>` and vice versa.
 *      Mismatches trigger reader errors ("malformed package").
 *   3. Image paths in XHTML exactly match manifest paths including
 *      extension and case (XHTML paths are relative to `OEBPS/`).
 *
 * This module is internal. It is NOT listed in package.json's exports
 * field; consumers reach it only via the dynamic import inside
 * adapters/dispatch.js, which keeps jszip + the emitter out of the main
 * bundle until compile('epub') runs.
 */

import JSZip from 'jszip'
import { parseFragment } from 'parse5'
import { fetchAssets } from '../assets/fetch.js'

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile passthrough HTML output into an EPUB3 Blob.
 *
 * @param {Object} input - Output of compileOutputs(store, 'epub').
 * @param {string[]} input.sections - Rendered HTML strings in registration
 *   order, one per body fragment. Each becomes one spine chapter.
 * @param {Object|null} [input.metadata] - Plain data object from the
 *   `role: 'metadata'` registration (title, author, language, isbn, …).
 * @param {Object} [options]
 * @param {Object} [options.meta] - Additional metadata merged over the
 *   `metadata` registration (options.meta wins).
 * @param {string} [options.stylesheet] - Foundation-supplied CSS string
 *   written to `OEBPS/styles.css`. When omitted, DEFAULT_STYLESHEET is used.
 * @param {string} [options.identifier] - EPUB `dc:identifier`. When omitted,
 *   a UUID is generated at compile time.
 * @returns {Promise<Blob>}
 */
export async function compileEpub(input, options = {}) {
    const { sections = [], metadata = null } = input || {}
    const { meta = {}, stylesheet, identifier } = options

    const resolvedMeta = { ...(metadata || {}), ...meta }
    const css = stylesheet || DEFAULT_STYLESHEET
    const id = identifier || resolvedMeta.identifier || generateUuid()

    // Walk each HTML fragment, collect image URLs, capture a chapter title.
    // The parsed tree is kept so we can re-serialize as XHTML after
    // rewriting <img src> to manifest-relative paths.
    const chapters = sections.map((html, i) => buildChapter(html, i))

    // Deduplicate image URLs across all chapters and fetch them in parallel.
    // Failed fetches are logged and the original URL is left in place — the
    // EPUB still opens, the reader may or may not be able to resolve it.
    const imageUrls = new Set()
    for (const ch of chapters) {
        for (const url of ch.images) imageUrls.add(url)
    }
    const fetched = imageUrls.size
        ? await fetchAssets(imageUrls)
        : new Map()

    // Assign a manifest-relative path to every successfully-fetched image,
    // keyed by URL. Hash-based filenames dedupe identical images byte-for-byte.
    const imagesManifest = []
    const urlToPath = new Map()
    const seenPaths = new Set()
    for (const [url, result] of fetched) {
        if (result.error) {
            console.warn(`@uniweb/press epub: failed to fetch image ${url}: ${result.error.message}`)
            continue
        }
        const filename = `${result.hash}.${result.ext}`
        const path = `images/${filename}`
        urlToPath.set(url, path)
        if (!seenPaths.has(path)) {
            seenPaths.add(path)
            imagesManifest.push({
                id: `img-${result.hash}`,
                path,
                mime: result.mime || 'application/octet-stream',
                bytes: result.bytes,
            })
        }
    }

    // Second pass over chapters — rewrite <img src> to manifest paths and
    // serialize each as XHTML. Chapter paths live under `OEBPS/chapters/`
    // so images (under `OEBPS/images/`) resolve via `../images/...`.
    const chapterManifest = chapters.map((ch, i) => {
        rewriteImageSrcs(ch.tree, urlToPath, '../')
        const xhtml = wrapChapterXhtml({
            title: ch.title || resolvedMeta.title || `Chapter ${i + 1}`,
            language: resolvedMeta.language || 'en',
            body: serializeXhtml(ch.tree),
            stylesheetHref: '../styles.css',
        })
        return {
            id: `ch-${pad(i + 1)}`,
            path: `chapters/ch-${pad(i + 1)}.xhtml`,
            title: ch.title || `Chapter ${i + 1}`,
            xhtml,
        }
    })

    // Assemble the ZIP. mimetype must be first and STORED uncompressed —
    // invariant #1. JSZip's defaults are DEFLATE; override via compression.
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', {
        compression: 'STORE',
    })
    zip.file('META-INF/container.xml', buildContainerXml(), { compression: 'DEFLATE' })

    const oebps = zip.folder('OEBPS')
    oebps.file('content.opf', buildOpf({
        id,
        meta: resolvedMeta,
        chapters: chapterManifest,
        images: imagesManifest,
    }))
    oebps.file('nav.xhtml', buildNav({
        language: resolvedMeta.language || 'en',
        title: resolvedMeta.title || 'Contents',
        chapters: chapterManifest,
    }))
    oebps.file('toc.ncx', buildNcx({
        id,
        title: resolvedMeta.title || 'Book',
        chapters: chapterManifest,
    }))
    oebps.file('styles.css', css)

    for (const ch of chapterManifest) {
        oebps.file(ch.path, ch.xhtml)
    }
    for (const img of imagesManifest) {
        oebps.file(img.path, img.bytes)
    }

    const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
    })
    return blob
}

// ============================================================================
// Chapter parsing
// ============================================================================

/**
 * Parse one registered HTML string into a chapter descriptor:
 *   - tree:   parse5 fragment root (we re-serialize it as XHTML later)
 *   - title:  first heading text, used for nav + <title>
 *   - images: set of <img src> URLs found while walking
 */
function buildChapter(html, index) {
    const tree = parseFragment(html || '')
    const state = { title: '', images: new Set() }
    walkForChapterMeta(tree, state)
    return {
        tree,
        title: state.title,
        images: state.images,
        index,
    }
}

function walkForChapterMeta(node, state) {
    const children = node.childNodes || []
    for (const child of children) {
        if (child.nodeName === '#text') continue
        const tag = (child.tagName || '').toLowerCase()
        if (!state.title && (tag === 'h1' || tag === 'h2' || tag === 'h3')) {
            state.title = collectText(child).trim()
        }
        if (tag === 'img') {
            const src = getAttr(child, 'src')
            if (src && !/^data:/i.test(src)) state.images.add(src)
        }
        if (child.childNodes) walkForChapterMeta(child, state)
    }
}

function rewriteImageSrcs(node, urlToPath, pathPrefix) {
    const children = node.childNodes || []
    for (const child of children) {
        if (child.nodeName === '#text') continue
        const tag = (child.tagName || '').toLowerCase()
        if (tag === 'img') {
            const src = getAttr(child, 'src')
            const rewritten = src && urlToPath.get(src)
            if (rewritten) setAttr(child, 'src', pathPrefix + rewritten)
        }
        if (child.childNodes) rewriteImageSrcs(child, urlToPath, pathPrefix)
    }
}

function collectText(node) {
    if (node.nodeName === '#text') return node.value || ''
    let out = ''
    for (const child of node.childNodes || []) out += collectText(child)
    return out
}

function getAttr(node, name) {
    for (const attr of node.attrs || []) {
        if (attr.name === name) return attr.value
    }
    return null
}

function setAttr(node, name, value) {
    if (!node.attrs) node.attrs = []
    for (const attr of node.attrs) {
        if (attr.name === name) {
            attr.value = value
            return
        }
    }
    node.attrs.push({ name, value })
}

// ============================================================================
// XHTML serializer
// ============================================================================

/**
 * EPUB3 readers parse chapters as XML, not tag-soup HTML. The serializer
 * emits well-formed XHTML: void elements self-close, attributes are always
 * quoted, text content is entity-escaped, and tag names are lowercase.
 *
 * parse5's built-in serializer emits HTML (`<br>`, not `<br/>`), so we
 * walk the tree manually instead.
 */
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
])

export function serializeXhtml(node) {
    if (node.nodeName === '#text') return escapeXmlText(node.value || '')
    if (node.nodeName === '#document-fragment') {
        return (node.childNodes || []).map(serializeXhtml).join('')
    }
    const tag = (node.tagName || '').toLowerCase()
    if (!tag) {
        // Unknown container: spread children.
        return (node.childNodes || []).map(serializeXhtml).join('')
    }
    const attrs = serializeAttrs(node.attrs || [])
    if (VOID_ELEMENTS.has(tag)) {
        return `<${tag}${attrs}/>`
    }
    const inner = (node.childNodes || []).map(serializeXhtml).join('')
    return `<${tag}${attrs}>${inner}</${tag}>`
}

function serializeAttrs(attrs) {
    if (!attrs.length) return ''
    let out = ''
    for (const attr of attrs) {
        const name = attr.name
        const value = attr.value == null ? '' : String(attr.value)
        out += ` ${name}="${escapeXmlAttr(value)}"`
    }
    return out
}

function escapeXmlText(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function escapeXmlAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// ============================================================================
// EPUB envelope builders
// ============================================================================

function buildContainerXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
}

/**
 * EPUB3 package document. Declares metadata, manifest (every file under
 * OEBPS), and spine (ordered reading sequence).
 */
export function buildOpf({ id, meta, chapters, images }) {
    const title = meta.title || 'Untitled'
    const language = meta.language || 'en'
    const author = meta.author
    const publisher = meta.publisher
    const description = meta.description
    const subject = meta.subject
    const rights = meta.rights
    const modified = meta.date || new Date().toISOString().slice(0, 19) + 'Z'

    const metaLines = [
        `    <dc:identifier id="pub-id">${escapeXmlText(id)}</dc:identifier>`,
        `    <dc:title>${escapeXmlText(title)}</dc:title>`,
        `    <dc:language>${escapeXmlText(language)}</dc:language>`,
    ]
    if (author) metaLines.push(`    <dc:creator>${escapeXmlText(author)}</dc:creator>`)
    if (publisher) metaLines.push(`    <dc:publisher>${escapeXmlText(publisher)}</dc:publisher>`)
    if (description) metaLines.push(`    <dc:description>${escapeXmlText(description)}</dc:description>`)
    if (subject) metaLines.push(`    <dc:subject>${escapeXmlText(subject)}</dc:subject>`)
    if (rights) metaLines.push(`    <dc:rights>${escapeXmlText(rights)}</dc:rights>`)
    metaLines.push(`    <meta property="dcterms:modified">${escapeXmlText(modified)}</meta>`)

    const manifestLines = [
        `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
        `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
        `    <item id="css" href="styles.css" media-type="text/css"/>`,
    ]
    for (const ch of chapters) {
        manifestLines.push(
            `    <item id="${escapeXmlAttr(ch.id)}" href="${escapeXmlAttr(ch.path)}" media-type="application/xhtml+xml"/>`,
        )
    }
    for (const img of images) {
        manifestLines.push(
            `    <item id="${escapeXmlAttr(img.id)}" href="${escapeXmlAttr(img.path)}" media-type="${escapeXmlAttr(img.mime)}"/>`,
        )
    }

    const spineLines = chapters.map(
        (ch) => `    <itemref idref="${escapeXmlAttr(ch.id)}"/>`,
    )

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXmlAttr(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metaLines.join('\n')}
  </metadata>
  <manifest>
${manifestLines.join('\n')}
  </manifest>
  <spine toc="ncx">
${spineLines.join('\n')}
  </spine>
</package>
`
}

/**
 * EPUB3 navigation document. Primary TOC — replaces the NCX for EPUB3
 * readers but NCX is still emitted for EPUB2 compatibility.
 */
export function buildNav({ language, title, chapters }) {
    const items = chapters
        .map(
            (ch) =>
                `        <li><a href="${escapeXmlAttr(ch.path)}">${escapeXmlText(ch.title)}</a></li>`,
        )
        .join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttr(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXmlText(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${escapeXmlText(title)}</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>
`
}

/**
 * EPUB2 NCX navigation. Optional in EPUB3 but helpful for older e-readers.
 */
export function buildNcx({ id, title, chapters }) {
    const navPoints = chapters
        .map(
            (ch, i) => `    <navPoint id="${escapeXmlAttr(ch.id)}" playOrder="${i + 1}">
      <navLabel><text>${escapeXmlText(ch.title)}</text></navLabel>
      <content src="${escapeXmlAttr(ch.path)}"/>
    </navPoint>`,
        )
        .join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXmlAttr(id)}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${escapeXmlText(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>
`
}

/**
 * Wrap chapter body HTML in a valid XHTML document.
 */
export function wrapChapterXhtml({ title, language, body, stylesheetHref }) {
    const css = stylesheetHref
        ? `    <link rel="stylesheet" type="text/css" href="${escapeXmlAttr(stylesheetHref)}"/>\n`
        : ''
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttr(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXmlText(title)}</title>
${css}  </head>
  <body>
${body}
  </body>
</html>
`
}

// ============================================================================
// Helpers
// ============================================================================

function pad(n) {
    return String(n).padStart(2, '0')
}

function generateUuid() {
    if (globalThis.crypto?.randomUUID) {
        return 'urn:uuid:' + globalThis.crypto.randomUUID()
    }
    // RFC 4122 v4-ish fallback — 32 hex chars with dashes at the right places.
    const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
    return `urn:uuid:${rand()}${rand()}-${rand()}-4${rand().slice(1)}-a${rand().slice(1)}-${rand()}${rand()}${rand()}`
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_STYLESHEET = `/* Minimal EPUB3 stylesheet — foundations can override via options.stylesheet. */
body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.5;
  margin: 0 5%;
}
h1, h2, h3, h4, h5, h6 {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  line-height: 1.2;
  page-break-after: avoid;
}
h1 { font-size: 1.8em; margin-top: 2em; }
h2 { font-size: 1.4em; margin-top: 1.5em; }
h3 { font-size: 1.15em; margin-top: 1em; }
p { margin: 0 0 0.8em; text-indent: 1.25em; }
p:first-child, p.lead { text-indent: 0; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; text-align: center; }
figcaption { font-size: 0.9em; color: #555; }
blockquote {
  margin: 1em 1.5em;
  padding-left: 1em;
  border-left: 3px solid #ccc;
  color: #444;
}
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.92em; }
pre {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: #f5f5f5;
  padding: 0.75em;
  overflow: auto;
  white-space: pre-wrap;
}
`
