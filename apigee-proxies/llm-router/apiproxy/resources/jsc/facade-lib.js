// facade-lib.js - shared helpers for the Anthropic Messages facade (/llm-router/anthropic).
// Included by facade-request.js and facade-response.js (IncludeURL). ES5 only (Apigee Rhino).

var FX = {};

// Anthropic-format error body. Claude Code matches on these types and on the message wording.
FX.errorBody = function (type, message) {
  return JSON.stringify({ type: 'error', error: { type: type, message: message } });
};

FX.errorTypeForStatus = function (status) {
  if (status === 400 || status === 413 || status === 422) return 'invalid_request_error';
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 429) return 'rate_limit_error';
  if (status === 529 || status === 503) return 'overloaded_error';
  return 'api_error';
};

// Model table from routing.properties:
//   facade_models=<id>|<kind>|<backend model>|<label>,...
// kind: maas | maas-thinking | gemini | claude
FX.modelTable = function () {
  var raw = String(context.getVariable('propertyset.routing.facade_models') || '');
  var out = {}, order = [];
  var items = raw.split(',');
  for (var i = 0; i < items.length; i++) {
    var p = items[i].split('|');
    if (p.length < 3) continue;
    var id = p[0].trim();
    if (!id) continue;
    out[id] = { id: id, kind: p[1].trim(), backend: p[2].trim(), label: (p[3] || id).trim() };
    order.push(id);
  }
  return { byId: out, order: order };
};

// The calling app's API product decides which models it may use (product attribute "allowed_models").
// No attribute = no models (default deny), so keys from other products cannot use the facade.
FX.allowedModels = function () {
  var raw = String(context.getVariable('verifyapikey.VA-AgentKey.apiproduct.allowed_models') || '');
  var list = [];
  var items = raw.split(',');
  for (var i = 0; i < items.length; i++) {
    var m = items[i].trim();
    if (m) list.push(m);
  }
  return list;
};

FX.contains = function (arr, v) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true;
  return false;
};

// Text of an Anthropic content value (string or block array). Non-text blocks are summarised.
FX.textOf = function (content) {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  var out = [];
  for (var i = 0; i < content.length; i++) {
    var b = content[i] || {};
    if (b.type === 'text' && typeof b.text === 'string') out.push(b.text);
    else if (b.type === 'image') out.push('[image omitted by gateway: this model is text-only]');
    else if (b.type === 'document') out.push('[document omitted by gateway]');
  }
  return out.join('\n');
};

// System prompt = top-level "system" plus any role:"system" entries Claude Code puts inside "messages"
// (e.g. its environment block). Backends that only accept a leading system prompt get them merged here.
FX.systemText = function (system, messages) {
  var parts = [];
  var top = FX.textOf(system);
  if (top) parts.push(top);
  var list = messages || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].role === 'system') {
      var t = FX.textOf(list[i].content);
      if (t) parts.push(t);
    }
  }
  return parts.join('\n\n');
};

// Random id fragment (messageid prefixes repeat across requests, so they are not unique enough).
FX.uid = function (len) {
  var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', s = '';
  for (var i = 0; i < (len || 24); i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
};

// Tool ids must match ^[a-zA-Z0-9_-]+$ in the Anthropic schema.
FX.safeId = function (id, i) {
  var s = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return s || ('toolu_gw_' + FX.uid(16) + '_' + i);
};

// Only "custom" tools (with an input_schema) can be offered to non-Anthropic models;
// Anthropic server tools (web_search_*, advisor_*, ...) have no equivalent there.
FX.customTools = function (tools) {
  var out = [];
  if (!tools) return out;
  for (var i = 0; i < tools.length; i++) {
    var t = tools[i] || {};
    if (t.input_schema && t.name && (!t.type || t.type === 'custom')) out.push(t);
  }
  return out;
};

// Clone a JSON schema without keys some backends reject.
FX.cleanSchema = function (schema) {
  var s = JSON.parse(JSON.stringify(schema || { type: 'object', properties: {} }));
  delete s.$schema;
  return s;
};

// Build the SSE event sequence Claude Code expects from a complete Anthropic message.
// The whole sequence is sent in one body (the upstream call is buffered); Claude Code parses it event by event.
FX.toSSE = function (msg) {
  var lines = [];
  function ev(name, data) { lines.push('event: ' + name + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
  var start = JSON.parse(JSON.stringify(msg));
  start.content = [];
  start.stop_reason = null;
  start.stop_sequence = null;
  start.usage = { input_tokens: msg.usage.input_tokens, output_tokens: 1,
    cache_creation_input_tokens: msg.usage.cache_creation_input_tokens || 0,
    cache_read_input_tokens: msg.usage.cache_read_input_tokens || 0 };
  ev('message_start', { type: 'message_start', message: start });
  for (var i = 0; i < msg.content.length; i++) {
    var b = msg.content[i];
    if (b.type === 'text') {
      ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
      ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text } });
    } else if (b.type === 'tool_use') {
      ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input || {}) } });
    } else if (b.type === 'thinking') {
      ev('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'thinking', thinking: '', signature: '' } });
      ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'thinking_delta', thinking: b.thinking } });
      ev('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'signature_delta', signature: b.signature || '' } });
    } else {
      continue;
    }
    ev('content_block_stop', { type: 'content_block_stop', index: i });
  }
  ev('message_delta', { type: 'message_delta', delta: { stop_reason: msg.stop_reason, stop_sequence: msg.stop_sequence || null },
    usage: { output_tokens: msg.usage.output_tokens } });
  ev('message_stop', { type: 'message_stop' });
  return lines.join('');
};

// Write a response (used by the proxy-level local reply and by the target response flow).
FX.reply = function (status, body, contentType, inFault) {
  // In the error flow (fault rules) the client receives the "error" message, so write there too.
  var prefixes = inFault ? ['error', 'response'] : ['response'];
  for (var i = 0; i < prefixes.length; i++) {
    var p = prefixes[i];
    try {
      context.setVariable(p + '.status.code', String(status));
      context.setVariable(p + '.content', body);
      context.setVariable(p + '.header.Content-Type', contentType || 'application/json');
    } catch (e) { /* message not available in this flow */ }
  }
};
