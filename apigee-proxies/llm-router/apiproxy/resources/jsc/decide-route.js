var TIERS = ['simple', 'standard', 'complex', 'coding'];

function clean(s, maxLen) {
  if (!s) return s;
  s = String(s).replace(/[\r\n]+/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen - 3) + '...';
  return s;
}

function num(v, def) {
  var n = parseFloat(v);
  return isNaN(n) ? def : n;
}

function modelFor(tier) {
  var pref = context.getVariable('request.header.x-preferred-model-' + tier);
  if (pref) return pref;
  var fallback = context.getVariable('request.header.x-preferred-model');
  if (fallback) return fallback;
  
  var m = context.getVariable('propertyset.routing.model_' + tier);
  // defaults if KVM/properties are missing
  if (!m) {
    if (tier === 'simple') m = 'gemini-3.5-flash-lite';
    else if (tier === 'standard') m = 'gemini-3.5-flash';
    else if (tier === 'complex') m = 'gemini-3.1-pro-preview';
    else if (tier === 'coding') m = 'gemini-2.5-pro';
    else m = 'gemini-3.5-flash';
  }
  return m;
}

function rulesVerdict(prompt) {
  var simpleMax = num(context.getVariable('propertyset.routing.rules_simple_max_chars'), 160);
  var complexMin = num(context.getVariable('propertyset.routing.rules_complex_min_chars'), 1500);
  var len = prompt ? prompt.length : 0;
  var tier = len < simpleMax ? 'simple' : (len >= complexMin ? 'complex' : 'standard');
  return { tier: tier, confidence: 1.0, reason: 'prompt length ' + len + ' chars' };
}

function parseClassifier() {
  var status = context.getVariable('classifierResponse.status.code');
  if (String(status) !== '200') return { error: 'classifier unavailable (status ' + (status || 'n/a') + ')' };
  try {
    var r = JSON.parse(context.getVariable('classifierResponse.content'));
    var txt = r.candidates[0].content.parts[0].text;
    var v = JSON.parse(txt);
    return { tier: v.tier, confidence: num(v.confidence, 0), reason: v.reason, domain: v.domain };
  } catch (e) {
    return { error: 'classifier returned unparsable verdict' };
  }
}

function parseExternal() {
  var status = context.getVariable('externalResponse.status.code');
  if (String(status) !== '200') return { error: 'external engine unavailable (status ' + (status || 'n/a') + ')' };
  try {
    var v = JSON.parse(context.getVariable('externalResponse.content'));
    var tier = v.tier;
    // Engine may name a model instead of a tier; accept only configured models (allow-list).
    if (!tier && v.model) {
      for (var i = 0; i < TIERS.length; i++) if (modelFor(TIERS[i]) === v.model) tier = TIERS[i];
    }
    return { tier: tier, confidence: num(v.confidence, 1), reason: v.reason, domain: v.domain };
  } catch (e) {
    return { error: 'external engine returned unparsable verdict' };
  }
}

function score(v) {
  var n = parseFloat(v);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }

