// Apigee LLM Router demo UI - zero-dependency Node server (Node >= 18).
// Acts as a Backend-for-Frontend: the browser never sees Apigee API keys.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

// Local runs bind to loopback only. The Cloud Run image sets BIND_HOST=0.0.0.0, where IAP + Cloud Run IAM front the service.
const HOST = process.env.BIND_HOST || '127.0.0.1';
// Cloud Run sets K_SERVICE; used to accept the service's own https://*.run.app host (see trustedRequest).
const ON_CLOUD_RUN = Boolean(process.env.K_SERVICE);
const PORT = parseInt(process.env.PORT || '8080', 10);
const APIGEE_BASE = (process.env.APIGEE_HOST || 'https://YOUR_APIGEE_HOST').replace(/\/$/, '') + '/llm-router/v1';
// The demo always calls Apigee as one developer app (llm-router-premium-app); the UI has no app/plan concept.
const API_KEY = process.env.PREMIUM_KEY;

if (!API_KEY) {
  console.error('PREMIUM_KEY must be set (use ./run.sh to fetch it via apigeecli).');
  process.exit(1);
}

const STRATEGIES = ['rules', 'classifier', 'nvidia'];
const MODES = ['route', 'chat', 'stream'];
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PROMPT_CHARS = 20000;

