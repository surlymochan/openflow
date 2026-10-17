"""Inclusive calendar ranges written as YYYY-MM-DD..YYYY-MM-DD."""

from datetime import date, timedelta


def parse_date_range(text):
    """Return each date from the start through the end, inclusive.

    Raises ValueError when the text is not two ISO dates, or the end is before the start.
    """
    if ".." not in text:
        raise ValueError("expected YYYY-MM-DD..YYYY-MM-DD")
    start_s, end_s = text.split("..", 1)
    try:
        start = date.fromisoformat(start_s)
        end = date.fromisoformat(end_s)
    except ValueError as exc:
        raise ValueError("expected YYYY-MM-DD..YYYY-MM-DD") from exc
    if end < start:
        raise ValueError("end before start")
    days = []
    cursor = start
    while cursor < end:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days
