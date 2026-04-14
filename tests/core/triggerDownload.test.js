/**
 * Tests for triggerDownload — the DOM utility that turns a Blob into a
 * browser download.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { triggerDownload } from '../../src/triggerDownload.js'

describe('triggerDownload', () => {
    describe('in a browser (jsdom)', () => {
        let createObjectURLMock
        let revokeObjectURLMock
        let originalCreate
        let originalRevoke

        beforeEach(() => {
            // jsdom does not implement URL.createObjectURL; install mocks.
            createObjectURLMock = vi.fn(() => 'blob:fake')
            revokeObjectURLMock = vi.fn()
            originalCreate = URL.createObjectURL
            originalRevoke = URL.revokeObjectURL
            URL.createObjectURL = createObjectURLMock
            URL.revokeObjectURL = revokeObjectURLMock
        })

        afterEach(() => {
            URL.createObjectURL = originalCreate
            URL.revokeObjectURL = originalRevoke
            vi.restoreAllMocks()
        })

        it('creates an anchor, clicks it, and cleans up', () => {
            const clickSpy = vi.fn()
            const fakeAnchor = {
                href: '',
                download: '',
                click: clickSpy,
            }
            const createSpy = vi
                .spyOn(document, 'createElement')
                .mockImplementation((tag) => {
                    if (tag === 'a') return fakeAnchor
                    return createSpy.wrappedMethod
                        ? createSpy.wrappedMethod.call(document, tag)
                        : null
                })
            const appendSpy = vi
                .spyOn(document.body, 'appendChild')
                .mockImplementation((node) => node)
            const removeSpy = vi
                .spyOn(document.body, 'removeChild')
                .mockImplementation((node) => node)

            const blob = new Blob(['hello'], { type: 'text/plain' })
            triggerDownload(blob, 'hello.txt')

            expect(createObjectURLMock).toHaveBeenCalledWith(blob)
            expect(fakeAnchor.href).toBe('blob:fake')
            expect(fakeAnchor.download).toBe('hello.txt')
            expect(appendSpy).toHaveBeenCalledWith(fakeAnchor)
            expect(clickSpy).toHaveBeenCalledTimes(1)
            expect(removeSpy).toHaveBeenCalledWith(fakeAnchor)
            expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:fake')
        })
    })

    describe('in a non-browser environment', () => {
        it('is a no-op when document is undefined', () => {
            const originalDocument = globalThis.document
            // @ts-ignore — deliberately strip document
            delete globalThis.document
            try {
                expect(() =>
                    triggerDownload(new Blob(['x']), 'x.txt'),
                ).not.toThrow()
            } finally {
                globalThis.document = originalDocument
            }
        })
    })
})
