/**
 * Context carrying the site's base path (e.g. '/templates/monograph') so
 * Press builders can resolve site-absolute URLs (like '/images/hero.png')
 * against it. Kept separate from DocumentContext so existing consumers of
 * the output store are unaffected.
 *
 * Default '' means no prefix — builders render URLs verbatim.
 */
import { createContext } from 'react'

export const BasePathContext = createContext('')
