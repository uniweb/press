/**
 * Layout wrapper for report sections. No data-type attribute — this is
 * purely a visual container for the preview. It is transparent to the
 * IR walker (only its children matter).
 *
 * Provides consistent max-width and padding matching the legacy report-sdk
 * Section component.
 */
export default function Section({ children, className = '', ...props }) {
    const base = 'mx-auto w-full max-w-4xl'
    const cn = className ? `${base} ${className}` : base

    return (
        <section className={cn} {...props}>
            {children}
        </section>
    )
}
