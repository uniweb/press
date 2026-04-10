/**
 * Shared context for document output registration.
 *
 * The context holds a WeakMap<block, Map<format, {fragment, options}>>
 * populated by useDocumentOutput and consumed by the orchestrator walker.
 *
 * Separated into its own module so both the provider and hook import the
 * same context object without circular dependencies.
 */
import { createContext } from 'react'

export const DocumentContext = createContext(null)
