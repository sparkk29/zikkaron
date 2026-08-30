const state = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  byStatus: {},
  byRoute: {},
  totalDurationMs: 0,
};

const metrics = {
  record({ method, path, status, durationMs }) {
    state.totalRequests += 1;
    state.totalDurationMs += durationMs;
    state.byStatus[status] = (state.byStatus[status] || 0) + 1;
    const key = `${method} ${path}`;
    state.byRoute[key] = (state.byRoute[key] || 0) + 1;
  },

  snapshot() {
    return {
      ...state,
      averageDurationMs: state.totalRequests
        ? Math.round((state.totalDurationMs / state.totalRequests) * 100) / 100
        : 0,
    };
  },
};

module.exports = { metrics };
