/**
 * Saves changed settings sections one after another and stops at the first failure (that
 * section's save already told the owner what went wrong). True only when every section saved,
 * so "saved" is never announced over a failed save. Pure apart from the `save` it is given.
 */
export async function saveSectionsInOrder(sections: readonly string[], save: (section: string) => Promise<boolean>): Promise<boolean> {
  for (const section of sections) {
    if (!(await save(section))) return false;
  }
  return true;
}
