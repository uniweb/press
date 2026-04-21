/**
 * End-to-end Phase-1 validation.
 *
 * 1. Read a chapter from writing/books/framework/ on disk.
 * 2. Run it through @uniweb/content-reader + @uniweb/semantic-parser to
 *    produce the exact content shape a Uniweb foundation would receive.
 * 3. Render the Press/typst Sequence walker over content.sequence.
 * 4. Drive the compile pipeline (IR walk + buildBundle) to emit the
 *    five-file Typst bundle.
 * 5. Write the bundle to a temp dir and run `typst compile main.typ`.
 * 6. Assert a non-empty PDF came out.
 *
 * This test is the Phase-1 "we can really produce a real PDF from a
 * real chapter" anchor. If it passes, the sources-mode flow is sound
 * end-to-end and the book foundation work in Phase-1/task-8 can proceed
 * confidently.
 *
 * Skipped when the `typst` binary is not in PATH.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { readFile, mkdtemp, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync, execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { htmlToIR } from '../../src/ir/parser.js'
import { buildBundle } from '../../src/adapters/typst.js'
import { ChapterOpener, Sequence } from '../../src/typst/index.js'
import { markdownToProseMirror } from '@uniweb/content-reader'
import { parseContent } from '@uniweb/semantic-parser'

function typstAvailable() {
    try {
        execSync('typst --version', { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

const HAS_TYPST = typstAvailable()

// Chapter 1 — prose-only, no code blocks. Small and representative.
const CHAPTER_PATH = resolve(
    __dirname,
    '../../../../writing/books/framework/pages/chapter-01-what-this-framework-is-for.md',
)

describe.skipIf(!existsSync(CHAPTER_PATH))(
    'e2e: framework book chapter → Typst sources → PDF',
    () => {
        let chapterSource
        let content

        beforeAll(async () => {
            chapterSource = await readFile(CHAPTER_PATH, 'utf8')
            const doc = markdownToProseMirror(chapterSource)
            content = parseContent(doc)
        })

        it('produces a plausible content shape from the markdown', () => {
            expect(content).toBeTruthy()
            expect(content.title).toMatch(/What This Framework/i)
            expect(Array.isArray(content.sequence)).toBe(true)
            expect(content.sequence.length).toBeGreaterThan(5)
            // The chapter has H2 subheadings and paragraphs.
            const types = new Set(content.sequence.map((n) => n.type))
            expect(types.has('heading')).toBe(true)
            expect(types.has('paragraph')).toBe(true)
        })

        it('emits valid-looking Typst content from the Sequence walker', () => {
            const jsx = (
                <>
                    <ChapterOpener number={1} title={content.title} />
                    <Sequence data={content.sequence} />
                </>
            )
            const html = ReactDOMServer.renderToStaticMarkup(jsx)
            const ir = htmlToIR(html)
            const bundle = buildBundle({
                sections: [ir],
                metadata: {
                    title: 'The Uniweb Framework',
                    author: 'Diego Macrini',
                },
            })

            expect(bundle['content.typ']).toContain('#chapter-opener(')
            expect(bundle['content.typ']).toContain('What This Framework')
            // Should have at least one heading (the H2 sections in the chapter).
            expect(bundle['content.typ']).toMatch(/^==\s+/m)
        })

        it.skipIf(!HAS_TYPST)(
            'compiles the bundle with the typst binary into a non-empty PDF',
            async () => {
                const jsx = (
                    <>
                        <ChapterOpener number={1} title={content.title} />
                        <Sequence data={content.sequence} />
                    </>
                )
                const html = ReactDOMServer.renderToStaticMarkup(jsx)
                const ir = htmlToIR(html)
                const bundle = buildBundle({
                    sections: [ir],
                    metadata: {
                        title: 'The Uniweb Framework',
                        author: 'Diego Macrini',
                    },
                })

                const dir = await mkdtemp(join(tmpdir(), 'press-typst-e2e-'))
                for (const [name, contents] of Object.entries(bundle)) {
                    await writeFile(join(dir, name), contents, 'utf8')
                }

                const pdfPath = join(dir, 'out.pdf')
                const result = spawnSync(
                    'typst',
                    ['compile', join(dir, 'main.typ'), pdfPath],
                    { encoding: 'utf8' },
                )

                if (result.status !== 0) {
                    // eslint-disable-next-line no-console
                    console.error('typst compile stderr:\n' + result.stderr)
                    console.error('typst compile stdout:\n' + result.stdout)
                    console.error('Bundle dir (for debugging):', dir)
                }
                expect(result.status).toBe(0)

                const pdfStat = await stat(pdfPath)
                expect(pdfStat.size).toBeGreaterThan(500)
            },
            30000,
        )
    },
)
