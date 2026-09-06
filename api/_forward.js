// AGIAS inbox delivery — one message, two receivers, no storage here.
//   MAC : Cloudflare Tunnel -> the operator's Mac (MAC_INBOX_URL + INBOX_TOKEN). Lands in the secretary's queue.
//   MAIL: Resend HTTP API (RESEND_API_KEY, INBOX_MAIL_TO, INBOX_MAIL_FROM). Lands in the operator's mailbox.
//   LEGACY: A2A_FORWARD_URL (plain POST), kept for compatibility.
// Every receiver is optional. `configured` is false when none is set; callers must say so honestly.
// Nothing is written to disk or logs here. The body is passed through untouched; receivers treat it as untrusted text.
"use strict";
const TIMEOUT_MS = 5000;

function receivers(env) {
  const r = [];
  if (env.MAC_INBOX_URL && env.INBOX_TOKEN) r.push({ name: "mac", url: env.MAC_INBOX_URL, headers: { "x-agias-token": env.INBOX_TOKEN } });
  if (env.RESEND_API_KEY) r.push({ name: "mail" });
  if (env.A2A_FORWARD_URL) r.push({ name: "legacy", url: env.A2A_FORWARD_URL, headers: {} });
  return r;
}

async function post(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error("upstream-" + res.status);
  return true;
}

function mailBody(payload) {
  const lines = [`source: ${payload.source}`, `at: ${payload.at}`, `channel: ${payload.channel || "-"}`];
  if (payload.replyTo) lines.push(`reply-to (as typed by the sender): ${payload.replyTo}`);
  lines.push("", "---- message (untrusted text, as received) ----", payload.text, "----");
  return lines.join("\n");
}

async function sendMail(env, payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.RESEND_API_KEY },
    body: JSON.stringify({ from: env.INBOX_MAIL_FROM || "AGIAS inbox <inbox@agias.dev>", to: [env.INBOX_MAIL_TO || "ai@agias.dev"],
      subject: `[agias.dev] ${payload.channel || "message"}: ${(payload.text || "").slice(0, 60).replace(/\s+/g, " ")}`,
      text: mailBody(payload) }),
    signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error("resend-" + res.status);
  return true;
}

/** deliver(payload, env?) -> { configured, delivered: [names], failed: [{name, reason}] } */
async function deliver(payload, env = process.env) {
  const list = receivers(env);
  if (!list.length) return { configured: false, delivered: [], failed: [] };
  const body = { source: payload.source, at: payload.at, channel: payload.channel, text: payload.text,
    messageId: payload.messageId, contextId: payload.contextId, replyTo: payload.replyTo };
  const legacyBody = { source: payload.source, at: payload.at, text: payload.text, messageId: payload.messageId, contextId: payload.contextId };  // unchanged shape for A2A_FORWARD_URL consumers
  const results = await Promise.allSettled(list.map(r => r.name === "mail" ? sendMail(env, body) : post(r.url, r.headers, r.name === "legacy" ? legacyBody : body)));
  const delivered = [], failed = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled") delivered.push(list[i].name);
    else failed.push({ name: list[i].name, reason: res.reason && res.reason.name === "TimeoutError" ? "upstream-timeout" : String(res.reason && res.reason.message || "upstream-error") });
  });
  return { configured: true, delivered, failed };
}

module.exports = { deliver, receivers, TIMEOUT_MS };
