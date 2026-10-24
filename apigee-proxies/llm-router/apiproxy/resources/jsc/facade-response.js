// facade-response.js - Anthropic Messages facade, target response side.
// Runs after JS-FailoverCheck / SC-Failover. Translates the backend answer (OpenAI chat/completions,
// Gemini generateContent, or Claude on Vertex) back into an Anthropic Messages response, and builds the
// SSE event sequence when the client asked for stream:true.

var kind = context.getVariable('llmr.fx_kind');
var requested = context.getVariable('llmr.requested_model');
var stream = context.getVariable('llmr.fx_stream') === 'true';
var status = parseInt(context.getVariable('response.status.code'), 10) || 0;
var msgId = 'msg_' + FX.uid(24);
var emitThinking = context.getVariable('propertyset.routing.facade_emit_thinking') === 'true';

function finish(msg) {
  var usage = msg.usage || {};
  context.setVariable('usage.total_tokens', String((usage.input_tokens || 0) + (usage.output_tokens || 0)));
  if (stream) {
    FX.reply(200, FX.toSSE(msg), 'text/event-stream');
    context.setVariable('response.header.Cache-Control', 'no-cache');
  } else {
    FX.reply(200, JSON.stringify(msg), 'application/json');
  }
}

function errorOut(code, type, message, retry) {
  FX.reply(code, FX.errorBody(type, message), 'application/json');
  if (retry !== undefined) context.setVariable('response.header.x-should-retry', retry ? 'true' : 'false');
}

function baseMessage(model) {
  return { id: msgId, type: 'message', role: 'assistant', model: model, content: [], stop_reason: 'end_turn',
    stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
}

function fromOpenAI(r) {
  var msg = baseMessage(requested);
  var choice = (r.choices || [])[0] || {};
  var m = choice.message || {};
  if (emitThinking && m.reasoning_content) {
    msg.content.push({ type: 'thinking', thinking: String(m.reasoning_content), signature: 'apigee-gateway' });
  }
  if (m.content) msg.content.push({ type: 'text', text: String(m.content) });
  var calls = m.tool_calls || [];
  for (var i = 0; i < calls.length; i++) {
    var fn = calls[i]['function'] || {};
    var input;
    try { input = fn.arguments ? JSON.parse(fn.arguments) : {}; } catch (e) { return { malformed: fn.name || 'tool' }; }
    if (input === null || typeof input !== 'object') input = {};
    msg.content.push({ type: 'tool_use', id: 'toolu_' + FX.uid(20) + '_' + i, name: fn.name, input: input });
  }
  var fr = choice.finish_reason;
  msg.stop_reason = calls.length ? 'tool_use' : (fr === 'length' ? 'max_tokens' : 'end_turn');
  if (!msg.content.length) {
    msg.content.push({ type: 'text', text: fr === 'length'
      ? '[The model used its whole output budget while reasoning and returned no answer. Try again or use the non-thinking model.]'
      : '(empty response)' });
  }
  var u = r.usage || {};
  msg.usage.input_tokens = u.prompt_tokens || 0;
  msg.usage.output_tokens = u.completion_tokens || 0;
  return { msg: msg };
}

function fromGemini(r, modelId) {
  var msg = baseMessage(modelId);
  var cand = (r.candidates || [])[0] || {};
  var parts = (cand.content || {}).parts || [];
  var hasCall = false;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    if (p.functionCall) {
      hasCall = true;
      msg.content.push({ type: 'tool_use', id: 'toolu_' + FX.uid(20) + '_' + i, name: p.functionCall.name, input: p.functionCall.args || {} });
    } else if (typeof p.text === 'string') {
      if (p.thought) {
        if (emitThinking) msg.content.push({ type: 'thinking', thinking: p.text, signature: 'apigee-gateway' });
      } else if (p.text) {
        msg.content.push({ type: 'text', text: p.text });
      }
    }
  }
  var fr = cand.finishReason;
  msg.stop_reason = hasCall ? 'tool_use' : (fr === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn');
  if (!msg.content.length) msg.content.push({ type: 'text', text: '(empty response)' });
  var u = r.usageMetadata || {};
  msg.usage.input_tokens = u.promptTokenCount || 0;
  msg.usage.output_tokens = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  return { msg: msg };
}

function parse(text) {
  try { return JSON.parse(text || ''); } catch (e) { return null; }
}

var failedOver = false;
if (context.getVariable('llmr.failover_needed') === 'true') {
  // Primary failed; SC-Failover asked a Gemini model that is also on the caller's allow-list.
  var scStatus = parseInt(context.getVariable('failoverResponse.status.code'), 10) || 0;
  var reason = 'HTTP ' + status + (context.getVariable('llmr.simulated_outage') === 'true' ? ' (simulated outage)' : '');
  var fb = scStatus === 200 ? parse(context.getVariable('failoverResponse.content')) : null;
  if (fb) {
    var res = fromGemini(fb, context.getVariable('llmr.failover_id'));
    context.setVariable('llmr.failover', 'true');
    context.setVariable('llmr.failover_from', requested);
    context.setVariable('llmr.failover_reason', reason);
    context.setVariable('llmr.model', context.getVariable('llmr.failover_id'));
    finish(res.msg);
    failedOver = true;
  } else {
    context.setVariable('llmr.failover', 'failed');
    context.setVariable('llmr.failover_reason', reason + '; backup returned ' + (scStatus || 'no response'));
  }
}

if (!failedOver) {
  var raw = context.getVariable('response.content');
  if (status >= 400) {
    if (kind === 'claude') {
      // Forward Claude's own error body unchanged: Claude Code's capability-rejection retry matches its wording.
      var cj = parse(raw);
      if (cj && cj.type === 'error') FX.reply(status, raw, 'application/json');
      else errorOut(status, FX.errorTypeForStatus(status), 'Upstream model returned HTTP ' + status + '.');
    } else {
      var ej = parse(raw);
      var detail = '';
      if (ej) {
        var e0 = Array.isArray(ej) ? ej[0] : ej;
        if (e0 && e0.error && e0.error.message) detail = ': ' + String(e0.error.message).substring(0, 300);
      }
      errorOut(status, FX.errorTypeForStatus(status), 'Upstream model returned HTTP ' + status + detail);
    }
  } else {
    var body = parse(raw);
    if (!body) {
      errorOut(502, 'api_error', 'Upstream model returned an unreadable response.', true);
    } else if (kind === 'claude') {
      body.model = requested;
      if (!body.usage) body.usage = { input_tokens: 0, output_tokens: 0 };
      finish(body);
    } else {
      var out = kind === 'gemini' ? fromGemini(body, requested) : fromOpenAI(body);
      if (out.malformed) {
        // The model produced tool arguments that are not valid JSON. Ask Claude Code to retry.
        errorOut(500, 'api_error', 'Upstream model returned malformed arguments for tool "' + out.malformed + '". Retrying usually fixes this.', true);
      } else {
        finish(out.msg);
      }
    }
  }
}
