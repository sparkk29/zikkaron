const crypto = require("crypto");
const { metrics } = require("../services/metrics");

function requestId(req, res, next) {
  const supplied = req.header("x-request-id");
  req.requestId = supplied && /^[a-zA-Z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.record({
      method: req.method,
      path: req.route?.path || req.path,
      status: res.statusCode,
      durationMs,
    });
    if (process.env.LOG_REQUESTS === "true") {
      console.log(
        JSON.stringify({
          event: "http.request",
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        })
      );
    }
  });
  next();
}

module.exports = { requestId };
