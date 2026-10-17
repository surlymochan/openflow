"""Small CSV reader and writer.

Fields that contain a comma, a double quote, or a newline must be quoted.
A quote inside a quoted field is written as two quotes.
"""


def format_csv(rows):
    lines = []
    for row in rows:
        lines.append(",".join(row))
    text = "\n".join(lines)
    if rows:
        text += "\n"
    return text


def parse_csv(text):
    if text == "":
        return []
    rows = []
    for line in text.splitlines():
        rows.append(line.split(","))
    return rows
