/** App Check for browser HTTP endpoints. Webhooks and emailed download links stay separate. */
function browserRequestHandler(handler, { mode, appId, emulator, verifyToken, applyCors, log }) {
  return async (req, res) => {
    if (applyCors(req, res)) return;
    // Preserve each handler's method rejection; only browser POSTs need attestation.
    if (req.method !== "POST" || emulator) return handler(req, res);
    const currentMode = mode();
    if (currentMode === "off") return handler(req, res);
    if (currentMode !== "monitor" && currentMode !== "enforce") {
      log({ event: "app_check", status: "configuration_error", path: req.path });
      return res.status(503).json({ code: "APP_CHECK_CONFIG_ERROR" });
    }
    const token = req.headers["x-firebase-appcheck"];
    let status = "missing";
    if (typeof token === "string" && token) {
      status = "invalid";
      try {
        const decoded = await verifyToken(token);
        if (decoded.appId === appId()) status = "valid";
      } catch {
        // Never log the token or provider diagnostics (which may contain credentials).
      }
    } else if (token !== undefined && token !== "") {
      status = "invalid";
    }
    log({ event: "app_check", mode: currentMode, status, path: req.path });
    if (status !== "valid" && currentMode === "enforce") return res.status(401).json({ code: "APP_CHECK_REQUIRED" });
    return handler(req, res);
  };
}
module.exports = { browserRequestHandler };
