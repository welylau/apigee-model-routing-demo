var reqBody = null;
try {
  reqBody = JSON.parse(context.getVariable('request.content') || '{}');
} catch (e) {
  reqBody = {};
}

// Extract standard Gemini params if any
var maxTokens = 1024;
var temperature = 0.5;
if (reqBody.generationConfig) {
  if (reqBody.generationConfig.maxOutputTokens !== undefined) maxTokens = reqBody.generationConfig.maxOutputTokens;
  if (reqBody.generationConfig.temperature !== undefined) temperature = reqBody.generationConfig.temperature;
}

// Build Claude messages payload from the extracted route_internal.prompt
var claudeReq = {
  anthropic_version: 'vertex-2023-10-16',
  max_tokens: maxTokens,
  temperature: temperature,
  messages: [{ role: 'user', content: context.getVariable('route_internal.prompt') || '' }]
};

// Check for systemInstruction
if (reqBody.systemInstruction && reqBody.systemInstruction.parts && reqBody.systemInstruction.parts.length > 0) {
  var sysText = [];
  for (var i = 0; i < reqBody.systemInstruction.parts.length; i++) {
     sysText.push(reqBody.systemInstruction.parts[i].text || '');
  }
  claudeReq.system = sysText.join('\n');
}

context.setVariable('request.content', JSON.stringify(claudeReq));
