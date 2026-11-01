/**
 * A Word document keeps the space between two marks, which is a run of its own (`src/ir/parser.js`).
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import JSZip from 'jszip'
import { Packer } from 'docx'
import { buildDocument } from '../../src/adapters/docx.js'
import { htmlToIR } from '../../src/ir/parser.js'
import { Paragraph } from '../../src/docx/index.js'

async function documentXml(element) {
    const ir = htmlToIR(ReactDOMServer.renderToStaticMarkup(element))
    const doc = await buildDocument({ sections: [ir] })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    return zip.file('word/document.xml').async('string')
}

const runsOf = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1])

describe('two marks in Word', () => {
    it('keeps the space between them, as a run Word will not trim', async () => {
        const xml = await documentXml(<Paragraph data={'<strong>bold</strong> <em>italic</em>'} />)
        expect(runsOf(xml)).toEqual(['bold', ' ', 'italic'])
        expect(xml).toContain('<w:t xml:space="preserve"> </w:t>')
    })
})
