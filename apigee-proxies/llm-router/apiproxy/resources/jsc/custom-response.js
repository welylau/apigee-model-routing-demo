// custom-response.js (custom / on-prem endpoint target, response flow)
// Translates an OpenAI Chat Completions response into the Gemini format used by the rest of the proxy.
// Untrusted backend: strip cookies and server banners, and turn non-JSON / unexpected bodies into a generic 502.

var DROP = /^(set-cookie|set-cookie2|server|x-powered-by|via|x-ratelimit-.*|x-request-id|x-amzn-.*|cf-.*)$/i;
var names = String(context.getVariable('response.headers.names') || '').replace(/^\[|\]$/g, '').split(',');
for (var h = 0; h < names.length; h++) {
  var hn = names[h].trim();
  if (hn && DROP.test(hn)) context.removeVariable('response.header.' + hn);
}

function fail() {
  context.setVariable('response.status.code', '502');
  context.setVariable('response.reason.phrase', 'Bad Gateway');
  context.setVariable('response.header.Content-Type', 'application/json');
  context.setVariable('response.content', JSON.stringify({ error: { code: 502, message: 'The custom endpoint returned an unexpected response (expected OpenAI Chat Completions JSON).' } }));
}

var res = null;
try { res = JSON.parse(context.getVariable('response.content')); } catch (e) { res = null; }

if (!res || !res.choices || !res.choices.length) {
  fail();
} else {
  var gemini = { candidates: [], usageMetadata: {} };
  for (var i = 0; i < res.choices.length; i++) {
    var ch = res.choices[i] || {};
    var msg = ch.message || {};
    var parts = [];
    // Reasoning models served by vLLM / Ollama / LiteLLM often return their thinking separately.
    var thought = msg.reasoning_content || msg.reasoning;
    if (typeof thought === 'string' && thought) parts.push({ text: thought, thought: true });
    parts.push({ text: typeof msg.content === 'string' ? msg.content : '' });
    var finish = ch.finish_reason === 'length' ? 'MAX_TOKENS' : ch.finish_reason === 'content_filter' ? 'SAFETY' : 'STOP';
    gemini.candidates.push({ content: { parts: parts, role: 'model' }, finishReason: finish, index: i });
  }
  if (res.usage) {
    gemini.usageMetadata = {
      promptTokenCount: res.usage.prompt_tokens || 0,
      candidatesTokenCount: res.usage.completion_tokens || 0,
      totalTokenCount: res.usage.total_tokens || ((res.usage.prompt_tokens || 0) + (res.usage.completion_tokens || 0))
    };
  }
  if (context.getVariable('proxy.name') === 'stream') {
    // Called non-streaming; emit the whole answer as one Gemini-style SSE event (same as the other non-Vertex targets).
    context.setVariable('response.content', 'data: ' + JSON.stringify(gemini) + '\n\n');
    context.setVariable('response.header.Content-Type', 'text/event-stream');
  } else {
    context.setVariable('response.content', JSON.stringify(gemini));
    context.setVariable('response.header.Content-Type', 'application/json');
  }
}
