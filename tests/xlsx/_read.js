/**
 * Reads a compiled .xlsx back from its own bytes, so a test says what the file
 * says rather than what the writer meant. Every part goes through a strict XML
 * parser, so a part that is not well-formed fails the test that reads it.
 *
 * Not a test file: vitest picks up only `*.test.*`.
 */
import JSZip from 'jszip'

const BUILT_IN_FORMATS = {
    0: 'General',
    1: '0',
    2: '0.00',
    3: '#,##0',
    4: '#,##0.00',
    9: '0%',
    10: '0.00%',
    14: 'mm-dd-yy',
    49: '@',
}

// jsdom's Blob doesn't implement arrayBuffer(); FileReader is the reliable path.
function blobToUint8(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(blob)
    })
}

function parseXml(xml, path) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error(`${path} is not well-formed XML`)
    }
    return doc
}

const children = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : [])
const child = (el, name) => children(el, name)[0]
const attr = (el, name) => el?.getAttribute(name) ?? undefined
const textOf = (el) => el?.textContent ?? undefined

function readFont(el) {
    const color = attr(child(el, 'color'), 'rgb')
    return {
        bold: !!child(el, 'b'),
        italic: !!child(el, 'i'),
        underline: !!child(el, 'u'),
        strike: !!child(el, 'strike'),
        size: Number(attr(child(el, 'sz'), 'val')),
        name: attr(child(el, 'name'), 'val'),
        color,
    }
}

function readFill(el) {
    const pattern = child(el, 'patternFill')
    return { pattern: attr(pattern, 'patternType'), color: attr(child(pattern, 'fgColor'), 'rgb') }
}

function readBorder(el) {
    const border = {}
    for (const side of ['left', 'right', 'top', 'bottom']) {
        const edge = child(el, side)
        if (attr(edge, 'style')) border[side] = { style: attr(edge, 'style'), color: attr(child(edge, 'color'), 'rgb') }
    }
    return border
}

/**
 * @param {Blob} blob - What compileXlsx returned.
 * @returns {Promise<Object>} { bytes, paths, xml(path), doc(path), sheets, styleCounts, properties }
 */
export async function readXlsx(blob) {
    const bytes = await blobToUint8(blob)
    const zip = await JSZip.loadAsync(bytes)
    const paths = Object.keys(zip.files)

    const texts = {}
    const docs = {}
    for (const path of paths) {
        texts[path] = await zip.file(path).async('string')
        docs[path] = parseXml(texts[path], path)
    }

    const strings = [...docs['xl/sharedStrings.xml'].documentElement.children].map((si) => textOf(child(si, 't')))

    const stylesRoot = docs['xl/styles.xml'].documentElement
    const list = (name) => [...(child(stylesRoot, name)?.children ?? [])]
    const customFormats = Object.fromEntries(
        list('numFmts').map((n) => [attr(n, 'numFmtId'), attr(n, 'formatCode')]),
    )
    const [fonts, fills, borders, xfs] = ['fonts', 'fills', 'borders', 'cellXfs'].map(list)

    function readStyle(id) {
        const xf = xfs[Number(id ?? 0)]
        const numFmtId = attr(xf, 'numFmtId')
        const alignment = child(xf, 'alignment')
        return {
            numFmt: customFormats[numFmtId] ?? BUILT_IN_FORMATS[numFmtId],
            numFmtId: Number(numFmtId),
            font: readFont(fonts[Number(attr(xf, 'fontId'))]),
            fill: readFill(fills[Number(attr(xf, 'fillId'))]),
            border: readBorder(borders[Number(attr(xf, 'borderId'))]),
            alignment: alignment
                ? {
                      vertical: attr(alignment, 'vertical'),
                      horizontal: attr(alignment, 'horizontal'),
                      wrapText: attr(alignment, 'wrapText') === '1',
                  }
                : undefined,
        }
    }

    const relationships = [...docs['xl/_rels/workbook.xml.rels'].documentElement.children]
    const sheets = children(child(docs['xl/workbook.xml'].documentElement, 'sheets'), 'sheet').map((sheet) => {
        const target = relationships.find((r) => attr(r, 'Id') === attr(sheet, 'r:id'))
        const path = `xl/${attr(target, 'Target')}`
        const root = docs[path].documentElement
        const rows = children(child(root, 'sheetData'), 'row')

        return {
            name: attr(sheet, 'name'),
            path,
            xml: texts[path],
            root,
            /** The value, formula and style of a cell, or a null value where the file has none. */
            cell(ref) {
                const el = rows.flatMap((row) => children(row, 'c')).find((c) => attr(c, 'r') === ref)
                if (!el) return { value: null, formula: undefined, absent: true }
                const type = attr(el, 't')
                const raw = textOf(child(el, 'v'))
                let value = null
                if (raw !== undefined) {
                    if (type === 's') value = strings[Number(raw)]
                    else if (type === 'b') value = raw === '1'
                    else if (type === 'e' || type === 'str') value = raw
                    else value = Number(raw)
                }
                return { value, type, formula: textOf(child(el, 'f')), ...readStyle(attr(el, 's')) }
            },
            column(n) {
                const col = children(child(root, 'cols'), 'col').find((c) => attr(c, 'min') === String(n))
                if (!col) return undefined
                return {
                    width: Number(attr(col, 'width')),
                    numFmt: attr(col, 'style') ? readStyle(attr(col, 'style')).numFmt : undefined,
                }
            },
            row(n) {
                const row = rows.find((r) => attr(r, 'r') === String(n))
                return { height: attr(row, 'ht') ? Number(attr(row, 'ht')) : undefined }
            },
            paperSize: attr(child(root, 'pageSetup'), 'paperSize'),
            selected: attr(child(child(root, 'sheetViews'), 'sheetView'), 'tabSelected') === '1',
        }
    })

    const core = docs['docProps/core.xml']
    const coreText = (name) => textOf(core.getElementsByTagName(name)[0])

    return {
        bytes,
        paths,
        xml: (path) => texts[path],
        doc: (path) => docs[path],
        sheets,
        strings,
        stylesRoot,
        styleCounts: { xfs: xfs.length, fonts: fonts.length, fills: fills.length, borders: borders.length },
        readFill,
        fills,
        properties: {
            title: coreText('dc:title'),
            subject: coreText('dc:subject'),
            creator: coreText('dc:creator'),
            keywords: coreText('cp:keywords'),
            description: coreText('dc:description'),
            created: coreText('dcterms:created'),
            company: textOf(docs['docProps/app.xml'].getElementsByTagName('Company')[0]),
        },
    }
}
