// The practice items every report leaves out: exact names only, so a real title such as "Greatest Hits",
// "Contest" or "Testament" is never dropped from a tax figure. The same list as main.js `isTestBook`.
const TEST_NAMES = ['test', 'test1', 'testpage', 'test-page', 'test page'];
const lower = (value) => String(value || '').toLowerCase().trim();

/** Whether a catalogue item (by its id and the item itself) is a practice item. */
export function isTestItem(id, book) {
  return book?.isTest === true || TEST_NAMES.includes(lower(id)) || TEST_NAMES.includes(lower(book?.id)) || TEST_NAMES.includes(lower(book?.title));
}