// Self-hosted NVIDIA NemoCurator classifier (Cloud Run) returns task type + complexity
// dimensions; the tier mapping lives here so it can be tuned via routing.properties.
function parseNvidia() {
  var status = context.getVariable('nvidiaResponse.status.code');
  if (String(status) !== '200') return { error: 'NVIDIA classifier unavailable (status ' + (status || 'n/a') + ')' };
  var r;
  try {
    r = JSON.parse(context.getVariable('nvidiaResponse.content'));
  } catch (e) {
    return { error: 'NVIDIA classifier returned unparsable response' };
  }
  var task = clean(r.task_type, 40);
  var s = {
    p: score(r.task_prob), cx: score(r.complexity), rs: score(r.reasoning), cr: score(r.creativity),
    dk: score(r.domain_knowledge), ct: score(r.constraints)
  };
  for (var k in s) if (s[k] === null) return { error: 'NVIDIA classifier response missing ' + k };

  var P = 'propertyset.routing.';
  var complexTasks = String(context.getVariable(P + 'nvidia_complex_tasks') || 'Code Generation').split(',');
  var reasoningComplex = num(context.getVariable(P + 'nvidia_reasoning_complex'), 0.4);
  var domainComplex = num(context.getVariable(P + 'nvidia_domain_complex'), 0.9);
  var constraintComplex = num(context.getVariable(P + 'nvidia_constraint_complex'), 0.45);
  var simpleMaxCx = num(context.getVariable(P + 'nvidia_simple_max_complexity'), 0.15);
  var simpleMaxRs = num(context.getVariable(P + 'nvidia_simple_max_reasoning'), 0.2);

  var isCodingTask = false;
  for (var i = 0; i < complexTasks.length; i++) if (complexTasks[i].trim() === task) isCodingTask = true;
  if (task === 'System Design') isCodingTask = true;

  var tier, reason;
  if (isCodingTask) { 
    tier = 'coding'; 
    reason = task + ' task'; 
  }
  else if (s.rs >= reasoningComplex) { tier = 'complex'; reason = 'reasoning ' + fmt(s.rs) + ' >= ' + reasoningComplex; }
  else if (s.dk >= domainComplex && s.ct >= constraintComplex) {
    tier = 'complex'; reason = 'domain ' + fmt(s.dk) + ' + constraints ' + fmt(s.ct);
  } else if (s.cx < simpleMaxCx && s.rs < simpleMaxRs) {
    tier = 'simple'; reason = 'low complexity ' + fmt(s.cx) + ', ' + task;
  } else { tier = 'standard'; reason = 'moderate complexity ' + fmt(s.cx) + ', ' + task; }

  var scores = 'task=' + task + ';p=' + fmt(s.p) + ';complexity=' + fmt(s.cx) + ';reasoning=' + fmt(s.rs) +
    ';creativity=' + fmt(s.cr) + ';domain=' + fmt(s.dk) + ';constraints=' + fmt(s.ct);
  context.setVariable('llmr.task', task);
  context.setVariable('llmr.scores', scores);
  context.setVariable('llmr.engine_ms', String(num(r.latency_ms, 0)));
  if (task === 'Unknown') return { error: 'NVIDIA classifier task type Unknown' };
  return { tier: tier, confidence: s.p, reason: reason, domain: task };
}

var strategy = context.getVariable('llmr.strategy');
var prompt = context.getVariable('route_internal.prompt');
var minConf = strategy === 'nvidia'
  ? num(context.getVariable('propertyset.routing.nvidia_min_task_prob'), 0.2)
  : num(context.getVariable('propertyset.routing.min_confidence'), 0.5);

var verdict;
var fallbackReason = '';
if (strategy === 'classifier') verdict = parseClassifier();
else if (strategy === 'nvidia') verdict = parseNvidia();
else if (strategy === 'external') verdict = parseExternal();
else verdict = rulesVerdict(prompt);

if (strategy !== 'rules') {
  if (verdict.error) fallbackReason = verdict.error;
  else if (TIERS.indexOf(verdict.tier) < 0) fallbackReason = 'invalid tier from ' + strategy;
  else if (verdict.confidence < minConf) fallbackReason = 'low confidence ' + verdict.confidence + ' < ' + minConf;
  if (fallbackReason) verdict = rulesVerdict(prompt);
}

var decidedBy = fallbackReason ? 'rules (fallback)' : strategy;
var tier = verdict.tier;
var userTier = context.getVariable('llmr.user_tier');

var model = modelFor(tier);

// Reasoning-effort governance: the tier also decides how much the model may "think".
// "default" = leave it to the model (e.g. 2.5 Pro, which cannot disable thinking).
var ALLOWED_THINKING = ['minimal', 'low', 'medium', 'high'];
var thinking = context.getVariable('propertyset.routing.thinking_' + tier) || 'default';
if (ALLOWED_THINKING.indexOf(thinking) < 0) thinking = 'default';
// thinkingLevel exists only on Gemini 3.x; Gemini 2.5 takes a token budget instead
// (sending thinkingLevel to 2.5 Pro returns HTTP 400). Other providers: leave untouched.
var IS_GEMINI3 = /^gemini-3/.test(model);
var IS_GEMINI25 = /^gemini-2\.5/.test(model);
var THINKING_BUDGET = { minimal: 128, low: 1024, medium: 8192, high: 24576 };
if (!IS_GEMINI3 && !IS_GEMINI25) thinking = 'default';

