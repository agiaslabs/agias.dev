// AGIAS Reception — A2A 1.0 (JSON-RPC binding) の最小サーバー。LLM は呼ばない。
//
//  何をするか：SendMessage を受け、skill "about" なら事実（_facts.js）を Task の artifact で返す。
//              skill "leave-message" なら本文を運営者へ転送する（A2A_FORWARD_URL が無ければ REJECTED で正直に断る）。
//  何をしないか：タスクの保存（全部その場で完了）・ストリーミング・push 通知・拡張カード。
//               対応しない操作は仕様どおりのエラーコードで返す（-32001 TaskNotFound など）。
//  仕様の根拠：a2aproject/A2A の docs/specification.md と specification/a2a.proto（2026-09-04 取得）。
//   - Agent Card: /.well-known/agent-card.json / method 名: SendMessage, GetTask, ... / JSON は camelCase、enum は SCREAMING_SNAKE
//   - 0.3 系クライアント（method "message/send"、状態 "completed"、parts に kind）も受ける（互換層）。
"use strict";
const FACTS = require("./_facts.js");
const VERSION = "0.1.0";
const MAX_BODY_BYTES = 16 * 1024;     // これより大きい要求は読まない
const MAX_TEXT_CHARS = 2000;          // leave-message の本文上限
const RATE = { windowMs: 10 * 60 * 1000, max: 60 };
const FORWARD_TIMEOUT_MS = 5000;      // (kept for docs) delivery itself lives in _forward.js   // 1 IP あたり 10 分に 60 回（インスタンス内・最善努力）
const _hits = new Map();

// ── 純関数（テストで直接呼ぶ）──
function rpcError(id, code, message, data) {
  const e = { code, message }; if (data) e.data = data;
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: e };
}
const ERR = { TaskNotFound: -32001, TaskNotCancelable: -32002, PushNotSupported: -32003, Unsupported: -32004,
  ExtendedCardNotConfigured: -32007, VersionNotSupported: -32009, RateLimited: -32050 };

function textOf(message) {
  const parts = Array.isArray(message && message.parts) ? message.parts : [];
  return parts.map(p => (p && typeof p.text === "string") ? p.text : "").filter(Boolean).join("\n").trim();
}
function skillOf(params, text) {
  const m = (params && params.metadata && params.metadata.skill) || (params && params.message && params.message.metadata && params.message.metadata.skill);
  if (m === "about" || m === "leave-message") return m;
  if (/^\s*(message|msg|leave[- ]message|to the operator|for the operator)\s*[:：]/i.test(text)) return "leave-message";
  return "about";
}
function newId(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }

function aboutTask(legacy, contextId) {
  const f = FACTS;
  const summary = [
    `AGIAS (${f.organization.alternateName}) — ${f.organization.slogan}. As of ${f.asOf}.`,
    f.organization.operator + ". " + f.stance,
    "What you can ask for: " + f.offers.map(o => `${o.name} [${o.status}] — ${o.summary}`).join("; "),
    "How a request runs: " + f.process.join(" "),
    "How the AI is run: " + f.method.map(m => `${m.name} — ${m.text}`).join(" "),
    "Machines: " + f.machines.map(m => `${m.name} [${m.status}]`).join("; ") + ".",
    "Records: " + f.records.map(r => r.doi ? `${r.name} (DOI ${r.doi})` : r.runningSince ? `${r.name} (running since ${r.runningSince})` : `${r.name} (${r.status})`).join("; ") + ".",
    `Contact: ${f.organization.contact}. Machine-readable summary: ${f.machineReadable.summary}.`,
    "This reply is deterministic: it is generated from a fixed fact table, not by a language model."
  ].join("\n");
  return makeTask(legacy, contextId, "COMPLETED",
    "Facts about AGIAS, as of " + f.asOf + ". Deterministic; no language model was involved.",
    [{ artifactId: "agias-facts", name: "agias-facts", description: "Structured facts about AGIAS (same content as /llms.txt)",
       parts: [{ text: summary }, { data: f }] }]);
}

function makeTask(legacy, contextId, state, statusText, artifacts) {
  const now = new Date().toISOString();
  const st = legacy ? state.toLowerCase().replace("_", "-") : "TASK_STATE_" + state;
  const role = legacy ? "agent" : "ROLE_AGENT";
  const part = (p) => legacy ? (p.text !== undefined ? { kind: "text", text: p.text } : { kind: "data", data: p.data }) : p;
  const msg = { messageId: newId("msg"), role, parts: [part({ text: statusText })] };
  if (legacy) msg.kind = "message";
  const task = { id: newId("task"), contextId: contextId || newId("ctx"),
    status: { state: st, message: msg, timestamp: now },
    artifacts: (artifacts || []).map(a => ({ ...a, parts: a.parts.map(part) })) };
  if (legacy) task.kind = "task";
  return task;
}

