# The `xlsx` fragment

A section registers a spreadsheet as a plain object, one sheet per registration. There is no builder subpath, and no spreadsheet library behind it: Press writes the workbook itself.

```jsx
import { useDocumentOutput } from '@uniweb/press'

useDocumentOutput(block, 'xlsx', {
    title: 'Funding',
    headers: ['Source', 'Grants', 'Total'],
    data: rows.map((r) => [r.source, r.count, r.total]),
    columnWidths: [30, 10, 16],
    numberFormats: ['text', 'number', 'currency'],
    totals: ['Total', 'sum', 'sum'],
})
```

Then `compile('xlsx', options)` returns the workbook as a Blob. Registering `null` leaves the sheet out.

## The sheet

| Field | Meaning |
|---|---|
| `title` | The tab's name. Adjusted to Excel's rules: see [What Press adjusts](#what-press-adjusts). |
| `headers` | The first row. A registration with no `headers` array makes no sheet. |
| `data` | The rows below it, an array of arrays. |
| `columnWidths` | Width of each column, in characters, up to 255. A column without one fits its content, up to 60. |
| `numberFormats` | Format of each column: a keyword below, or an Excel format code such as `"£"#,##0.00`. |
| `totals` | A row after the data: see [Totals](#totals). |
| `headerStyle` | `false` for a plain first row, or a [style](#header-style) to merge over the default. |

Press checks that a format code is a string, not that it is valid. Excel offers to repair a file with a broken one, so try a new code in Excel.

## Cells

A cell is one of:

| Value | Written as |
|---|---|
| string | Text, always: `=1+1` stays those four characters. |
| number | A number. |
| boolean | `TRUE` or `FALSE`. |
| `Date` | A date, in the column's format, or Excel's short date for the reader's locale if the column names none. |
| `null`, `undefined` | An empty cell. |
| `{ formula, result? }` | A formula, such as `{ formula: 'SUM(B2:B9)', result: 42 }`, with or without a leading `=`. |

`result` is what a reader that doesn't calculate shows, such as a preview pane or a phone; Excel recalculates when it opens the file. Press doesn't check the formula, and Excel offers to repair a file with a broken one.

Anything else stops the compile and names the cell.

## Number formats

| Keyword | Format |
|---|---|
| `text` | `@` |
| `number`, `integer` | `#,##0` |
| `decimal`, `currency` | `#,##0.00` |
| `percent` | `0.0%` |
| `date` | `yyyy-mm-dd` |
| `datetime` | `yyyy-mm-dd hh:mm` |

## Totals

`totals` is one entry per column:

| Entry | Written as |
|---|---|
| `'sum'`, `'avg'`, `'count'` | The formula over that column's rows, with its result stored. A sum or average takes the column's format; a count is a plain number. |
| Other text, a number, a `Date`, a formula | That value. |
| `null` | An empty cell. |

`totals: true` sums every column whose cells are all numbers, and puts `Total` in the first column unless that one is summed too. The row is bold, with a line above it.

## Header style

By default the first row is bold on light grey, with a line below it. An object replaces the default key by key:

```js
headerStyle: {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { fgColor: { argb: 'FF1F3A5F' } },
    border: { bottom: { style: 'thick', color: { argb: 'FF000000' } } },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
}
```

| Key | Takes |
|---|---|
| `font` | `bold`, `italic`, `underline`, `strike`, `size`, `name`, `color` |
| `fill` | `fgColor`; the fill is always solid |
| `border` | `left`, `right`, `top`, `bottom`, each `{ style, color }` |
| `alignment` | `vertical`, `horizontal`, `wrapText` |

A color is `{ argb: 'AARRGGBB' }`. A border's `style` is one of `thin`, `medium`, `thick`, `hair`, `dotted`, `dashed`, `dashDot`, `dashDotDot`, `double`, `mediumDashed`, `mediumDashDot`, `mediumDashDotDot`, `slantDashDot`. A key or a value outside these stops the compile and says what is available, because Excel would otherwise offer to repair the file.

## Workbook options

The second argument of `compile('xlsx', options)`:

| Option | Meaning |
|---|---|
| `title`, `subject`, `creator`, `company`, `description` | The file's properties. |
| `keywords` | An array of strings. |
| `paper` | `'a4'` or `'letter'`, for every sheet. Unnamed, the printer decides. Anything else stops the compile. |

## What Press adjusts

Some values have no valid form in a spreadsheet, and one bad value shouldn't lose a whole report, so Press writes the nearest valid file:

| Input | Result |
|---|---|
| `NaN`, `Infinity`, an invalid `Date` | An empty cell. |
| Text over 32,767 characters | Clipped to that length, Excel's limit for a cell. |
| Control characters in text | Dropped. |
| A title with `\ / ? * [ ] :` | Each replaced with `_`. |
| A title over 31 characters | Clipped. |
| Apostrophes at the ends of a title | Dropped. |
| A title already used, ignoring case | A ` (2)` suffix, then ` (3)`. |
| The title `History`, which Excel reserves | ` (2)` too. |
| No title, or nothing left of one | `Sheet1`, by position. |
| Nothing registered | One empty sheet, `Sheet1`. |

## What it doesn't do

Merged cells, images, charts, hyperlinks, rich text and styles on cells other than the first row aren't part of this format. For a preview that needs them, render the preview separately: a chart in the page and flat rows in the sheet is the usual shape (see [concepts](../concepts.md)). For a file that needs them, write a [custom adapter](../guides/custom-adapter.md).