var failoverBody = '';
if (context.getVariable('llmr.mode') !== 'route') {
  try {
    var reqBody = JSON.parse(context.getVariable('request.content'));
    var changed = false;
    reqBody.generationConfig = reqBody.generationConfig || {};
    if (reqBody.generationConfig.thinkingConfig) {
      thinking = 'client';
    } else if (thinking !== 'default') {
      reqBody.generationConfig.thinkingConfig = IS_GEMINI3
        ? { thinkingLevel: thinking }
        : { thinkingBudget: THINKING_BUDGET[thinking] };
      changed = true;
    }
    if (changed) context.setVariable('request.content', JSON.stringify(reqBody));
    // Failover copy of the Gemini request (taken before any provider translation), minus the model-specific thinking config.
    var fb = JSON.parse(JSON.stringify(reqBody));
    if (fb.generationConfig) delete fb.generationConfig.thinkingConfig;
    failoverBody = JSON.stringify(fb);
  } catch (e) {
    thinking = 'default';
  }
}

var t0 = num(context.getVariable('llmr.t0'), Date.now());
var decisionMs = Date.now() - t0;

var isClaude = model.indexOf('claude') >= 0;
var isAzure = model.indexOf('gpt-4') >= 0;
var isGemma = model.indexOf('gemma') >= 0;
var isGrok = model.indexOf('grok') >= 0;

// Vertex AI MaaS (open models served by Google on the OpenAI-compatible endpoint), allow-listed in
// routing.properties as "maas_models=<short id>|<publisher model id>,...".
var maasModelId = '';
var maasList = String(context.getVariable('propertyset.routing.maas_models') || '').split(',');
for (var mi = 0; mi < maasList.length; mi++) {
  var pair = maasList[mi].split('|');
  if (pair.length === 2 && pair[0].trim() === model) maasModelId = pair[1].trim();
}
var isMaas = maasModelId !== '';
if (isMaas) { isClaude = false; isAzure = false; isGemma = false; isGrok = false; } // allow-list wins over name matching

context.setVariable('llmr.is_claude', isClaude ? 'true' : 'false');
context.setVariable('llmr.is_azure', isAzure ? 'true' : 'false');
context.setVariable('llmr.is_gemma', isGemma ? 'true' : 'false');
context.setVariable('llmr.is_maas', isMaas ? 'true' : 'false');

if (isMaas) {
  // One OpenAI-compatible endpoint for every MaaS model; the model is chosen by the "model" field (maas-request.js).
  context.setVariable('llmr.publisher', maasModelId.split('/')[0]);
  context.setVariable('llmr.maas_model_id', maasModelId);
  context.setVariable('llmr.target_location', context.getVariable('propertyset.routing.maas_location') || 'global');
  context.setVariable('llmr.target_host', 'aiplatform.googleapis.com');
  context.setVariable('llmr.target_url', 'https://' + context.getVariable('llmr.target_host') + '/v1/projects/' + context.getVariable('propertyset.routing.project') + '/locations/' + context.getVariable('llmr.target_location') + '/endpoints/openapi/chat/completions');
} else if (isAzure) {
  // Azure AI Foundry Custom Endpoint
  context.setVariable('llmr.publisher', 'azure');
  context.setVariable('llmr.target_url', 'https://YOUR_AZURE_RESOURCE.services.ai.azure.com/openai/v1/chat/completions');
} else if (isGemma) {
  // Cloud Run private endpoint
  context.setVariable('llmr.publisher', 'ollama');
  context.setVariable('llmr.target_url', 'https://gemma2-api-YOUR_PROJECT_NUMBER.asia-southeast1.run.app/v1/chat/completions');
} else if (isClaude) {
  context.setVariable('llmr.publisher', 'anthropic');
  // Always unary rawPredict; on /stream the translated answer is wrapped as a single SSE event.
  context.setVariable('llmr.url_suffix', ':rawPredict');
  // Claude Sonnet 4.5 is served from us-east5
  context.setVariable('llmr.target_location', 'us-east5');
  context.setVariable('llmr.target_host', 'us-east5-aiplatform.googleapis.com');
  context.setVariable('llmr.target_url', 'https://' + context.getVariable('llmr.target_host') + '/v1/projects/' + context.getVariable('propertyset.routing.project') + '/locations/' + context.getVariable('llmr.target_location') + '/publishers/' + context.getVariable('llmr.publisher') + '/models/' + model + context.getVariable('llmr.url_suffix'));
} else {
  context.setVariable('llmr.publisher', isGrok ? 'xai' : 'google');
  var mode = context.getVariable('llmr.mode');
  context.setVariable('llmr.url_suffix', mode === 'stream' ? ':streamGenerateContent?alt=sse' : ':generateContent');
  context.setVariable('llmr.target_location', context.getVariable('propertyset.routing.location'));
  context.setVariable('llmr.target_host', 'aiplatform.googleapis.com');
  context.setVariable('llmr.target_url', 'https://' + context.getVariable('llmr.target_host') + '/v1/projects/' + context.getVariable('propertyset.routing.project') + '/locations/' + context.getVariable('llmr.target_location') + '/publishers/' + context.getVariable('llmr.publisher') + '/models/' + model + context.getVariable('llmr.url_suffix'));
}

