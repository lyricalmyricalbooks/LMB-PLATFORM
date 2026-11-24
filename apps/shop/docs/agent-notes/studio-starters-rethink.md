# Studio: starters and Studio rethink notes

Dated notes for the starters and Studio rethink (plan approved 24 November 2026). Earlier steps (4: Show with,
5: Try this starter) are in `src/app/admin/studio/CLAUDE.md` until the guides move moves them here.

## Step 6, part 1: settings in the left panel, Try another design (24 November 2026)

- **Settings open in the left panel** on computers and tablets. The desktop layout is two resizable panels (left list,
  preview); the third "inspector" column and its "Nothing selected" note are gone, so the preview gets the room. When a
  section or page part is selected, the left panel shows its settings in place of the list, with a
  **Back to <workspace>** link (`data-studio-settings-back`, `StudioInspector`'s `backLabel`; page parts keep their own "Back to
  Page layout"). A picker the list is showing (Add section, Add block) stays in front of the settings. Phones are
  unchanged (Sections / Preview / Edit tabs). Saved panel sizes moved to `studio-panels-v3`.
- **Try another design** (`data-studio-design-switch`, section Content tab): a select of the designs of the section's
  kind (`designsToTry` in `sectionDesigns.ts`: same kind, same place, never Build your own or Page content) and a
  button that steps to the next one. `withDesign(section, designId, registry, getBlocksKey)`: the same type keeps every
  setting and takes the design's own (other designs' keys reset to defaults); another type starts from its defaults
  and takes over the owner's content by role (`ROLES`: title/headline, body/subtitle/description, button text and
  link, photo, video) plus same-named content (`SAME_NAME`: products, address, quote…). Values still equal to the old
  type's defaults are placeholders and are left behind. Blocks move when both types use the same block kind. One
  undoable change; the section keeps its id. Tests: `sectionDesignSwap.test.ts`, `StudioEditor.test.tsx`.
- Unit tests that read the list after selecting call `backToList()` first.
