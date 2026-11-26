// bedrock-response.js
// Translates an Amazon Bedrock Converse API response into the Gemini format the rest of the proxy (and the UI) expects.

// Don't leak AWS request ids / backend details to the caller.
var headerNames = String(context.getVariable('response.headers.names') || '').replace(/^\[|\]$/g, '').split(',');
for (var h = 0; h < headerNames.length; h++) {
  var hn = headerNames[h].trim();
  if (/^x-amzn-/i.test(hn)) context.removeVariable('response.header.' + hn);
}

var STOP = { end_turn: 'STOP', stop_sequence: 'STOP', max_tokens: 'MAX_TOKENS', guardrail_intervened: 'SAFETY', content_filtered: 'SAFETY' };

try {
  var res = JSON.parse(context.getVariable('response.content'));
  var text = '';
  var parts = (res.output && res.output.message && res.output.message.content) || [];
  for (var i = 0; i < parts.length; i++) text += parts[i].text || '';

  var gemini = {
    candidates: [{ content: { parts: [{ text: text }], role: 'model' }, finishReason: STOP[res.stopReason] || 'STOP', index: 0 }],
    usageMetadata: {}
  };
  if (res.usage) {
    gemini.usageMetadata = {
      promptTokenCount: res.usage.inputTokens || 0,
      candidatesTokenCount: res.usage.outputTokens || 0,
      totalTokenCount: res.usage.totalTokens || 0
    };
  }

  if (context.getVariable('proxy.name') === 'stream') {
    // Bedrock is called non-streaming (ConverseStream uses AWS binary event-stream framing);
    // emit the whole answer as a single Gemini-style SSE event, same as the Azure target.
    context.setVariable('response.content', 'data: ' + JSON.stringify(gemini) + '\n\n');
    context.setVariable('response.header.Content-Type', 'text/event-stream');
  } else {
    context.setVariable('response.content', JSON.stringify(gemini));
    context.setVariable('response.header.Content-Type', 'application/json');
  }
} catch (e) {
  // Unparsable body: leave it as is.
}
