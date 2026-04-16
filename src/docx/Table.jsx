/**
 * Table, Tr, Td — ergonomic wrappers for Press's table vocabulary.
 *
 * Foundations that built tables before this existed hand-rolled <div>s
 * with data-type="table"/"tableRow"/"tableCell" attributes plus width,
 * margin, and border data attributes per cell. These components ship
 * sensible defaults and a shared column-widths channel, so the common
 * case reduces to:
 *
 *   <Table widths={[15, 60, 25]}>
 *     <Tr header>
 *       <Td>Period</Td>
 *       <Td>Project and source</Td>
 *       <Td>Amount</Td>
 *     </Tr>
 *     <Tr>
 *       <Td>1831–1836</Td>
 *       <Td>Voyage of the Beagle</Td>
 *       <Td>£450</Td>
 *     </Tr>
 *   </Table>
 *
 * Every data-* attribute set by default can be overridden by passing the
 * same attribute on the Td — explicit spreads win. String children are
 * wrapped in a Press <Paragraph> automatically; complex cells (multiple
 * paragraphs, inline <TextRun bold>) can pass React children.
 *
 * The emitted HTML is plain <div>s laid out with flexbox in the browser,
 * matching Press's existing table-as-flexbox convention — the docx
 * adapter walks the same data attributes regardless of element type.
 */
import {
    createContext,
    useContext,
    Children,
    cloneElement,
    isValidElement,
} from 'react'
import Paragraph from './Paragraph.jsx'
import TextRun from './TextRun.jsx'

const TableCtx = createContext({ widths: null, borderColor: 'cccccc' })

/**
 * Table — the outer wrapper.
 *
 * @param {Object} props
 * @param {number[]} [props.widths] - Column widths in percent; each Td reads its
 *   width by column index. Omit to let every cell declare its own width.
 * @param {string} [props.borderColor='cccccc'] - Hex (no #) for cell borders.
 */
export function Table({
    widths,
    borderColor = 'cccccc',
    className,
    children,
    ...props
}) {
    return (
        <TableCtx.Provider value={{ widths, borderColor }}>
            <div data-type="table" className={className} {...props}>
                {children}
            </div>
        </TableCtx.Provider>
    )
}

/**
 * Tr — a table row.
 *
 * Clones direct child <Td> elements to inject the column index so each
 * cell can look up its width from the Table context, and to mark cells
 * in a `header` row for the default emphasis + heavier bottom border.
 *
 * @param {Object} props
 * @param {boolean} [props.header=false] - Bolds text and thickens the border.
 */
export function Tr({ header = false, className, children, ...props }) {
    const cells = Children.toArray(children).map((child, idx) =>
        isValidElement(child)
            ? cloneElement(child, {
                  _col: child.props._col ?? idx,
                  _header: child.props._header ?? header,
              })
            : child,
    )
    return (
        <div data-type="tableRow" className={className} {...props}>
            {cells}
        </div>
    )
}

// Default cell padding (twips). ~4pt top/bottom, ~6pt left/right.
const CELL_PAD = { top: 80, bottom: 80, left: 120, right: 120 }

/**
 * Td — a table cell.
 *
 * Width resolution order: explicit `width` prop > `widths[_col]` from the
 * parent <Table> > unset (cell occupies natural width).
 *
 * String children are wrapped in a <Paragraph>. Headers get a bold
 * TextRun and a heavier bottom border by default. Any data-* attribute
 * passed in props wins over the defaults.
 *
 * @param {Object} props
 * @param {number} [props.width] - Column width in percent (overrides Table.widths).
 * @param {boolean} [props.emphasis=false] - Force bold regardless of header state.
 * @param {'single'|'double'|'none'|string} [props.borderBottom] - Bottom border style.
 */
export function Td({
    _col = 0,
    _header = false,
    width,
    emphasis = false,
    borderBottom,
    className,
    style,
    children,
    ...rest
}) {
    const { widths, borderColor } = useContext(TableCtx)
    const colWidth = width ?? widths?.[_col]

    const defaults = {
        'data-type': 'tableCell',
        'data-margins-top': CELL_PAD.top,
        'data-margins-bottom': CELL_PAD.bottom,
        'data-margins-left': CELL_PAD.left,
        'data-margins-right': CELL_PAD.right,
        'data-borders-top-style': 'none',
        'data-borders-left-style': 'none',
        'data-borders-right-style': 'none',
        'data-borders-bottom-style': borderBottom ?? 'single',
        'data-borders-bottom-size': _header ? 6 : 4,
        'data-borders-bottom-color': borderColor,
    }
    if (colWidth != null) {
        defaults['data-width-size'] = colWidth
        defaults['data-width-type'] = 'pct'
    }

    const flexStyle =
        colWidth != null
            ? { flex: `${colWidth} ${colWidth} 0%`, minWidth: 0, ...style }
            : style

    const isPrimitive = typeof children === 'string' || typeof children === 'number'
    const content = isPrimitive ? (
        <Paragraph>
            {emphasis || _header ? <TextRun bold>{children}</TextRun> : children}
        </Paragraph>
    ) : (
        children
    )

    return (
        <div className={className} style={flexStyle} {...defaults} {...rest}>
            {content}
        </div>
    )
}