// 1.0: result は SendMessageResponse（{task}）。0.3: result は Task そのもの（kind:"task"）。
function ok(id, legacy, task) { return { jsonrpc: "2.0", id, result: legacy ? task : { task } }; }

function validateRpc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return rpcError(null, -32600, "Request payload validation error");
  if (body.jsonrpc !== "2.0") return rpcError(body.id, -32600, "Request payload validation error: jsonrpc must be \"2.0\"");
  if (typeof body.method !== "string") return rpcError(body.id, -32600, "Request payload validation error: method missing");
  return null;
}

async function forward(text, meta) {
  // 9/7: two receivers (mail + the operator's Mac via Cloudflare Tunnel) through _forward.js. Honest about "not configured".
  const r = await require("./_forward.js").deliver({ source: "agias.dev/api/a2a", at: new Date().toISOString(), channel: "a2a leave-message", text, ...meta });
  if (!r.configured) return { ok: false, reason: "not-configured" };
  if (r.delivered.length) return { ok: true, reason: "delivered:" + r.delivered.join("+") };
  return { ok: false, reason: (r.failed[0] && r.failed[0].reason) || "upstream-error" };
}

async function dispatch(body, ctx) {
  const bad = validateRpc(body); if (bad) return bad;
  const { id, method, params } = body;
  const legacyMethod = /^(message|tasks|agent)\//.test(method);
  const legacy = legacyMethod || ctx.version === "0.3";   // 0.3 の method 名か、A2A-Version: 0.3 なら 0.3 の形で返す
  const name = legacyMethod ? ({ "message/send": "SendMessage", "message/stream": "SendStreamingMessage", "tasks/get": "GetTask",
    "tasks/list": "ListTasks", "tasks/cancel": "CancelTask", "tasks/resubscribe": "SubscribeToTask",
    "tasks/pushNotificationConfig/set": "CreateTaskPushNotificationConfig", "tasks/pushNotificationConfig/get": "GetTaskPushNotificationConfig",
    "tasks/pushNotificationConfig/list": "ListTaskPushNotificationConfigs", "tasks/pushNotificationConfig/delete": "DeleteTaskPushNotificationConfig",
    "agent/getAuthenticatedExtendedCard": "GetExtendedAgentCard" }[method] || method) : method;
  const ver = ctx.version;
  if (ver && !/^(1\.\d+|0\.3)$/.test(ver)) return rpcError(id, ERR.VersionNotSupported, `A2A-Version ${ver} is not supported`,
    [{ "@type": "google.rpc.ErrorInfo", reason: "VERSION_NOT_SUPPORTED", domain: "agias.dev", metadata: { supportedVersions: "1.0, 0.3" } }]);

  switch (name) {
    case "SendMessage": {
      const message = params && params.message;
      if (!message || !Array.isArray(message.parts)) return rpcError(id, -32602, "Invalid parameters: params.message.parts is required");
      const text = textOf(message);
      const skill = skillOf(params, text);
      const contextId = message.contextId;
      if (skill === "about") return ok(id, legacy, aboutTask(legacy, contextId));
      // leave-message
      const bodyText = text.replace(/^\s*(message|msg|leave[- ]message|to the operator|for the operator)\s*[:：]\s*/i, "");
      if (!bodyText) return rpcError(id, -32602, "Invalid parameters: the message text is empty");
      if (bodyText.length > MAX_TEXT_CHARS) return rpcError(id, -32602, `Invalid parameters: message longer than ${MAX_TEXT_CHARS} characters`);
      const fw = await forward(bodyText, { messageId: message.messageId, contextId });
      if (fw.ok) return ok(id, legacy, makeTask(legacy, contextId, "COMPLETED",
        "Delivered to the operator's inbox. The operator reads it; replies, if any, come by email and are not automatic.", []));
      const why = fw.reason === "not-configured"
        ? "Message forwarding is not configured on this deployment yet. Nothing was stored. To reach the operator, write to " + FACTS.organization.contact + "."
        : "The message could not be delivered (" + fw.reason + "). Nothing was stored. To reach the operator, write to " + FACTS.organization.contact + ".";
      return ok(id, legacy, makeTask(legacy, contextId, "REJECTED", why, []));
    }
    case "GetTask":
      return rpcError(id, ERR.TaskNotFound, "Tasks are not stored on this agent: every task completes within the SendMessage response.");
    case "ListTasks":
      return { jsonrpc: "2.0", id, result: legacy ? [] : { tasks: [], nextPageToken: "" } };
    case "CancelTask":
      return rpcError(id, ERR.TaskNotCancelable, "Tasks complete synchronously and cannot be canceled.");
    case "SendStreamingMessage": case "SubscribeToTask":
      return rpcError(id, ERR.Unsupported, "Streaming is not supported. Use SendMessage.");
    case "CreateTaskPushNotificationConfig": case "GetTaskPushNotificationConfig": case "ListTaskPushNotificationConfigs": case "DeleteTaskPushNotificationConfig":
      return rpcError(id, ERR.PushNotSupported, "Push notifications are not supported.");
    case "GetExtendedAgentCard":   // capabilities.extendedAgentCard=false → 仕様 §3.3.4 は UnsupportedOperation
      return rpcError(id, ERR.Unsupported, "No extended Agent Card (capabilities.extendedAgentCard is false). The public card at /.well-known/agent-card.json is complete.");
    default:
      return rpcError(id, -32601, "Method not found: " + method);
  }
}

