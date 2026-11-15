(() => {
  "use strict";

  const get = id => document.getElementById(id);

  function showMetrics(data) {
    const fields = [
      ["Status", data.running ? "RUNNING" : "IDLE"],
      ["Last NYSE session", data.last_session],
      ["New forecasts", data.last_created],
      ["Existing forecasts", data.last_existing],
      ["Validated", data.last_validated],
      ["Last completed", data.last_completed_at]
    ];

    const container = get("fcSchedulerMetrics");
    container.replaceChildren();

    for (const [label, value] of fields) {
      const item = document.createElement("div");
      item.className = "card";

      const title = document.createElement("div");
      title.className = "label";
      title.textContent = label;

      const metric = document.createElement("div");
      metric.className = "metric";
      metric.textContent = value === null ||
        value === undefined || value === ""
          ? "?" : String(value);

      item.append(title, metric);
      container.appendChild(item);
    }

    const errors = data.last_errors;
    get("fcSchedulerErrors").textContent =
      Array.isArray(errors) && errors.length
        ? "Last errors: " + errors.map(String).join("; ")
        : "No scheduler errors reported.";
  }

  async function refresh() {
    const status = get("fcSchedulerStatus");
    const url = window.APP_CONFIG?.FORECAST_MONITOR_URL;

    if (!url) {
      status.textContent =
        "Secure connection not configured. Scheduler data unavailable.";
      get("fcSchedulerMetrics").replaceChildren();
      get("fcSchedulerErrors").textContent = "";
      return;
    }

    status.textContent = "Loading scheduler status...";

    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      if (!data || typeof data !== "object" ||
          typeof data.running !== "boolean") {
        throw new Error("Invalid scheduler response");
      }

      showMetrics(data);
      status.textContent = "Scheduler status loaded ? read-only";

    } catch (error) {
      status.textContent =
        "Scheduler unavailable: " + error.message;
      get("fcSchedulerMetrics").replaceChildren();
      get("fcSchedulerErrors").textContent = "";
    }
  }

  function init() {
    const button = get("fcSchedulerRefresh");
    if (!button) return;

    button.addEventListener("click", refresh);
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
