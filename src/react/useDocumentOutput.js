/**
 * Hook for registering format-specific document output from a section
 * component.
 *
 * Replaces the legacy `block.output[format] = ...` mutation pattern.
 * Concurrent-React-safe and Strict-Mode-safe (idempotent registration).
 *
 * Usage:
 *
 *   function MySection({ block }) {
 *     const markup = <Paragraph>Hello</Paragraph>
 *     useDocumentOutput(block, 'docx', markup)
 *     return <Section>{markup}</Section>
 *   }
 *
 * The hook must be called inside a <DocumentProvider> subtree.
 *
 * @param {Object} block - The block instance (used as the WeakMap key).
 * @param {string} format - Format identifier ('docx', 'xlsx', 'pdf').
 * @param {any} fragment - The format-specific fragment. For docx, this is
 *   JSX that will be statically rendered and parsed to IR. For xlsx, this
 *   is a plain data object like { title, headers, data }.
 * @param {Object} [options] - Registration options.
 * @param {'header'|'footer'|'body'} [options.role='body'] - Role in the
 *   document (body, header, or footer).
 * @param {'all'|'first'|'odd'|'even'} [options.applyTo='all'] - For
 *   headers/footers: which pages the element applies to.
 */
import { useContext } from 'react'
import { DocumentContext } from './DocumentContext.js'

export function useDocumentOutput(block, format, fragment, options = {}) {
    const store = useContext(DocumentContext)
    if (!store) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                'useDocumentOutput was called outside of a <DocumentProvider>. ' +
                    'Document output will not be registered.',
            )
        }
        return
    }

    // Register during render. This is intentionally a side effect during
    // render (not in useEffect) because:
    //
    // 1. The registration must be synchronous — the walker needs outputs
    //    available immediately after React renders, not after effects flush.
    //
    // 2. It's idempotent — calling register with the same block+format
    //    overwrites the previous entry. Under Strict Mode double-render,
    //    both calls produce the same result.
    //
    // 3. The store is a WeakMap (external mutable state), not React state.
    //    Mutating it during render doesn't trigger re-renders.
    store.register(block, format, fragment, options)
}
