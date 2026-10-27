// ARIA wiring for the checkout's two type-ahead lists (address suggestions, country picker), so a
// screen reader hears which option the arrow keys are on. Pure and tested.

export const optionId = (listId: string, index: number) => `${listId}-opt-${index}`;

/** Attributes for the text box that drives a listbox. */
export function comboboxInputProps(opts: { open: boolean; listId: string; activeIndex: number; count: number }) {
  const hasActive = opts.open && opts.activeIndex >= 0 && opts.activeIndex < opts.count;
  return {
    role: "combobox" as const,
    "aria-expanded": opts.open,
    "aria-haspopup": "listbox" as const,
    "aria-autocomplete": "list" as const,
    "aria-controls": opts.open ? opts.listId : undefined,
    "aria-activedescendant": hasActive ? optionId(opts.listId, opts.activeIndex) : undefined,
  };
}
