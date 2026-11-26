// bedrock-request.js
// Translates the Gemini payload (request.content) into an Amazon Bedrock Converse API payload.
// Converse rules: messages must start with a user turn, roles alternate user/assistant, text must be non-empty.
var payload = JSON.parse(context.getVariable('request.content') || '{}');
var req = { messages: [] };

function textOf(parts) {
  var t = '';
  for (var i = 0; parts && i < parts.length; i++) t += parts[i].text || '';
  return t;
}

if (payload.systemInstruction && payload.systemInstruction.parts) {
  var sys = textOf(payload.systemInstruction.parts);
  if (sys.trim()) req.system = [{ text: sys }];
}

var contents = payload.contents || [];
for (var i = 0; i < contents.length; i++) {
  var text = textOf(contents[i].parts);
  if (!text.trim()) continue;
  var role = contents[i].role === 'model' ? 'assistant' : 'user';
  var last = req.messages[req.messages.length - 1];
  if (last && last.role === role) {
    last.content[0].text += '\n\n' + text; // merge consecutive turns of the same role
  } else if (!last && role === 'assistant') {
    continue; // Converse requires the first message to be from the user
  } else {
    req.messages.push({ role: role, content: [{ text: text }] });
  }
}

var gc = payload.generationConfig || {};
var inf = {};
if (gc.temperature !== undefined) inf.temperature = gc.temperature;
if (gc.topP !== undefined) inf.topP = gc.topP;
if (gc.maxOutputTokens !== undefined) inf.maxTokens = gc.maxOutputTokens;
if (gc.stopSequences !== undefined) inf.stopSequences = gc.stopSequences;
for (var k in inf) { req.inferenceConfig = inf; break; }

context.setVariable('request.content', JSON.stringify(req));
context.setVariable('request.header.Content-Type', 'application/json');
