// facade-request.js - Anthropic Messages facade, request side.
// Serves GET /v1/models, POST /v1/messages/count_tokens and HEAD /api/hello locally, and for
// POST /v1/messages checks the requested model against the caller's API product, then translates the
// Anthropic request into the backend's format (OpenAI chat/completions for Vertex AI MaaS, Gemini
// generateContent, or Claude rawPredict on Vertex AI).

var suffix = String(context.getVariable('proxy.pathsuffix') || '');
var verb = String(context.getVariable('request.verb') || '');
var table = FX.modelTable();
var allowed = FX.allowedModels();
var P = 'propertyset.routing.';

function localReply(status, body, ctype) {
  context.setVariable('llmr.fx_local', 'true');
  context.setVariable('llmr.fx_status', String(status));
  context.setVariable('llmr.fx_body', body);
  context.setVariable('llmr.fx_ctype', ctype || 'application/json');
}

function fail(status, message) {
  localReply(status, FX.errorBody(FX.errorTypeForStatus(status), message));
}

// Models this caller may use: on the product allow-list AND configured in the gateway.
function usableModels() {
  var out = [];
  for (var i = 0; i < table.order.length; i++) {
    var id = table.order[i];
    if (FX.contains(allowed, id)) out.push(table.byId[id]);
  }
  return out;
}

context.setVariable('llmr.fx_local', 'false');
context.setVariable('llmr.tier', String(context.getVariable('request.header.x-claude-code-request-class') || 'agent'));
context.setVariable('llmr.decided_by', 'client:' + String(context.getVariable('request.header.x-client-app') || 'anthropic-api'));
context.setVariable('llmr.session_id', String(context.getVariable('request.header.x-claude-code-session-id') || ''));

if (suffix === '/api/hello') {
  // Claude Code connection-warming probe.
  localReply(200, '', 'text/plain');
} else if (verb === 'GET' && suffix === '/v1/models') {
  var models = usableModels();
  var data = [];
  for (var i = 0; i < models.length; i++) {
    data.push({ type: 'model', id: models[i].id, display_name: models[i].label, created_at: '2026-01-01T00:00:00Z' });
  }
  localReply(200, JSON.stringify({
    data: data, has_more: false,
    first_id: data.length ? data[0].id : null, last_id: data.length ? data[data.length - 1].id : null
  }));
} else if (verb === 'POST' && (suffix === '/v1/messages' || suffix === '/v1/messages/count_tokens')) {
  var req = null;
  try { req = JSON.parse(context.getVariable('request.content') || ''); } catch (e) { req = null; }
  if (!req || typeof req !== 'object') {
    fail(400, 'Request body must be a JSON Anthropic Messages request.');
  } else if (!req.model) {
    fail(400, 'model is required.');
  } else if (!FX.contains(allowed, req.model) || !table.byId[req.model]) {
    var names = [];
    var u = usableModels();
    for (var k = 0; k < u.length; k++) names.push(u[k].id);
    fail(403, 'model_not_allowed: "' + req.model + '" is not allowed for this app. Allowed models: ' +
      (names.length ? names.join(', ') : '(none)') + '. Ask your Apigee admin to add it to your API product.');
    context.setVariable('llmr.model', String(req.model).substring(0, 80));
  } else if (suffix === '/v1/messages/count_tokens') {
    // Estimate (about 4 characters per token). Claude Code uses it for /context; exact counts are optional.
    var chars = JSON.stringify(req.system || '').length + JSON.stringify(req.messages || []).length + JSON.stringify(req.tools || []).length;
    localReply(200, JSON.stringify({ input_tokens: Math.ceil(chars / 4) }));
    context.setVariable('llmr.model', req.model);
  } else {
    buildBackendRequest(req, table.byId[req.model]);
  }
} else {
  fail(404, 'Not found. This gateway serves POST /v1/messages, POST /v1/messages/count_tokens and GET /v1/models.');
}

