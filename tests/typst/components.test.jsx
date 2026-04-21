import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { htmlToIR } from '../../src/ir/parser.js'
import {
    TextRun,
    Paragraph,
    Paragraphs,
    Heading,
    H1,
    H2,
    ChapterOpener,
    CodeBlock,
    List,
    BulletList,
    NumberedList,
    BlockQuote,
    Image,
    Table,
    Asterism,
    Raw,
    Sequence,
} from '../../src/typst/index.js'

function renderToIR(element) {
    const html = ReactDOMServer.renderToStaticMarkup(element)
    return { html, ir: htmlToIR(html) }
}

describe('TextRun', () => {
    it('renders text with data-type="text"', () => {
        const { ir } = renderToIR(<TextRun>Hello</TextRun>)
        expect(ir[0]).toMatchObject({ type: 'text', content: 'Hello' })
    })

    it('renders bold, italics, code flags as data attributes', () => {
        const { ir } = renderToIR(
            <TextRun bold italics code>
                x
            </TextRun>,
        )
        expect(ir[0]).toMatchObject({
            type: 'text',
            bold: 'true',
            italics: 'true',
            code: 'true',
        })
    })
})

describe('Paragraph', () => {
    it('wraps children in a paragraph IR node', () => {
        const { ir } = renderToIR(
            <Paragraph>
                <TextRun>Hello</TextRun>
            </Paragraph>,
        )
        expect(ir[0].type).toBe('paragraph')
        expect(ir[0].children[0]).toMatchObject({
            type: 'text',
            content: 'Hello',
        })
    })

    it('parses inline marks from a data string', () => {
        const { ir } = renderToIR(
            <Paragraph data="Hello <strong>bold</strong> and <em>italic</em>." />,
        )
        const children = ir[0].children
        // Expect: text "Hello ", text "bold" (bold), text " and ",
        // text "italic" (italics), text "."
        const boldPart = children.find((c) => c.bold === 'true')
        const italicPart = children.find((c) => c.italics === 'true')
        expect(boldPart?.content).toBe('bold')
        expect(italicPart?.content).toBe('italic')
    })

    it('parses hyperlinks from a data string', () => {
        const { ir } = renderToIR(
            <Paragraph data='See <a href="https://example.com">the docs</a>.' />,
        )
        const link = ir[0].children.find((c) => c.type === 'link')
        expect(link).toBeTruthy()
        expect(link.href).toBe('https://example.com')
    })
})

describe('Paragraphs', () => {
    it('renders an array of paragraph strings', () => {
        const { ir } = renderToIR(
            <Paragraphs data={['One', 'Two', 'Three']} />,
        )
        expect(ir.filter((n) => n.type === 'paragraph')).toHaveLength(3)
    })

    it('renders null for empty data', () => {
        const { ir } = renderToIR(<Paragraphs data={[]} />)
        expect(ir).toEqual([])
    })
})

describe('Heading', () => {
    it('renders heading with level attribute', () => {
        const { ir } = renderToIR(<Heading level={2} data="Chapter Title" />)
        expect(ir[0].type).toBe('heading')
        expect(ir[0].level).toBe('2')
    })

    it('clamps level to 1–6', () => {
        const { ir: low } = renderToIR(<Heading level={0}>X</Heading>)
        const { ir: high } = renderToIR(<Heading level={9}>X</Heading>)
        expect(low[0].level).toBe('1')
        expect(high[0].level).toBe('6')
    })

    it('H1 and H2 shortcuts produce correct levels', () => {
        const { ir: h1 } = renderToIR(<H1>a</H1>)
        const { ir: h2 } = renderToIR(<H2>b</H2>)
        expect(h1[0].level).toBe('1')
        expect(h2[0].level).toBe('2')
    })
})

describe('ChapterOpener', () => {
    it('emits data-type="chapterOpener" with number, title, subtitle', () => {
        const { ir } = renderToIR(
            <ChapterOpener number={3} title="The Ecosystem" subtitle="Part II" />,
        )
        expect(ir[0]).toMatchObject({
            type: 'chapterOpener',
            number: '3',
            title: 'The Ecosystem',
            subtitle: 'Part II',
        })
    })
})

