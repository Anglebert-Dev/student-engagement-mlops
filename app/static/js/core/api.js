import { log } from "./logger.js";
import { state, set } from "./store.js";

let leaving = false;
addEventListener("beforeunload", () => { leaving = true; });
addEventListener("pagehide", () => { leaving = true; });
addEventListener("pageshow", () => { leaving = false; });

export class ApiError extends Error {
  constructor(message, status, entry) { super(message); this.status = status; this.entry = entry; this.logged = true; }
}

export async function api(path, opts = {}) {
  const { label, context, level = "error", poll = false, ...init } = opts;
  const method = (init.method || "GET").toUpperCase();
  const started = performance.now();
  const request = { method, url: path, status: null, ms: null };
  const title = label ? `${label} failed` : `${method} ${path} failed`;

  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    request.status = 0;
    request.ms = Math.round(performance.now() - started);
    if (leaving || err.name === "AbortError") throw new ApiError("Request cancelled", 0, null);
    if (poll) throw outage(0, request, { error: String(err) });
    const entry = log({ level, source: "network", title, message: navigator.onLine ? "No response from the server (network error)" : "This device is offline",
                        request, details: { error: String(err), ...context } });
    throw new ApiError("Cannot reach the server. See Error logs for details.", 0, entry);
  }
  request.status = res.status;
  request.ms = Math.round(performance.now() - started);

  const text = await res.text();
  if (poll && OUTAGE.has(res.status)) throw outage(res.status, request, { upstream: res.headers.get("x-upstream"), body_start: text.slice(0, 300) });
  let body = null;
  try { body = text ? JSON.parse(text) : {}; } catch {
    const entry = log({ level: "error", source: "parse", title, message: `Expected JSON, got ${res.headers.get("content-type") || "unknown content"} (HTTP ${res.status})`,
                        request, details: { upstream: res.headers.get("x-upstream"), body_start: text.slice(0, 1500), ...context } });
    throw new ApiError(res.ok ? "The server sent an unreadable answer." : `HTTP ${res.status} ${res.statusText}`, res.status, entry);
  }

  if (!res.ok) {
    const message = body?.error || `HTTP ${res.status} ${res.statusText}`;
    const entry = log({ level, source: res.status === 503 && /model/i.test(message) ? "model" : "api", title, message,
                        request, details: { response: body, upstream: res.headers.get("x-upstream"), ...context } });
    throw new ApiError(message, res.status, entry);
  }
  return body;
}

const seenRuns = new Set();

const OUTAGE = new Set([502, 503, 504]);

function outage(status, request, details) {
  const err = new ApiError(status ? `HTTP ${status}` : "No response", status, null);
  err.outage = { request: { ...request }, details };
  return err;
}

let down = null;

function noteDown(err) {
  if (!err.outage) return;
  if (!down) {
    down = { since: Date.now(), container: state.health?.container, failures: 0, first: err.outage };
    log({ level: "warn", source: "outage", title: "API unavailable", key: `outage:${down.since}`,
          message: err.status ? `nginx answered HTTP ${err.status}: no API container is answering` : "No response from the server",
          request: err.outage.request, details: err.outage.details });
  }
  down.failures++;
}

function noteUp(h) {
  if (!down) return;
  const secs = Math.round((Date.now() - down.since) / 1000);
  const restarted = h.container !== down.container || h.uptime_seconds <= secs + 5;
  log({ level: restarted ? "warn" : "info", source: "outage", key: `recovered:${down.since}`,
        title: `API back online after ${secs}s`,
        message: restarted ? `The API container restarted (now ${h.container}, started ${h.started_at})` : "The same container is answering again",
        details: { down_from: new Date(down.since).toISOString(), back_at: new Date().toISOString(), failed_checks: down.failures,
                   container_before: down.container, container_now: h.container, uptime_seconds: h.uptime_seconds, first_failure: down.first } });
  down = null;
}

export async function refreshHealth() {
  const t0 = performance.now();
  state.checks++;
  try {
    const h = await api("/api/health", { label: "Health check", poll: true });
    noteUp(h);
    state.okChecks++;
    const pings = [...state.pings, { t: Date.now(), ms: Math.round(performance.now() - t0) }].slice(-60);
    set("pings", pings);
    set("healthOk", true);
    set("health", h);
    if (h.model_error) log({ source: "model", title: "Model failed to load", message: h.model_error,
                             details: { container: h.container, started_at: h.started_at }, key: `model:${h.model_error}`, once: true });
  } catch (err) {
    noteDown(err);
    set("healthOk", false);
    set("health", state.health);
  }
}

export async function refreshStats() {
  try {
    const s = await api("/api/stats", { label: "Load statistics", poll: true });
    for (const run of s.retraining || []) {
      if (run.status === "failed" && !seenRuns.has(run.id)) {
        seenRuns.add(run.id);
        log({ source: "retraining", title: `Retraining run ${run.id} failed`, message: run.error || "no error message saved",
              details: { run }, key: `run:${run.id}`, once: true });
      }
    }
    set("stats", s);
  } catch {}
}

export async function refreshModel() {
  try { set("model", await api("/api/model", { label: "Load model info", level: "warn" })); }
  catch { set("model", null); }
}

export async function refreshInsights() {
  try { set("insights", await api("/api/insights", { label: "Load data insights" })); }
  catch { set("insights", {}); }
}
