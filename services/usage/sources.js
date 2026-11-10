// Where the usage meters' numbers come from (meters.js). Each source is built on clients/http.js googleHttp, so tests
// check the exact requests with a fake `fetch`.
//
//   monitoringUsage   Cloud Monitoring's sums of the two log-based metrics (server/setup-usage-metrics.js) for a month, by
//                     the `shop` label: { [shopId]: { count, sum } }
//   storageUsage      the bytes under shops/<id>/ in each shared bucket
//   usageSources      the three together, plus the emails count: what runUsageMeters reads
import { googleHttp } from "../../clients/http.js";
import { metersFrom, monthBounds } from "./meters.js";

/** The two log-based metrics the meters read (made by server/setup-usage-metrics.js). */
export const USAGE_METRICS = Object.freeze({ work: "shop_work_ms", pages: "shop_page_bytes" });

const MONITORING = "https://monitoring.googleapis.com/v3";
const STORAGE = "https://storage.googleapis.com/storage/v1";
const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** A log-based metric's month, summed by shop: each day's counts and totals added up. */
export function monitoringUsage({ fetch, token, projectId }) {
  const call = googleHttp({ fetch, token });
  return {
    async sums(metric, month) {
      const { start, end } = monthBounds(month);
      const out = {};
      let pageToken = "";
      do {
        const query = {
          filter: `metric.type="logging.googleapis.com/user/${metric}"`,
          "interval.startTime": start,
          "interval.endTime": end,
          "aggregation.alignmentPeriod": "86400s",
          "aggregation.perSeriesAligner": "ALIGN_DELTA",
          "aggregation.crossSeriesReducer": "REDUCE_SUM",
          "aggregation.groupByFields": "metric.label.shop",
          ...(pageToken ? { pageToken } : {}),
        };
        const answer = await call("GET", `${MONITORING}/projects/${projectId}/timeSeries`, { query });
        for (const series of answer.timeSeries ?? []) {
          const shop = series.metric?.labels?.shop;
          if (!SHOP_ID.test(shop ?? "")) continue;
          const sum = (out[shop] ??= { count: 0, sum: 0 });
          for (const point of series.points ?? []) {
            const d = point.value?.distributionValue;
            const count = Number(d?.count) || 0;
            sum.count += count;
            sum.sum += count * (Number(d?.mean) || 0);
          }
        }
        pageToken = answer.nextPageToken ?? "";
      } while (pageToken);
      return out;
    },
  };
}

/** The bytes a shop keeps in the shared buckets: everything under shops/<id>/ in each. */
export function storageUsage({ fetch, token, buckets }) {
  const call = googleHttp({ fetch, token });
  return {
    async bytes(shopId) {
      if (!SHOP_ID.test(shopId ?? "")) throw new Error(`"${shopId}" isn't a shop id`);
      let total = 0;
      for (const bucket of buckets) {
        let pageToken = "";
        do {
          const query = { prefix: `shops/${shopId}/`, fields: "items(size),nextPageToken", ...(pageToken ? { pageToken } : {}) };
          const answer = await call("GET", `${STORAGE}/b/${encodeURIComponent(bucket)}/o`, { query });
          for (const item of answer.items ?? []) total += Number(item.size) || 0;
          pageToken = answer.nextPageToken ?? "";
        } while (pageToken);
      }
      return total;
    },
  };
}

/**
 * What runUsageMeters reads: `read(month, shopIds, { measureStorage })` -> { [shopId]: meters }. `sentLog` is the
 * platform's sent-email log (clients/stores.js firestoreSentLog, `countInMonth`).
 */
export function usageSources({ monitoring, storage, sentLog }) {
  return {
    async read(month, shopIds, { measureStorage = true } = {}) {
      const work = await monitoring.sums(USAGE_METRICS.work, month);
      const pages = await monitoring.sums(USAGE_METRICS.pages, month);
      const out = {};
      for (const shopId of shopIds) {
        out[shopId] = metersFrom({
          work: work[shopId] ? { count: work[shopId].count, ms: work[shopId].sum } : null,
          bytes: pages[shopId]?.sum ?? 0,
          storageBytes: measureStorage ? await storage.bytes(shopId) : null,
          emails: sentLog ? await sentLog.countInMonth(shopId, month) : 0,
        });
      }
      return out;
    },
  };
}
