// azure-response.js
// Translates Azure OpenAI response to Gemini format

// Don't leak backend quota details: drop every x-ratelimit-* header returned by Azure.
var headerNames = String(context.getVariable('response.headers.names') || '').replace(/^\[|\]$/g, '').split(',');
for (var h = 0; h < headerNames.length; h++) {
  var hn = headerNames[h].trim();
  if (/^x-ratelimit-/i.test(hn)) context.removeVariable('response.header.' + hn);
}

var content = context.getVariable('response.content');
try {
  var res = JSON.parse(content);
  var gemini = {
    candidates: [],
    usageMetadata: {}
  };

  if (res.choices && res.choices.length > 0) {
    for (var i = 0; i < res.choices.length; i++) {
      var choice = res.choices[i];
      var text = choice.message && choice.message.content ? choice.message.content : '';
      var finishReason = 'STOP';
      if (choice.finish_reason === 'length') finishReason = 'MAX_TOKENS';
      else if (choice.finish_reason === 'content_filter') finishReason = 'SAFETY';

      gemini.candidates.push({
        content: {
          parts: [{ text: text }],
          role: 'model'
        },
        finishReason: finishReason,
        index: i
      });
    }
  }

  if (res.usage) {
    gemini.usageMetadata = {
      promptTokenCount: res.usage.prompt_tokens || 0,
      candidatesTokenCount: res.usage.completion_tokens || 0,
      totalTokenCount: res.usage.total_tokens || 0
    };
  }

  if (context.getVariable('proxy.name') === 'stream') {
    // Azure is called non-streaming; emit the whole answer as a single Gemini-style SSE event.
    context.setVariable('response.content', 'data: ' + JSON.stringify(gemini) + '\n\n');
    context.setVariable('response.header.Content-Type', 'text/event-stream');
  } else {
    context.setVariable('response.content', JSON.stringify(gemini));
  }
} catch (e) {
  // If parsing fails (e.g., error from Azure), leave the content as is
}
