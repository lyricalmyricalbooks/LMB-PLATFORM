// Small, pure helpers that keep scheduled jobs and triggers inside their time limits (PR 10).

/**
 * Runs `worker` over `items` a few at a time (`size` in parallel) and stops starting new batches once
 * `deadline` (ms since epoch) has passed, so a function is never killed halfway through a send. Items not
 * started are returned in `skipped` for the next run. A worker that throws is counted in `failed`.
 */
async function runInBatches(items, size, worker, { deadline = Infinity, now = Date.now } = {}) {
  const skipped = [];
  let processed = 0;
  let failed = 0;
  const step = Math.max(1, Math.floor(size) || 1);
  for (let i = 0; i < items.length; i += step) {
    if (now() >= deadline) { skipped.push(...items.slice(i)); break; }
    const results = await Promise.allSettled(items.slice(i, i + step).map(item => worker(item)));
    for (const r of results) { if (r.status === "fulfilled") processed += 1; else failed += 1; }
  }
  return { processed, failed, skipped };
}

/**
 * Backup folders (`backups/YYYY-MM-DD/`) to delete: every dated folder older than `keepDays`, but never the
 * newest folder and never one that is not a plain date (so a hand-made folder is left alone).
 */
function backupFoldersToPrune(prefixes, today = new Date(), keepDays = 30) {
  const dated = [];
  for (const prefix of Array.isArray(prefixes) ? prefixes : []) {
    const m = /^backups\/(\d{4}-\d{2}-\d{2})\/?$/.exec(String(prefix));
    if (m && Number.isFinite(Date.parse(`${m[1]}T00:00:00Z`))) dated.push({ prefix: `backups/${m[1]}/`, day: m[1] });
  }
  if (!dated.length) return [];
  dated.sort((a, b) => (a.day < b.day ? 1 : -1));
  const cutoff = new Date(today.getTime() - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return dated.slice(1).filter(d => d.day < cutoff).map(d => d.prefix);
}

module.exports = { runInBatches, backupFoldersToPrune };
