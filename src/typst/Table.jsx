/**
 * Table. Accepts `headers: string[]` and `rows: string[][]` (each cell is a
 * styled-string). The adapter emits a Typst `#table(columns: N, [..], [..])`.
 *
 * Alternatively, pass children: <Tr><Td>…</Td></Tr> for manual composition.
 *
 * Emits <div> rather than <table>/<tr>/<td> so React doesn't inject an
 * implicit <tbody> between the table and its rows (which would break the
 * IR walker's expectation that tableRow children are direct).
 */
export function Table({ headers, rows, columns, children, ...props }) {
    const attrs = { 'data-type': 'table' }
    if (columns) attrs['data-columns'] = String(columns)

    if (headers || rows) {
        const headerRow = headers ? (
            <Tr header>
                {headers.map((h, i) => (
                    <Td key={i} data={h} header />
                ))}
            </Tr>
        ) : null
        const bodyRows = (rows || []).map((row, i) => (
            <Tr key={i}>
                {row.map((cell, j) => (
                    <Td key={j} data={cell} />
                ))}
            </Tr>
        ))

        return (
            <div {...attrs} {...props}>
                {headerRow}
                {bodyRows}
            </div>
        )
    }

    return (
        <div {...attrs} {...props}>
            {children}
        </div>
    )
}

export function Tr({ children, header, ...props }) {
    const attrs = { 'data-type': 'tableRow' }
    if (header) attrs['data-header'] = 'true'
    return (
        <div {...attrs} {...props}>
            {children}
        </div>
    )
}

export function Td({ data, header, children, ...props }) {
    const attrs = { 'data-type': 'tableCell' }
    if (header) attrs['data-header'] = 'true'

    return (
        <div {...attrs} {...props}>
            {data != null ? data : children}
        </div>
    )
}