// Illustrative list prices (USD per 1M tokens, input/output) used only for the cost widgets.
// Sources (checked 2026-09-27):
//   Vertex AI  https://cloud.google.com/vertex-ai/generative-ai/pricing  standard tier, global endpoint, <=200K input
//              (non-global regional endpoints are ~10% higher for Gemini 3.5)
//   Azure      https://prices.azure.com/api/retail/prices  "gpt 4.1 nano Inp/Outp glbl Tokens" (Global Standard)
//   Gemma 2:2b is self-hosted on Cloud Run: no per-token charge (you pay for Cloud Run compute).
//   GLM 5.2    Vertex AI MaaS (Z.ai, global endpoint): $1.40 in / $4.40 out (cached input $0.14), checked 2026-10-07.
// Model ids must match what the backends actually serve (verified via the gateway):
//   Gemini 3.1 Pro is only available as 'gemini-3.1-pro-preview'; Claude 3.5 Sonnet is retired on Vertex.
const CATALOG = {
  'gemini-3.5-flash-lite': { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', cost: '$', price: { in: 0.30, out: 2.50 } },
  'gpt-4.1-nano': { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', cost: '$', price: { in: 0.10, out: 0.40 } },
  'gemma2:2b': { id: 'gemma2:2b', label: 'Gemma 2:2b', cost: 'Free', price: { in: 0, out: 0 } },
  'gemini-3.5-flash': { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', cost: '$$', price: { in: 1.50, out: 9.00 } },
  'claude-sonnet-4-5@20250929': { id: 'claude-sonnet-4-5@20250929', label: 'Claude Sonnet 4.5', cost: '$$$$', price: { in: 3.00, out: 15.00 } },
  'gemini-3.1-pro-preview': { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', cost: '$$$', price: { in: 2.00, out: 12.00 } },
  'grok-4.6@001': { id: 'grok-4.6@001', label: 'Grok 4.6', cost: '$$', price: { in: 2.00, out: 6.00 } },
  'glm-5.2': { id: 'glm-5.2', label: 'GLM 5.2', cost: '$$', price: { in: 1.40, out: 4.40 } },
  'gemini-2.5-pro': { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', cost: '$$$', price: { in: 1.25, out: 10.00 } }
};

const MODELS = {
  simple: CATALOG['gemini-3.5-flash-lite'],
  standard: CATALOG['gemini-3.5-flash'],
  complex: CATALOG['gemini-3.1-pro-preview'],
  coding: CATALOG['gemini-2.5-pro'],
};

// Static files served by explicit allow-list (no path joins from user input).
const PUBLIC = path.join(__dirname, 'public');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/assets/google-cloud.png': ['assets/google-cloud.png', 'image/png'],
  '/assets/apigee-logo.svg': ['assets/apigee-logo.svg', 'image/svg+xml'],
  '/assets/rules-engine.png': ['assets/rules-engine.png', 'image/png'],
  '/assets/classifier.png': ['assets/classifier.png', 'image/png'],
  '/assets/nvidia.png': ['assets/nvidia.png', 'image/png'],
  '/assets/failover.png': ['assets/failover.png', 'image/png'],
  '/assets/architecture.png': ['assets/architecture.png', 'image/png'],
};
const ORG = process.env.ORG || 'YOUR_PROJECT_ID';
const ENV = process.env.APIGEE_ENV || 'default-dev';

// Rules engine config, read from the proxy bundle (single source of truth) for the "View Rules" dialog.
// The container image ships a copy and sets RULES_FILE.
const BUNDLE = path.join(__dirname, '..', 'apigee-proxies', 'llm-router', 'apiproxy', 'resources');
const RULES_FILE = process.env.RULES_FILE || path.join(BUNDLE, 'properties', 'routing.properties');
function loadRules() {
  try {
    const props = {};
    fs.readFileSync(RULES_FILE, 'utf8').split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/);
      if (m) props[m[1]] = m[2];
    });
    return {
      simpleMaxChars: parseInt(props.rules_simple_max_chars, 10) || 160,
      complexMinChars: parseInt(props.rules_complex_min_chars, 10) || 1500,
      minConfidence: parseFloat(props.min_confidence) || 0.5,
      tiers: ['simple', 'standard', 'complex', 'coding'].map(t => ({ tier: t, model: props['model_' + t] || '', thinking: props['thinking_' + t] || 'default' })),
      nvidia: {
        minTaskProb: parseFloat(props.nvidia_min_task_prob) || 0.2,
        complexTasks: (props.nvidia_complex_tasks || 'Code Generation').split(',').map(s => s.trim()),
        reasoningComplex: parseFloat(props.nvidia_reasoning_complex) || 0.4,
        domainComplex: parseFloat(props.nvidia_domain_complex) || 0.9,
        constraintComplex: parseFloat(props.nvidia_constraint_complex) || 0.45,
        simpleMaxComplexity: parseFloat(props.nvidia_simple_max_complexity) || 0.15,
        simpleMaxReasoning: parseFloat(props.nvidia_simple_max_reasoning) || 0.2,
      },
    };
  } catch (e) {
    console.error('Could not load rules config from proxy bundle:', e.message);
    return null;
  }
}
const RULES = loadRules();

const SECURITY_HEADERS = {
  // Google Fonts is the only third-party origin (Plus Jakarta Sans / JetBrains Mono, matching the reference demo UI).
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
};

// Tiny local rate limiter (Apigee SpikeArrest is the real control).
let windowStart = Date.now();
let windowCount = 0;
function rateLimited() {
  const now = Date.now();
  if (now - windowStart > 60000) { windowStart = now; windowCount = 0; }
  return ++windowCount > 60;
}

function send(res, status, body, type) {
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8' }, SECURITY_HEADERS));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Anti-CSRF / DNS-rebinding: only accept same-origin requests addressed to our own host.
// Local: http://127.0.0.1|localhost:PORT. Cloud Run: the service's own https://*.run.app URL, plus any
// custom domains listed in PUBLIC_HOSTS (comma-separated). Cloud Run only routes its own hosts to the container.
const LOCAL_HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const PUBLIC_HOSTS = (process.env.PUBLIC_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
const RUN_APP_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.run\.app$/;
function trustedRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const local = LOCAL_HOSTS.includes(host);
  const remote = !local && (PUBLIC_HOSTS.includes(host) || (ON_CLOUD_RUN && RUN_APP_HOST.test(host)));
  if (!local && !remote) return false;
  if (req.method === 'POST') {
    const expected = (local ? 'http://' : 'https://') + host;
    if (req.headers.origin !== expected) return false;
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return false;
  }
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

function decisionFromHeaders(r) {
  const h = k => r.headers.get(k) || '';
  return {
    model: h('x-routed-model'), tier: h('x-route-tier'), thinking: h('x-route-thinking') || null,
    decided_by: h('x-route-decided-by'),
    confidence: parseFloat(h('x-route-confidence')) || null, reason: h('x-route-reason'),
    fallback_reason: h('x-route-fallback') || null,
    task: h('x-route-task') || null,
    scores: h('x-route-scores') || null,
    user_tier: h('x-user-tier'), decision_ms: parseInt(h('x-route-decision-ms'), 10) || null,
    failover_from: h('x-route-failover-from') || null,
    failover_reason: h('x-route-failover-reason') || null,
  };
}

function usageFrom(u) {
  u = u || {};
  return { prompt: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), thoughts: u.thoughtsTokenCount || 0, total: u.totalTokenCount || 0 };
}

const ROUTING_TIERS = ['simple', 'standard', 'complex', 'coding'];

// Returns {} when absent, a clean {tier: modelId} map when valid, or false when anything is off.
function sanitizePrefs(prefs) {
  if (prefs === undefined || prefs === null) return {};
  if (typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  const out = {};
  for (const [tier, modelId] of Object.entries(prefs)) {
    if (!ROUTING_TIERS.includes(tier)) return false;
    if (modelId === null || modelId === '') continue;
    if (typeof modelId !== 'string' || !Object.prototype.hasOwnProperty.call(CATALOG, modelId)) return false;
    out[tier] = modelId;
  }
  return out;
}

// GLM 5.2 with a 16k-token budget can take ~3 min; the Apigee target and LB allow longer.
const GATEWAY_TIMEOUT_MS = 180000;
// Errors raised before the request reached Apigee, so retrying cannot duplicate an LLM call.
const CONNECT_ERRORS = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);

async function fetchGateway(url, init) {
  const signal = AbortSignal.timeout(GATEWAY_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, init, { signal }));
  } catch (e) {
    const code = e && e.cause && e.cause.code;
    if (!CONNECT_ERRORS.has(code) || signal.aborted) throw e;
    console.warn(`Gateway connect failed (${code}); retrying once`);
    await new Promise(r => setTimeout(r, 300));
    return fetch(url, Object.assign({}, init, { signal }));
  }
}

