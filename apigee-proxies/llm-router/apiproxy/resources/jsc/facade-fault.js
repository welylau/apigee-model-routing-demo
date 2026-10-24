// facade-fault.js - turn Apigee policy faults (bad key, rate limit, timeouts...) into Anthropic-format
// errors, so Claude Code shows a clear message and applies its own retry rules.
var name = String(context.getVariable('fault.name') || '');
var status = parseInt(context.getVariable('error.status.code') || context.getVariable('response.status.code'), 10) || 500;
var type, message;

if (/ApiKey|api_key|FailedToResolveAPIKey|invalid_client|DeveloperStatusNotActive|consumer_key/i.test(name)) {
  status = (name === 'InvalidApiKeyForGivenResource' || /NotApproved|NotActive/.test(name)) ? 403 : 401;
  type = status === 401 ? 'authentication_error' : 'permission_error';
  message = status === 401
    ? 'Invalid or missing Apigee API key. Check apiKeyHelper / ANTHROPIC_AUTH_TOKEN on this machine.'
    : 'This Apigee API key is not approved for the Anthropic endpoint (' + name + ').';
} else if (/SpikeArrest|Quota/i.test(name)) {
  status = 429;
  type = 'rate_limit_error';
  message = 'Rate limit reached for this app (Apigee ' + name + '). Slow down and retry.';
  context.setVariable('error.header.retry-after', '2');
} else if (/timeout|Timeout|GatewayTimeout/.test(name) || status === 504) {
  status = 504;
  type = 'api_error';
  message = 'The model did not answer in time.';
  context.setVariable('error.header.x-should-retry', 'true');
} else {
  if (status < 400) status = 500;
  type = FX.errorTypeForStatus(status);
  message = 'The LLM gateway could not complete the request (' + (name || 'error') + ').';
}

FX.reply(status, FX.errorBody(type, message), 'application/json', true);
context.setVariable('error.header.request-id', String(context.getVariable('messageid') || ''));