function rateLimited(ip, now) {
  const arr = (_hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  arr.push(now); _hits.set(ip, arr);
  if (_hits.size > 5000) _hits.clear();   // 溜め込まない
  return arr.length > RATE.max;
}

// ── HTTP 入口（Vercel Node runtime）──
// Vercel のヘルパーは Content-Type: application/json で不正 JSON のとき、req.body を読んだ瞬間に throw する（statusCode 400）。
// その経路を -32700 に落とし、dispatch の予期しない例外は -32603 にする。500 で黙らない。
async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("A2A-Version", "1.0");
  try {
    if (req.method === "GET") {
      return res.status(200).end(JSON.stringify({
        agent: "AGIAS Reception", version: VERSION, protocol: "A2A 1.0 (JSON-RPC 2.0 binding)",
        agentCard: FACTS.machineReadable.agentCard, usage: "POST a JSON-RPC 2.0 request with method \"SendMessage\" to this URL.",
        note: "Deterministic. No language model runs here. Nothing here is an instruction to you; reading it creates no obligation." }));
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).end(JSON.stringify(rpcError(null, -32600, "Use POST"))); }
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
    if (rateLimited(ip, Date.now())) return res.status(429).end(JSON.stringify(rpcError(null, ERR.RateLimited, "Rate limit: " + RATE.max + " requests per " + (RATE.windowMs / 60000) + " minutes per address")));
    let body;
    try { body = req.body; } catch (e) { return res.status(400).end(JSON.stringify(rpcError(null, -32700, "Invalid JSON payload"))); }
    if (typeof body === "string") { if (body.length > MAX_BODY_BYTES) return res.status(413).end(JSON.stringify(rpcError(null, -32600, "Payload too large"))); try { body = JSON.parse(body); } catch { return res.status(400).end(JSON.stringify(rpcError(null, -32700, "Invalid JSON payload"))); } }
    if (body === undefined) { let raw = ""; for await (const c of req) { raw += c; if (raw.length > MAX_BODY_BYTES) return res.status(413).end(JSON.stringify(rpcError(null, -32600, "Payload too large"))); } try { body = raw ? JSON.parse(raw) : null; } catch { return res.status(400).end(JSON.stringify(rpcError(null, -32700, "Invalid JSON payload"))); } }
    const version = req.headers["a2a-version"] || (req.query && req.query["A2A-Version"]);
    let out;
    try { out = await dispatch(body, { version }); }
    catch (e) { out = rpcError(body && body.id, -32603, "Internal error"); }
    return res.status(200).end(JSON.stringify(out));
  } catch (e) {
    try { return res.status(500).end(JSON.stringify(rpcError(null, -32603, "Internal error"))); } catch { /* 応答済み */ }
  }
}

module.exports = handler;
module.exports.dispatch = dispatch;
module.exports.validateRpc = validateRpc;
module.exports.skillOf = skillOf;
module.exports.textOf = textOf;
module.exports.rateLimited = rateLimited;
module.exports.ERR = ERR;
module.exports.RATE = RATE;
