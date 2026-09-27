// anthropic-response.js
// Translates a Claude (Vertex rawPredict) response to the Gemini generateContent shape.
// Claude is always called unary; on the /stream endpoint the answer is emitted as one Gemini-style SSE event.
var mode = context.getVariable('llmr.mode');
if (mode === 'chat' || mode === 'stream') {
  var resBody = null;
  try {
    resBody = JSON.parse(context.getVariable('response.content') || '{}');
  } catch (e) {}

  if (resBody && resBody.content && resBody.content.length > 0) {
    var txt = resBody.content.map(function(c) { return c.text || ''; }).join('');
    var inTok = resBody.usage ? (resBody.usage.input_tokens || 0) : 0;
    var outTok = resBody.usage ? (resBody.usage.output_tokens || 0) : 0;
    var geminiRes = {
      candidates: [
        {
          content: {
            parts: [{ text: txt }],
            role: "model"
          },
          finishReason: resBody.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : 'STOP'
        }
      ],
      usageMetadata: {
        promptTokenCount: inTok,
        candidatesTokenCount: outTok,
        totalTokenCount: inTok + outTok
      }
    };
    if (mode === 'stream') {
      context.setVariable('response.content', 'data: ' + JSON.stringify(geminiRes) + '\n\n');
      context.setVariable('response.header.Content-Type', 'text/event-stream');
    } else {
      context.setVariable('response.content', JSON.stringify(geminiRes));
    }
  }
}