// ---------------------------------------------------------------------------------------------
function buildBackendRequest(req, m) {
  var project = context.getVariable(P + 'project');
  var stream = req.stream === true;
  var body, url;

  context.setVariable('llmr.model', m.id);
  context.setVariable('llmr.requested_model', m.id);
  context.setVariable('llmr.fx_kind', m.kind);
  context.setVariable('llmr.fx_stream', stream ? 'true' : 'false');

  if (m.kind === 'maas' || m.kind === 'maas-thinking') {
    body = toOpenAI(req, m);
    url = 'https://aiplatform.googleapis.com/v1/projects/' + project + '/locations/' +
      (context.getVariable(P + 'maas_location') || 'global') + '/endpoints/openapi/chat/completions';
  } else if (m.kind === 'gemini') {
    body = toGemini(req, m);
    url = 'https://aiplatform.googleapis.com/v1/projects/' + project + '/locations/' +
      context.getVariable(P + 'location') + '/publishers/google/models/' + m.backend + ':generateContent';
  } else if (m.kind === 'claude') {
    body = toVertexClaude(req);
    url = 'https://us-east5-aiplatform.googleapis.com/v1/projects/' + project +
      '/locations/us-east5/publishers/anthropic/models/' + m.backend + ':rawPredict';
  } else {
    fail(500, 'Gateway misconfiguration: unknown backend kind for ' + m.id + '.');
    return;
  }

  // Demo only: "x-simulate-outage: primary" sends the primary call to a path on the same host that 404s,
  // which triggers failover. Credentials never go to a different host.
  var simulate = context.getVariable(P + 'allow_outage_simulation') === 'true' &&
    String(context.getVariable('request.header.x-simulate-outage') || '').toLowerCase().trim() === 'primary';
  if (simulate) {
    url = (m.kind === 'gemini' || m.kind === 'claude')
      ? url.replace('/models/' + m.backend, '/models/' + m.backend + '-simulated-outage')
      : url.replace(/\/chat\/completions$/, '/simulated-outage');
  }
  context.setVariable('llmr.simulated_outage', simulate ? 'true' : 'false');

  context.setVariable('llmr.target_url', url);
  context.setVariable('llmr.fx_backend_body', JSON.stringify(body));

  // Failover: one retry on a Gemini model that is ALSO on the caller's allow-list (never widen access).
  var candidates = String(context.getVariable(P + 'facade_failover_models') || 'gemini-3.5-flash,gemini-3.5-flash-lite').split(',');
  var backup = '';
  for (var i = 0; i < candidates.length && !backup; i++) {
    var c = candidates[i].trim();
    if (c && c !== m.id && FX.contains(allowed, c) && table.byId[c] && table.byId[c].kind === 'gemini') backup = c;
  }
  var failoverOn = backup !== '' && context.getVariable(P + 'failover_enabled') !== 'false';
  context.setVariable('llmr.failover_enabled', failoverOn ? 'true' : 'false');
  if (failoverOn) {
    context.setVariable('llmr.failover_model', table.byId[backup].backend);
    context.setVariable('llmr.failover_id', backup);
    context.setVariable('llmr.failover_body', JSON.stringify(m.kind === 'gemini' ? body : toGemini(req, table.byId[backup])));
  } else {
    context.setVariable('llmr.failover_body', '{}');
  }
}

// ---- Anthropic -> OpenAI chat/completions (Vertex AI MaaS) ------------------------------------
function toOpenAI(req, m) {
  var msgs = [];
  var sys = FX.systemText(req.system, req.messages);
  if (sys) msgs.push({ role: 'system', content: sys });

  var list = req.messages || [];
  for (var i = 0; i < list.length; i++) {
    var msg = list[i] || {};
    if (msg.role === 'system') continue; // already merged into the system prompt
    var content = msg.content;
    if (typeof content === 'string') { msgs.push({ role: msg.role, content: content }); continue; }
    content = content || [];
    if (msg.role === 'assistant') {
      var text = [], calls = [];
      for (var j = 0; j < content.length; j++) {
        var b = content[j] || {};
        if (b.type === 'text') text.push(b.text);
        else if (b.type === 'tool_use') calls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
        // thinking / redacted_thinking blocks are not sent back to the model
      }
      var a = { role: 'assistant', content: text.length ? text.join('\n') : null };
      if (calls.length) a.tool_calls = calls;
      if (a.content !== null || calls.length) msgs.push(a);
    } else {
      // Tool results must directly follow the assistant tool_calls, as role "tool" messages.
      var userText = [];
      for (var k = 0; k < content.length; k++) {
        var c = content[k] || {};
        if (c.type === 'tool_result') {
          var out = FX.textOf(c.content);
          if (c.is_error) out = 'ERROR: ' + out;
          msgs.push({ role: 'tool', tool_call_id: c.tool_use_id, content: out || '(no output)' });
        } else if (c.type === 'text') {
          userText.push(c.text);
        } else if (c.type === 'image' || c.type === 'document') {
          userText.push(FX.textOf([c]));
        }
      }
      if (userText.length) msgs.push({ role: 'user', content: userText.join('\n') });
    }
  }

  var body = { model: m.backend, messages: msgs, stream: false };
  var tools = FX.customTools(req.tools);
  if (tools.length) {
    body.tools = [];
    for (var t = 0; t < tools.length; t++) {
      body.tools.push({ type: 'function', function: { name: tools[t].name, description: tools[t].description || '', parameters: FX.cleanSchema(tools[t].input_schema) } });
    }
    var tc = req.tool_choice;
    if (tc && tc.type === 'any') body.tool_choice = 'required';
    else if (tc && tc.type === 'tool' && tc.name) body.tool_choice = { type: 'function', function: { name: tc.name } };
    else if (tc && tc.type === 'none') body.tool_choice = 'none';
  }

  var cap = parseInt(context.getVariable(P + 'facade_maas_max_tokens'), 10) || 32768;
  var maxTokens = Math.min(parseInt(req.max_tokens, 10) || 8192, cap);
  if (m.kind === 'maas-thinking') {
    var floor = parseInt(context.getVariable(P + 'maas_min_max_tokens'), 10) || 16384;
    if (maxTokens < floor) maxTokens = floor;
  } else {
    // "glm-5.2": reasoning off for fast agent turns.
    body.chat_template_kwargs = { enable_thinking: false };
  }
  body.max_tokens = maxTokens;
  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (typeof req.top_p === 'number') body.top_p = req.top_p;
  if (req.stop_sequences && req.stop_sequences.length) body.stop = req.stop_sequences.slice(0, 4);
  return body;
}

