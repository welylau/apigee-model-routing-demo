// facade-local-reply.js - proxy response flow for requests answered by the gateway itself
// (/v1/models, count_tokens, /api/hello, and request errors such as model_not_allowed).
FX.reply(parseInt(context.getVariable('llmr.fx_status'), 10) || 500,
  context.getVariable('llmr.fx_body') || '',
  context.getVariable('llmr.fx_ctype') || 'application/json');
