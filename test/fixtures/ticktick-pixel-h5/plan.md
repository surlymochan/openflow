# Plan

## Target Outcome

Deliver a static H5 workbench that reconstructs a real TickTick desktop calendar-plus-list surface as closely as possible, with a visible month schedule on the left and a dense task list on the right.

## Reference Contract

- Competitor product: `TickTick desktop`
- Primary reference surface: `desktop_month_list_split`
- Benchmark mode:
  - `capture_url + reference_image`
  - viewport `992 x 664`
  - capture URL `http://127.0.0.1:4176/test/fixtures/ticktick-pixel-h5/app/index.html`

## Implementation Approach

- Rebuild the target as a two-pane month-and-list workbench instead of the earlier three-column desk that drifted away from the chosen surface
- Use capture-backed benchmark evidence from the actual local page over HTTP instead of `file://` so module scripts and real task content are loaded during benchmark capture
