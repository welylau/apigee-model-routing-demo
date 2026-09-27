// azure-request.js
// Translates Gemini payload (request.content) to Azure OpenAI payload
var payload = JSON.parse(context.getVariable('request.content') || '{}');
var azureReq = {
  model: context.getVariable('llmr.model'),
  messages: []
};

// Map system instruction
if (payload.systemInstruction && payload.systemInstruction.parts) {
  var sysText = '';
  for (var i = 0; i < payload.systemInstruction.parts.length; i++) {
    sysText += payload.systemInstruction.parts[i].text;
  }
  azureReq.messages.push({
    role: 'system',
    content: sysText
  });
}

// Map user/model history
if (payload.contents && payload.contents.length > 0) {
  for (var i = 0; i < payload.contents.length; i++) {
    var item = payload.contents[i];
    var text = '';
    if (item.parts) {
      for (var j = 0; j < item.parts.length; j++) {
        text += item.parts[j].text || '';
      }
    }
    // Gemini roles: user, model -> Azure roles: user, assistant
    var role = item.role === 'model' ? 'assistant' : 'user';
    azureReq.messages.push({
      role: role,
      content: text
    });
  }
}

if (payload.generationConfig) {
  if (payload.generationConfig.temperature !== undefined) azureReq.temperature = payload.generationConfig.temperature;
  if (payload.generationConfig.topP !== undefined) azureReq.top_p = payload.generationConfig.topP;
  if (payload.generationConfig.maxOutputTokens !== undefined) azureReq.max_tokens = payload.generationConfig.maxOutputTokens;
  if (payload.generationConfig.stopSequences !== undefined) azureReq.stop = payload.generationConfig.stopSequences;
}

context.setVariable('request.content', JSON.stringify(azureReq));
