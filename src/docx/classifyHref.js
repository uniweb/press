/**
 * Decide what SHAPE a link takes in the compiled document. INTERNAL helper —
 * not in the barrel.
 *
 * The whole rule: **a `#fragment` is an in-document anchor; everything else is
 * a destination, emitted verbatim.**
 *
 * ## Why that is the whole rule
 *
 * A fragment means "within this document" in every hypertext format, so this
 * is the one classification Press can make from the href alone without knowing
 * anything about the caller. Everything else — `https://…`, `mailto:…`,
 * `/about`, `../sibling`, `page:installation` — is a destination Press has no
 * standing to interpret.
 *
 * What this replaced was a guess: `href.startsWith('http')` treated everything
 * else as an in-document anchor, so `mailto:a@b.com` and `/about` compiled to
 * `<w:hyperlink w:anchor="mailto:a@b.com">` — a reference to a bookmark that
 * cannot exist. That does not merely fail to navigate: **an anchor name is not
 * a URL, so the destination is destroyed** and nothing downstream can recover
 * it. Emitting it as a destination keeps it in the file, where a wrong link is
 * at least visible and diagnosable.
 *
 * ## Why a bare name is NOT accepted as an anchor
 *
 * `section-3` and `page.html` are indistinguishable. Any rule that reads a bare
 * token as a bookmark name necessarily turns some page links into dead anchors
 * — which is the bug above. `#` is the disambiguator; that is what fragments
 * are for. An author writes `#section-3`.
 *
 * ## Resolution is NOT Press's job
 *
 * Press does not know what `page:installation` means and must not learn. That
 * is the same boundary the LaTeX inset helpers state for cite keys and xref
 * ids — *"Resolution stays foundation-side … the foundation passes
 * already-resolved keys in; Press's job is the emission shape"* — and the same
 * one `DocumentProvider` states for `basePath` (*"Press itself has no awareness
 * of the host runtime"*). Press declares no `@uniweb/*` dependency, and
 * resolving a framework reference here would mean duplicating a resolver that
 * lives in the runtime, which is how two implementations drift apart.
 *
 * So an unresolved `page:` reference compiles to a link pointing at the literal
 * string. That is intended: it is the caller's unresolved input, preserved
 * rather than swallowed. Callers compiling Uniweb content resolve authored
 * hrefs before handing strings to the builders.
 *
 * @param {string} href
 * @returns {{ anchor: string | null }} `anchor` is the bare bookmark name for
 *   an in-document reference, or null when the href is a destination.
 */
export function classifyHref(href) {
    if (!href || typeof href !== 'string') return { anchor: null }

    // The bookmark name carries no '#'. A paragraph's `data-bookmark="x"`
    // becomes `<w:bookmarkStart w:name="x"/>`, and Word matches
    // `<w:hyperlink w:anchor="x">` against that name, so the fragment marker
    // has to come off or the two never meet.
    if (href.startsWith('#')) return { anchor: href.slice(1) }

    return { anchor: null }
}
