/**
 * Stage 3 — TextRun smallCaps / allCaps / strike props.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { Paragraph, TextRun } from '../../src/docx/index.js'
import { compileInvoice } from '../integration/invoice-fixtures/_harness.jsx'

describe('Stage 3: TextRun caps / strike', () => {
    it('emits <w:smallCaps/>', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph>
                <TextRun smallCaps>quietly</TextRun>
            </Paragraph>,
        )
        expect(documentXml).toMatch(/<w:smallCaps\b/)
    })

    it('emits <w:caps/> for allCaps', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph>
                <TextRun allCaps>shouted</TextRun>
            </Paragraph>,
        )
        expect(documentXml).toMatch(/<w:caps\b/)
    })

    it('emits <w:strike/>', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph>
                <TextRun strike>removed</TextRun>
            </Paragraph>,
        )
        expect(documentXml).toMatch(/<w:strike\b/)
    })

    it('emits <w:vertAlign w:val="subscript"/> for subscript', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph>
                <TextRun subscript>2</TextRun>
            </Paragraph>,
        )
        expect(documentXml).toMatch(/<w:vertAlign w:val="subscript"\/>/)
    })

    it('emits <w:vertAlign w:val="superscript"/> for superscript', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph>
                <TextRun superscript>2</TextRun>
            </Paragraph>,
        )
        expect(documentXml).toMatch(/<w:vertAlign w:val="superscript"\/>/)
    })
})
