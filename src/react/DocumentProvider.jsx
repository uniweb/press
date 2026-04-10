/**
 * Provider that holds document output registrations.
 *
 * Wrap a report page (or section of the page) in <DocumentProvider> to
 * enable the useDocumentOutput hook and DownloadButton.
 *
 * The provider holds a WeakMap<block, Map<format, OutputEntry>> and exposes
 * a register function and a getOutputs function. The WeakMap ensures that
 * if blocks are unmounted and garbage-collected, their registrations don't
 * leak.
 *
 * Usage:
 *
 *   <DocumentProvider>
 *     <SectionComponent block={block1} />
 *     <SectionComponent block={block2} />
 *     <DownloadButton format="docx" />
 *   </DocumentProvider>
 */
import { useMemo } from 'react'
import { DocumentContext } from './DocumentContext.js'

/**
 * @typedef {Object} OutputEntry
 * @property {any} fragment - The format-specific fragment (JSX for docx,
 *   data object for xlsx, etc.).
 * @property {Object} [options] - Registration options (role, applyTo, etc.).
 */

export default function DocumentProvider({ children }) {
    const store = useMemo(() => {
        /** @type {WeakMap<Object, Map<string, OutputEntry>>} */
        const outputs = new WeakMap()

        /**
         * Track all registered blocks in insertion order so the walker
         * can iterate them. WeakMap is not iterable, so we maintain a
         * parallel array. Blocks that are GC'd will still be in this
         * array as stale refs, but the walker filters them out.
         */
        const blockOrder = []

        return {
            /**
             * Register (or update) a format output for a block.
             * Called from useDocumentOutput during render.
             *
             * Idempotent: calling with the same block + format overwrites
             * the previous entry. This makes it safe under Strict Mode
             * double-render.
             *
             * @param {Object} block - The Block instance (WeakMap key).
             * @param {string} format - Format identifier ('docx', 'xlsx', etc.).
             * @param {any} fragment - The format-specific fragment.
             * @param {Object} [options] - Registration options.
             */
            register(block, format, fragment, options = {}) {
                let formatMap = outputs.get(block)
                if (!formatMap) {
                    formatMap = new Map()
                    outputs.set(block, formatMap)
                    blockOrder.push(block)
                }
                formatMap.set(format, { fragment, options })
            },

            /**
             * Get all registered outputs for a given format, in registration
             * order.
             *
             * @param {string} format
             * @returns {Array<{block: Object, fragment: any, options: Object}>}
             */
            getOutputs(format) {
                const result = []
                for (const block of blockOrder) {
                    const formatMap = outputs.get(block)
                    if (!formatMap) continue // stale ref (block was GC'd)
                    const entry = formatMap.get(format)
                    if (entry) {
                        result.push({ block, ...entry })
                    }
                }
                return result
            },

            /**
             * Clear all registrations. Useful for testing or when the
             * report page changes.
             */
            clear() {
                blockOrder.length = 0
            },
        }
    }, [])

    return (
        <DocumentContext.Provider value={store}>
            {children}
        </DocumentContext.Provider>
    )
}