// ---- Anthropic -> Gemini generateContent (Vertex AI) -----------------------------------------
function toGemini(req, m) {
  var names = {}; // tool_use id -> tool name (functionResponse needs the name)
  var contents = [];
  function push(role, part) {
    var last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(part);
    else contents.push({ role: role, parts: [part] });
  }

  var list = req.messages || [];
  for (var i = 0; i < list.length; i++) {
    var msg = list[i] || {};
    if (msg.role === 'system') continue; // merged into systemInstruction below
    var role = msg.role === 'assistant' ? 'model' : 'user';
    var content = msg.content;
    if (typeof content === 'string') { push(role, { text: content }); continue; }
    content = content || [];
    for (var j = 0; j < content.length; j++) {
      var b = content[j] || {};
      if (b.type === 'text' && b.text) push(role, { text: b.text });
      else if (b.type === 'tool_use') {
        names[b.id] = b.name;
        // Gemini 3 validates thought signatures on replayed function calls; calls produced by another
        // model (or translated by this gateway) have none, so use the documented bypass value.
        push('model', { functionCall: { name: b.name, args: b.input || {} }, thoughtSignature: 'skip_thought_signature_validator' });
      } else if (b.type === 'tool_result') {
        var out = FX.textOf(b.content);
        push('user', { functionResponse: { name: names[b.tool_use_id] || 'tool', response: b.is_error ? { error: out } : { content: out } } });
      } else if (b.type === 'image' || b.type === 'document') {
        push(role, { text: FX.textOf([b]) });
      }
    }
  }

  var body = { contents: contents };
  var sys = FX.systemText(req.system, req.messages);
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };

  var tools = FX.customTools(req.tools);
  if (tools.length) {
    var decls = [];
    for (var t = 0; t < tools.length; t++) {
      // parametersJsonSchema accepts full JSON Schema (Claude Code's tool schemas use keywords the
      // older OpenAPI-subset "parameters" field rejects).
      decls.push({ name: tools[t].name, description: tools[t].description || '', parametersJsonSchema: FX.cleanSchema(tools[t].input_schema) });
    }
    body.tools = [{ functionDeclarations: decls }];
    var tc = req.tool_choice;
    if (tc && tc.type === 'any') body.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
    else if (tc && tc.type === 'tool' && tc.name) body.toolConfig = { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tc.name] } };
    else if (tc && tc.type === 'none') body.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
  }

  var gc = {};
  var cap = parseInt(context.getVariable(P + 'facade_gemini_max_tokens'), 10) || 65536;
  gc.maxOutputTokens = Math.min(parseInt(req.max_tokens, 10) || 8192, cap);
  if (typeof req.temperature === 'number') gc.temperature = req.temperature;
  if (typeof req.top_p === 'number') gc.topP = req.top_p;
  if (req.stop_sequences && req.stop_sequences.length) gc.stopSequences = req.stop_sequences.slice(0, 5);
  body.generationConfig = gc;
  return body;
}

// ---- Anthropic -> Claude on Vertex AI (rawPredict) -------------------------------------------
// Nearly a pass-through: Vertex wants anthropic_version in the body and no "model" field.
// Streaming is done by this gateway (unary call, then SSE built from the full message).
function toVertexClaude(req) {
  var body = JSON.parse(JSON.stringify(req));
  delete body.model;
  delete body.stream;
  body.anthropic_version = 'vertex-2023-10-16';
  // Claude Code sends request fields for its newest models to gateway aliases. Sonnet 4.5 on Vertex rejects
  // adaptive reasoning and output_config (effort), so drop them here rather than fail the first request.
  if (body.thinking && body.thinking.type === 'adaptive') delete body.thinking;
  delete body.output_config;
  delete body.context_management;
  return body;
}
