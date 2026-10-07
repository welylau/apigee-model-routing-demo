// maas-response.js
// Translates a Vertex AI MaaS OpenAI chat/completions response into the Gemini format clients expect.
// Reasoning models (e.g. GLM 5.2) return their chain of thought in message.reasoning_content; it is
// passed on as a Gemini "thought" part ({ text, thought: true }) so UIs can show it apart from the answer.
var content = context.getVariable('response.content');
try {
  var res = JSON.parse(content);
  var gemini = { candidates: [], usageMetadata: {}, modelVersion: res.model || context.getVariable('llmr.maas_model_id') };

  var choices = res.choices || [];
  for (var i = 0; i < choices.length; i++) {
    var choice = choices[i] || {};
    var msg = choice.message || {};
    var parts = [];
    if (typeof msg.reasoning_content === 'string' && msg.reasoning_content) {
      parts.push({ text: msg.reasoning_content, thought: true });
    }
    var answer = typeof msg.content === 'string' ? msg.content : '';
    if (!answer && choice.finish_reason === 'length') {
      // The whole output budget went on reasoning: say so instead of returning a blank answer.
      answer = '[No answer: the model used its whole output budget (max_tokens) on reasoning. Raise maas_min_max_tokens in routing.properties or send a larger generationConfig.maxOutputTokens.]';
    }
    parts.push({ text: answer });

    var finishReason = 'STOP';
    if (choice.finish_reason === 'length') finishReason = 'MAX_TOKENS';
    else if (choice.finish_reason === 'content_filter') finishReason = 'SAFETY';

    gemini.candidates.push({ content: { role: 'model', parts: parts }, finishReason: finishReason, index: i });
  }

  if (res.usage) {
    var completion = res.usage.completion_tokens || 0;
    var details = res.usage.completion_tokens_details || {};
    var thoughts = Math.min(details.reasoning_tokens || 0, completion);
    gemini.usageMetadata = {
      promptTokenCount: res.usage.prompt_tokens || 0,
      candidatesTokenCount: completion - thoughts,
      totalTokenCount: res.usage.total_tokens || 0
    };
    if (thoughts) gemini.usageMetadata.thoughtsTokenCount = thoughts;
  }

  if (context.getVariable('proxy.name') === 'stream') {
    // MaaS is called non-streaming; emit the whole answer as a single Gemini-style SSE event.
    context.setVariable('response.content', 'data: ' + JSON.stringify(gemini) + '\n\n');
    context.setVariable('response.header.Content-Type', 'text/event-stream');
  } else {
    context.setVariable('response.content', JSON.stringify(gemini));
    context.setVariable('response.header.Content-Type', 'application/json');
  }
} catch (e) {
  // Unparsable body: leave it unchanged.
}
