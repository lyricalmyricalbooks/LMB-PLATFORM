/** How long an "ok" toast stays: long enough to read (about 60 ms a character), never shorter than before
 *  (3.5 s, or 8 s when it carries an action such as Undo). "warn" and "err" toasts stay until dismissed. */
export function toastDuration(text: string, hasAction: boolean): number {
  return Math.max(hasAction ? 8000 : 3500, 60 * text.length);
}
