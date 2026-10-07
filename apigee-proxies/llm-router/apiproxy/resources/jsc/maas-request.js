// maas-request.js
// Translates the Gemini-format request (request.content) into an OpenAI chat/completions request for a
// Vertex AI MaaS model (e.g. zai-org/glm-5.2-maas). The publisher model id comes from the routing.properties
// allow-list (llmr.maas_model_id, set by decide-route.js), never from the client.
var payload = {};
try { payload = JSON.parse(context.getVariable('request.content') || '{}'); } catch (e) { payload = {}; }

function partsText(parts) {
  var text = '';
  if (parts && parts.length) {
    for (var i = 0; i < parts.length; i++) {
      // Skip earlier "thought" parts in multi-turn history: only the visible answer is context.
      if (parts[i] && typeof parts[i].text === 'string' && !parts[i].thought) text += parts[i].text;
    }
  }
  return text;
}

var req = {
  model: context.getVariable('llmr.maas_model_id'),
  messages: [],
  stream: false // one SSE event on /v1/stream (wrapped in maas-response.js), same as Claude / GPT / Gemma
};

if (payload.systemInstruction && payload.systemInstruction.parts) {
  var sys = partsText(payload.systemInstruction.parts);
  if (sys) req.messages.push({ role: 'system', content: sys });
}

if (payload.contents && payload.contents.length) {
  for (var c = 0; c < payload.contents.length; c++) {
    var item = payload.contents[c] || {};
    req.messages.push({ role: item.role === 'model' ? 'assistant' : 'user', content: partsText(item.parts) });
  }
}

var gc = payload.generationConfig || {};
if (gc.temperature !== undefined) req.temperature = gc.temperature;
if (gc.topP !== undefined) req.top_p = gc.topP;
if (gc.stopSequences !== undefined) req.stop = gc.stopSequences;

// Reasoning models spend output tokens on thinking first; a small cap leaves the answer empty
// (finish_reason "length"). Enforce a floor from routing.properties.
var floor = parseInt(context.getVariable('propertyset.routing.maas_min_max_tokens'), 10) || 16384;
var requested = parseInt(gc.maxOutputTokens, 10);
req.max_tokens = !isNaN(requested) && requested > floor ? requested : floor;

context.setVariable('request.content', JSON.stringify(req));
context.setVariable('request.header.Content-Type', 'application/json');
