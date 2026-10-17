# Date ranges drop the end day

`parse_date_range` in `daterange.py` reads a span written as `YYYY-MM-DD..YYYY-MM-DD` and returns the list of `datetime.date` values inside it.

The range is inclusive of both endpoints. A span whose start and end are the same day is a one-element list of that day. February 29 is valid in a leap year and must be accepted as either endpoint. The dates come back in calendar order.

Invalid text, or an end date that falls before the start, raises `ValueError`.

A report from billing says a range such as the first through the fourth of a month is missing its last day, and a same-day range comes back empty. Visible tests (`python3 -m unittest tests/test_daterange.py`) pass. Please fix the parser.
