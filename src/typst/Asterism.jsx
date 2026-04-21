/**
 * Ornamental section break. Emits <div data-type="asterism"/>. The adapter
 * emits a call into the foundation's preamble:
 *
 *   #section-break()
 *
 * The foundation defines what the break looks like (three centered asterisks
 * by default, but the foundation can choose a different ornament).
 */
export default function Asterism({ ...props }) {
    return <div data-type="asterism" {...props} />
}
