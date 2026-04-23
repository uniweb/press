/**
 * Guards the "empty body compile" footgun.
 *
 * When a Download button compiles a format whose input-shape key has no
 * registrations (typical cause: sections register for 'typst' but the
 * button compiles 'pagedjs', which reads 'html'), Press emits a
 * console.warn — catching the bug at click time instead of at "why is my
 * PDF empty" time.
 *
 * The warning is one-time per input-shape key per page (not per format),
 * so alias'd formats (pagedjs + future epub both consume 'html') don't
 * double-warn for the same missed registration.
 *
 * Each test resets the module graph via vi.resetModules so the private
 * per-key guard Set starts empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

async function freshImports() {
    // resetModules clears the in-memory module cache so the warning-guard
    // Set is re-created. Dynamic imports below pull the fresh copies.
    vi.resetModules()
    const { compileRegistrations } = await import(
        '../../src/compileRegistrations.js'
    )
    const { useDocumentOutput } = await import(
        '../../src/useDocumentOutput.js'
    )
    return { compileRegistrations, useDocumentOutput }
}

describe('empty-registrations warning', () => {
    let warnSpy
    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    it('warns with the input-shape key, not just the format, when format aliases a key', async () => {
        const { compileRegistrations } = await freshImports()
        // pagedjs consumes 'html'. With nothing registered under 'html',
        // the warning should name both: format 'pagedjs' and key 'html'.
        compileRegistrations(<div>nothing registers anything</div>, 'pagedjs')
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const msg = warnSpy.mock.calls[0][0]
        expect(msg).toMatch(/pagedjs/)
        expect(msg).toMatch(/'html'/)
        expect(msg).toMatch(/0 sections/)
    })

    it('uses the short form when the format equals its consumes key', async () => {
        const { compileRegistrations } = await freshImports()
        // typst self-aliases (consumes: 'typst'). Warning should skip the
        // "under input key 'X'" clause and use the simpler message.
        compileRegistrations(<div />, 'typst')
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const msg = warnSpy.mock.calls[0][0]
        expect(msg).toMatch(/typst/)
        expect(msg).not.toMatch(/under input key/)
    })

    it('does NOT warn when at least one section registered for the consumed key', async () => {
        const { compileRegistrations, useDocumentOutput } = await freshImports()
        function Section() {
            useDocumentOutput({}, 'html', <p>hello</p>)
            return null
        }
        compileRegistrations(<Section />, 'pagedjs')
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('only warns once per input key across multiple empty compiles', async () => {
        const { compileRegistrations } = await freshImports()
        compileRegistrations(<div />, 'pagedjs')
        compileRegistrations(<div />, 'pagedjs')
        expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('does NOT warn for unknown formats (runCompile throws instead)', async () => {
        const { compileRegistrations } = await freshImports()
        // An unknown format has no descriptor; warning is skipped so the
        // "Unsupported document format" error is the sole signal.
        compileRegistrations(<div />, 'bogus-unknown-format')
        expect(warnSpy).not.toHaveBeenCalled()
    })
})
