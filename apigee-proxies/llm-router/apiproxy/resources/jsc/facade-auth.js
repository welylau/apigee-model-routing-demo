// facade-auth.js - the caller's credential is its Apigee developer app key.
// Claude Code sends it as "x-api-key" (ANTHROPIC_API_KEY), "Authorization: Bearer" (ANTHROPIC_AUTH_TOKEN),
// or both (apiKeyHelper). Accept either; VA-AgentKey verifies it.
var key = String(context.getVariable('request.header.x-api-key') || '').trim();
if (!key) {
  var auth = String(context.getVariable('request.header.Authorization') || '').trim();
  var m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) key = m[1].trim();
}
context.setVariable('llmr.client_key', key);
