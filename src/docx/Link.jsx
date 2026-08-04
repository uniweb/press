/**
 * Link component for document output.
 *
 * Auto-detects external (http) vs internal (anchor) hyperlinks.
 *
 * @param {Object} props
 * @param {Object} props.data - Link data: { label, href }
 */

export default function Link({ data, ...props }) {
    if (!data) return null

    const { label, href } = typeof data === 'string' ? { label: data, href: data } : data

    if (!href) return null

    const isExternal = href.startsWith('http')

    if (isExternal) {
        return (
            <a
                data-type="externalHyperlink"
                data-link={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
            >
                <span data-type="text" data-style="Hyperlink">
                    {label || href}
                </span>
            </a>
        )
    }

    // The IR's anchor is a BARE bookmark name — `data-bookmark="x"` becomes
    // `<w:bookmarkStart w:name="x"/>` — so a documented `href: '#section-3'`
    // has to lose its '#' or `w:anchor="#section-3"` never matches
    // `w:name="section-3"` and Word resolves nothing. `href` keeps the
    // fragment form, which is what the browser preview needs.
    const anchor = href.startsWith('#') ? href.slice(1) : href

    return (
        <a data-type="internalHyperlink" data-anchor={anchor} href={href} {...props}>
            <span data-type="text" data-style="Hyperlink">
                {label || href}
            </span>
        </a>
    )
}

/**
 * Render an array of links. Convenience wrapper.
 */
export function Links({ data, dataProps = {} }) {
    if (!data || !data.length) return null

    return data.map((link, index) => <Link key={index} data={link} {...dataProps} />)
}
