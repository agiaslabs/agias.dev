// POST /api/request — the /request form. Validates, rate-limits, delivers through _forward.js. Stores nothing.
// Response: { ok, configured, delivered:[...] } ; when nothing is configured the page falls back to opening a mail.
"use strict";
const { deliver } = require("./_forward.js");
const { rateLimited } = require("./a2a.js");
const MAX = { what: 4000, who: 500, have: 500, replyTo: 200 };

function clean(v, max) { return typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : ""; }

async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ ok: false, error: "POST only" })); }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip, Date.now())) { res.statusCode = 429; return res.end(JSON.stringify({ ok: false, error: "rate limit" })); }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (body === undefined) { let raw = ""; for await (const c of req) { raw += c; if (raw.length > 16384) { res.statusCode = 413; return res.end(JSON.stringify({ ok: false, error: "too large" })); } } try { body = raw ? JSON.parse(raw) : null; } catch { body = null; } }
  if (!body || typeof body !== "object") { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: "invalid JSON" })); }
  const what = clean(body.what, MAX.what), who = clean(body.who, MAX.who), have = clean(body.have, MAX.have), replyTo = clean(body.replyTo, MAX.replyTo);
  const lang = body.lang === "ja" ? "ja" : "en";
  if (!what) { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: "what is required" })); }
  const text = (lang === "ja"
    ? `機械にさせたいこと:\n${what}\n\n誰が・どこで:\n${who || "-"}\n\nすでにあるもの・参考:\n${have || "-"}`
    : `What the machine should do:\n${what}\n\nWho and where:\n${who || "-"}\n\nWhat you have / reference:\n${have || "-"}`);
  const r = await deliver({ source: "agias.dev/request", at: new Date().toISOString(), channel: "request form (" + lang + ")", text, replyTo: replyTo || undefined });
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: r.configured && r.delivered.length > 0, configured: r.configured, delivered: r.delivered, failed: r.failed.map(f => f.name) }));
}
module.exports = handler;
