# CSV fields break when they contain a comma

`format_csv` and `parse_csv` in `csvquote.py` should round-trip a list of rows. Each row is a list of strings.

A field that contains a comma, a double quote, or a newline has to be wrapped in double quotes. A double quote inside such a field is written as two double quotes. Empty fields stay empty, so `a,,c` is three fields. A trailing newline after the last row is fine and is not an extra row.

Plain rows with no special characters already round-trip, and the visible tests (`python3 -m unittest tests/test_csvquote.py`) pass. Quoted fields do not. Please fix both the writer and the reader so a format-then-parse cycle returns the original rows.