describe('CodeBlock', () => {
    it('emits codeBlock IR with language and text content', () => {
        const { ir } = renderToIR(
            <CodeBlock language="jsx">{'const x = 1'}</CodeBlock>,
        )
        expect(ir[0].type).toBe('codeBlock')
        expect(ir[0].language).toBe('jsx')
    })
})

describe('List', () => {
    it('renders bullet list from string items', () => {
        const { ir } = renderToIR(<BulletList items={['one', 'two']} />)
        expect(ir[0].type).toBe('list')
        expect(ir[0].ordered).toBeUndefined()
        expect(ir[0].children).toHaveLength(2)
        expect(ir[0].children[0].type).toBe('listItem')
    })

    it('renders numbered list with ordered flag', () => {
        const { ir } = renderToIR(<NumberedList items={['a']} />)
        expect(ir[0].type).toBe('list')
        expect(ir[0].ordered).toBe('true')
    })

    it('returns null for empty items', () => {
        const { ir } = renderToIR(<List items={[]} />)
        expect(ir).toEqual([])
    })
})

describe('BlockQuote', () => {
    it('emits blockQuote IR node', () => {
        const { ir } = renderToIR(
            <BlockQuote>
                <Paragraph>Quoted text.</Paragraph>
            </BlockQuote>,
        )
        expect(ir[0].type).toBe('blockQuote')
        expect(ir[0].children[0].type).toBe('paragraph')
    })
})

describe('Image', () => {
    it('emits image IR with src and alt', () => {
        const { ir } = renderToIR(
            <Image src="/photo.jpg" alt="photo" width="400" />,
        )
        expect(ir[0].type).toBe('image')
        expect(ir[0].src).toBe('/photo.jpg')
        expect(ir[0].width).toBe('400')
    })
})

describe('Table', () => {
    it('renders from headers + rows shape', () => {
        const { ir } = renderToIR(
            <Table
                headers={['A', 'B']}
                rows={[
                    ['1', '2'],
                    ['3', '4'],
                ]}
                columns={2}
            />,
        )
        expect(ir[0].type).toBe('table')
        expect(ir[0].columns).toBe('2')
        expect(ir[0].children).toHaveLength(3) // header row + 2 body rows
    })
})

describe('Asterism', () => {
    it('emits asterism IR node', () => {
        const { ir } = renderToIR(<Asterism />)
        expect(ir[0].type).toBe('asterism')
    })
})

describe('Raw', () => {
    it('emits raw IR node with text content', () => {
        const { ir } = renderToIR(<Raw>{'#my-function()'}</Raw>)
        expect(ir[0].type).toBe('raw')
        // child is a text node
        expect(ir[0].children[0]).toMatchObject({
            type: 'text',
            content: '#my-function()',
        })
    })
})

describe('Sequence', () => {
    it('walks a content.sequence array and emits one builder per element', () => {
        const sequence = [
            { type: 'heading', level: 2, text: 'Section' },
            { type: 'paragraph', text: 'Hello <strong>world</strong>.' },
            {
                type: 'codeBlock',
                text: 'const x = 1',
                attrs: { language: 'js' },
            },
            {
                type: 'list',
                style: 'bullet',
                children: ['one', 'two'],
            },
        ]

        const { ir } = renderToIR(<Sequence data={sequence} />)
        // Sequence wraps in a contentWrapper which the parser flattens,
        // so ir should be the flat inner elements.
        const types = ir.map((n) => n.type)
        expect(types).toEqual(['heading', 'paragraph', 'codeBlock', 'list'])
    })

    it('returns null for empty or missing data', () => {
        const { ir: empty } = renderToIR(<Sequence data={[]} />)
        const { ir: missing } = renderToIR(<Sequence data={null} />)
        expect(empty).toEqual([])
        expect(missing).toEqual([])
    })

    it('drops unknown element types silently', () => {
        const { ir } = renderToIR(
            <Sequence
                data={[
                    { type: 'paragraph', text: 'Keep me' },
                    { type: 'dataBlock', key: 'x' },
                    { type: 'video', attrs: {} },
                ]}
            />,
        )
        expect(ir).toHaveLength(1)
        expect(ir[0].type).toBe('paragraph')
    })
})
