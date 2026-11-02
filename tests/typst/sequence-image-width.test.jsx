/**
 * A width on an image in content, as print reads it, in both lanes the walker feeds.
 *
 * A number with no unit is a size on a screen. It holds a picture's place on a web page, and it's
 * usually the file's own pixels, so read as points it draws past the edge of any page. Only a length
 * with a unit is meant for print.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildBundle as buildTypst } from '../../src/adapters/typst.js'
import { buildBundle as buildLatex } from '../../src/adapters/latex.js'
import { Image, Sequence } from '../../src/typst/index.js'

const ir = (element) => htmlToIR(ReactDOMServer.renderToStaticMarkup(element))
const typst = (element) => buildTypst({ sections: [ir(element)], metadata: null })['content.typ']
const latex = (element) => buildLatex({ sections: [ir(element)], metadata: null })['content.tex']

const picture = (attrs) => <Sequence data={[{ type: 'image', attrs: { url: '/photo.jpg', ...attrs } }]} />

describe('a width on an image in content', () => {
    it.each([
        ['a number', { width: 1919, height: 1143 }],
        ['a number as the markdown reads it', { width: '1919', height: '1143' }],
        ['pixels', { width: '1919px' }],
    ])('%s is a screen’s: the page decides', (_name, attrs) => {
        expect(typst(picture(attrs))).toContain('image("/photo.jpg")')
        expect(latex(picture(attrs))).toContain('\\includegraphics{/photo.jpg}')
    })

    it.each([
        ['a share of the line', '50%', 'width: 50%', '[width=0.5\\linewidth]'],
        ['a length', '10cm', 'width: 10cm', '[width=10cm]'],
    ])('%s is print’s', (_name, width, inTypst, inLatex) => {
        expect(typst(picture({ width }))).toContain(inTypst)
        expect(latex(picture({ width }))).toContain(inLatex)
    })

    it('CONTROL: a builder called directly still takes a number as points', () => {
        expect(typst(<Image src="/photo.jpg" width="400" />)).toContain('width: 400pt')
    })
})
