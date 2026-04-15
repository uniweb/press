/**
 * Shared context for document output registration.
 *
 * The context holds a WeakMap<block, Map<format, {fragment, options}>>
 * populated by useDocumentOutput and consumed by compileOutputs()
 * in src/ir/compile.js when a download is requested.
 *
 * Separated into its own module so both the provider and hook import the
 * same context object without circular dependencies.
 */
import { createContext } from 'react'

export const DocumentContext = createContext(null)
