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

    return (
        <a data-type="internalHyperlink" data-anchor={href} href={href} {...props}>
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