function gatewayHeaders(input) {
  const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'x-router-strategy': input.strategy };
  for (const [tier, modelId] of Object.entries(input.prefs || {})) headers[`x-preferred-model-${tier}`] = modelId;
  if (input.simulateOutage) headers['x-simulate-outage'] = 'primary';
  return headers;
}

async function callGateway(input) {
  const t0 = Date.now();
  const headers = gatewayHeaders(input);
  const r = await fetchGateway(`${APIGEE_BASE}/${input.mode}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt: input.prompt }),
  });
  const latencyMs = Date.now() - t0;
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON upstream body */ }

  const out = { status: r.status, latencyMs, mode: input.mode, strategy: input.strategy };

  if (input.mode === 'route' && r.ok && json) {
    out.decision = json;
  } else {
    out.decision = decisionFromHeaders(r);
    if (r.ok && json) {
      const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
      out.answer = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
      const reasoning = parts.filter(p => typeof p.text === 'string' && p.thought).map(p => p.text).join('');
      if (reasoning) out.reasoning = reasoning;
      out.usage = usageFrom(json.usageMetadata);
    }
  }
  if (!r.ok) out.error = (json && json.error && json.error.message) || `Gateway returned HTTP ${r.status}`;
  return out;
}

// Streaming: Apigee /v1/stream returns Vertex SSE ("data: {...}\n\n"); we forward NDJSON events.
async function streamGateway(input, res) {
  const t0 = Date.now();
  const emit = obj => res.write(JSON.stringify(obj) + '\n');
  const r = await fetchGateway(`${APIGEE_BASE}/stream`, {
    method: 'POST',
    headers: gatewayHeaders(input),
    body: JSON.stringify({ prompt: input.prompt }),
  });
  res.writeHead(200, Object.assign({ 'Content-Type': 'application/x-ndjson; charset=utf-8' }, SECURITY_HEADERS));
  const headersMs = Date.now() - t0;
  emit({ type: 'meta', status: r.status, headersMs, strategy: input.strategy, decision: decisionFromHeaders(r) });

  if (!r.ok) {
    let msg = `Gateway returned HTTP ${r.status}`;
    try { const j = JSON.parse(await r.text()); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { /* ignore */ }
    emit({ type: 'error', error: msg });
    return res.end();
  }

  const decoder = new TextDecoder();
  let buf = '';
  let ttftMs = null;
  let usage = null;
  let chunks = 0;
  for await (const piece of r.body) {
    buf += decoder.decode(piece, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
      const parts = (((ev.candidates || [])[0] || {}).content || {}).parts || [];
      // Reasoning models (e.g. GLM 5.2 on Vertex AI MaaS) return their thinking as Gemini "thought" parts.
      const reasoning = parts.filter(p => typeof p.text === 'string' && p.thought).map(p => p.text).join('');
      if (reasoning) emit({ type: 'reasoning', text: reasoning });
      const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
      if (text) {
        if (ttftMs === null) ttftMs = Date.now() - t0;
        chunks++;
        emit({ type: 'delta', text });
      }
      if (ev.usageMetadata) usage = usageFrom(ev.usageMetadata);
    }
  }
  emit({ type: 'done', latencyMs: Date.now() - t0, ttftMs, chunks, usage });
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    if (!trustedRequest(req)) return send(res, 403, { error: 'Forbidden' });
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, file)), type);
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return send(res, 200, { models: MODELS, catalog: CATALOG, strategies: STRATEGIES, gateway: APIGEE_BASE.replace(/^https?:\/\//, ''), org: ORG, env: ENV });
    }
    if (req.method === 'GET' && url.pathname === '/api/rules') {
      return RULES ? send(res, 200, RULES) : send(res, 503, { error: 'Rules configuration unavailable.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/gateway') {
      if (rateLimited()) return send(res, 429, { error: 'Too many requests, slow down.' });
      let body;
      try { body = await readJson(req); } catch (e) {
        return send(res, e.message === 'too_large' ? 413 : 400, { error: 'Invalid request body.' });
      }
      const input = {
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        strategy: STRATEGIES.includes(body.strategy) ? body.strategy : null,
        mode: MODES.includes(body.mode) ? body.mode : null,
        prefs: sanitizePrefs(body.prefs),
        simulateOutage: body.simulateOutage === true,
      };
      const badFlag = body.simulateOutage !== undefined && typeof body.simulateOutage !== 'boolean';
      if (!input.prompt.trim() || input.prompt.length > MAX_PROMPT_CHARS || !input.strategy || !input.mode || input.prefs === false || badFlag) {
        return send(res, 400, { error: 'Invalid prompt, strategy, mode, model preference or option.' });
      }
      if (input.mode === 'stream') return await streamGateway(input, res);
      return send(res, 200, await callGateway(input));
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('Request failed:', e.name, e.message); // no prompts/keys logged
    if (res.headersSent) {
      try { res.write(JSON.stringify({ type: 'error', error: 'Stream interrupted.' }) + '\n'); } catch (_) { /* socket gone */ }
      return res.end();
    }
    return send(res, 502, { error: 'Could not reach the Apigee gateway.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LLM Router demo UI: http://localhost:${PORT}  ->  ${APIGEE_BASE}`);
});
