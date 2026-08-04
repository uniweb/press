/**
 * Link component for document output.
 *
 * Emits an in-document anchor for a `#fragment` and a destination for
 * everything else. See `classifyHref` for why that is the whole rule.
 *
 * @param {Object} props
 * @param {Object} props.data - Link data: { label, href }
 */
import { classifyHref } from './classifyHref.js'

export default function Link({ data, ...props }) {
    if (!data) return null

    const { label, href } = typeof data === 'string' ? { label: data, href: data } : data

    if (!href) return null

    const { anchor } = classifyHref(href)

    if (anchor !== null) {
        return (
            <a data-type="internalHyperlink" data-anchor={anchor} href={href} {...props}>
                <span data-type="text" data-style="Hyperlink">
                    {label || href}
                </span>
            </a>
        )
    }

    // `target`/`rel` only affect the React preview, never the compiled
    // document, so they stay on the narrower http test they have always
    // used — opening a mailto: or a site path in a new tab is not what
    // this component previously did and is not what this change is about.
    const offSite = href.startsWith('http')

    return (
        <a
            data-type="externalHyperlink"
            data-link={href}
            href={href}
            {...(offSite ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            {...props}
        >
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