// ---- Model failover: if the chosen model fails (404/408/429/5xx...), the target response flow retries once on a
// backup Gemini model on Vertex AI (native request format, so no translation). See failover-check.js / failover-apply.js.
var FAILOVER_DEFAULTS = { simple: 'gemini-3.5-flash', standard: 'gemini-3.5-flash-lite', complex: 'gemini-2.5-pro', coding: 'gemini-3.1-pro-preview' };
var backup = context.getVariable('propertyset.routing.failover_' + tier) || FAILOVER_DEFAULTS[tier] || 'gemini-3.5-flash';
if (!/^gemini-/.test(backup)) backup = 'gemini-3.5-flash';
if (backup === model) backup = model === 'gemini-3.5-flash' ? 'gemini-3.5-flash-lite' : 'gemini-3.5-flash';
var failoverOn = context.getVariable('propertyset.routing.failover_enabled') !== 'false' && failoverBody !== '';
context.setVariable('llmr.failover_enabled', failoverOn ? 'true' : 'false');
context.setVariable('llmr.failover_model', backup);
context.setVariable('llmr.failover_body', failoverBody);

// Demo only: "x-simulate-outage: primary" points the chosen model's call at a path that returns 404 on the same host
// (credentials never go to a different host), which triggers the failover above. Disabled unless the property allows it.
var simulate = context.getVariable('propertyset.routing.allow_outage_simulation') === 'true' &&
  context.getVariable('llmr.mode') !== 'route' &&
  String(context.getVariable('request.header.x-simulate-outage') || '').toLowerCase().trim() === 'primary';
if (simulate) {
  var turl = context.getVariable('llmr.target_url');
  turl = (isAzure || isGemma || isMaas)
    ? turl.replace(/\/chat\/completions$/, '/simulated-outage')
    : turl.replace('/models/' + model, '/models/' + model + '-simulated-outage');
  context.setVariable('llmr.target_url', turl);
}
context.setVariable('llmr.simulated_outage', simulate ? 'true' : 'false');

context.setVariable('llmr.tier', tier);
context.setVariable('llmr.model', model);
context.setVariable('llmr.thinking', thinking);
context.setVariable('llmr.decided_by', decidedBy);
context.setVariable('llmr.confidence', String(Math.round(verdict.confidence * 100) / 100));
context.setVariable('llmr.reason', clean(verdict.reason));
context.setVariable('llmr.domain', clean(verdict.domain || '', 40));
context.setVariable('llmr.fallback_reason', clean(fallbackReason));
context.setVariable('llmr.decision_ms', String(decisionMs));


context.setVariable('llmr.decision_json', JSON.stringify({
  model: model,
  tier: tier,
  thinking: thinking,
  requested_strategy: strategy,
  decided_by: decidedBy,
  confidence: Math.round(verdict.confidence * 100) / 100,
  domain: verdict.domain || null,
  reason: clean(verdict.reason),
  fallback_reason: fallbackReason || null,
  user_tier: userTier,
  prompt_chars: num(context.getVariable('llmr.prompt_chars'), 0),
  classifier_scores: context.getVariable('llmr.scores') || null,
  decision_ms: decisionMs
}, null, 2));
