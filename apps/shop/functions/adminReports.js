// Admin report actions of createStripeCheckoutSession: backups list, AI writing assistant, Google Analytics,
// Search Console, BigQuery journeys and the traffic-count reset. Every one is admin-only and never touches orders,
// payments or stock. index.js passes in its own db, admin SDK and guards, so the handler tests' fakes still apply.
const { handleAiWrite } = require("./aiWriter");
const { handleGa4Report, metadataCredentials } = require("./googleAnalytics");
const { handleSearchConsole, SCOPE: SEARCH_CONSOLE_SCOPE } = require("./searchConsole");
const { handleBigQueryJourneys, SCOPE: BIGQUERY_SCOPE } = require("./bigQueryJourneys");
const { handleTrafficReset } = require("./trafficReset");

function adminReportActions({ db, admin, requireAdmin, readAdminSecret, hitLimit, LIMITS }) {
  /** Settings › General › Backups & export › the daily list (op "list") and Download (op "download", body.day). */
  async function handleBackups(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { listBackups, backupDownloadUrl } = require("./backupAdmin");
      const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
      const bucket = admin.storage().bucket(admin.app().options.storageBucket || `${projectId}.firebasestorage.app`);
      if (req.body?.op === "download") {
        const { status, body } = await backupDownloadUrl({ bucket, day: req.body.day });
        return res.status(status).json(body);
      }
      res.status(200).json({ backups: await listBackups({ bucket }) });
    } catch (err) {
      console.error("backups admin failed:", err);
      res.status(500).json({ error: "Couldn't read the backups. Try again in a minute." });
    }
  }

  // Admin AI writing assistant (Books › edit, Studio › Pages): Google Gemini or OpenRouter, keys in adminSecrets/ai.
  async function handleAiWriteRequest(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { status, body } = await handleAiWrite(req.body || {}, {
        readSettings: async () => {
          const saved = await readAdminSecret("ai");
          return { apiKey: saved.geminiKey, openrouterKey: saved.openrouterKey, openrouterModel: saved.openrouterModel, provider: saved.provider, voice: saved.voice };
        },
        allow: () => hitLimit(db, "ai-write", req, LIMITS.aiWrite),
        bucket: admin.app().options.storageBucket || `${process.env.GCLOUD_PROJECT || admin.app().options.projectId}.firebasestorage.app`,
      });
      res.status(status).json(body);
    } catch (err) {
      console.error("aiWrite failed:", err?.message || err);
      res.status(500).json({ error: "The AI assistant couldn't answer just now. Try again in a minute." });
    }
  }

  // Overview › Google Analytics figures (admin): the GA4 Data API read with this function's own service account.
  async function handleGa4ReportRequest(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { status, body } = await handleGa4Report(req.body || {}, {
        readSettings: () => readAdminSecret("googleAnalytics"),
        allow: () => hitLimit(db, "ga4-report", req, LIMITS.ga4),
        credentials: () => metadataCredentials(fetch),
        fetchImpl: fetch,
        projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId || "",
      });
      res.status(status).json(body);
    } catch (err) {
      console.error("ga4Report failed:", err?.message || err);
      res.status(500).json({ error: "Google Analytics couldn't be read just now. Try again in a minute." });
    }
  }

  // Overview › Found on Google (admin): the Search Console API read with this function's own service account.
  async function handleSearchConsoleRequest(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { status, body } = await handleSearchConsole(req.body || {}, {
        readSettings: () => readAdminSecret("googleAnalytics"),
        allow: () => hitLimit(db, "search-console", req, LIMITS.ga4),
        credentials: () => metadataCredentials(fetch, SEARCH_CONSOLE_SCOPE),
        fetchImpl: fetch,
        projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId || "",
      });
      res.status(status).json(body);
    } catch (err) {
      console.error("searchConsole failed:", err?.message || err);
      res.status(500).json({ error: "Search Console couldn't be read just now. Try again in a minute." });
    }
  }

  // Overview › Visitor journeys / Last page before leaving (admin): one read-only query over the GA4 BigQuery export,
  // run with this function's own service account (functions/bigQueryJourneys.js).
  async function handleBigQueryJourneysRequest(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { status, body } = await handleBigQueryJourneys(req.body || {}, {
        readSettings: () => readAdminSecret("googleAnalytics"),
        allow: () => hitLimit(db, "bigquery-journeys", req, LIMITS.ga4),
        credentials: () => metadataCredentials(fetch, BIGQUERY_SCOPE),
        fetchImpl: fetch,
        projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId || "",
      });
      res.status(status).json(body);
    } catch (err) {
      console.error("bigQueryJourneys failed:", err?.message || err);
      res.status(500).json({ error: "BigQuery couldn't be read just now. Try again in a minute." });
    }
  }

  // Overview › Start traffic counts again (admin): deletes the shop's own daily traffic counters, never orders.
  async function handleResetTrafficRequest(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    try {
      const { status, body } = await handleTrafficReset(req.body || {}, { db, by: adminUser.email });
      res.status(status).json(body);
    } catch (err) {
      console.error("resetTraffic failed:", err?.message || err);
      res.status(500).json({ error: "The traffic counts couldn't be reset. Try again in a minute." });
    }
  }

  return {
    backups: handleBackups,
    aiWrite: handleAiWriteRequest,
    ga4Report: handleGa4ReportRequest,
    searchConsole: handleSearchConsoleRequest,
    bigQueryJourneys: handleBigQueryJourneysRequest,
    resetTraffic: handleResetTrafficRequest,
  };
}

module.exports = { adminReportActions };
