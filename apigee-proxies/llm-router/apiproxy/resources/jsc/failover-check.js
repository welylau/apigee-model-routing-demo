// failover-check.js (target response flow, first step)
// Targets accept every status code (success.codes) so errors reach this flow instead of the fault flow.
// Decide whether the chosen model failed and whether a failover attempt is allowed.
var status = parseInt(context.getVariable('response.status.code'), 10) || 0;
// Not worth retrying on another model: the request itself is bad or too large.
var NO_FAILOVER = [400, 413];

context.setVariable('llmr.primary_status', String(status));
if (status >= 400) {
  context.setVariable('llmr.primary_failed', 'true');
  var allowed = context.getVariable('llmr.failover_enabled') === 'true' && NO_FAILOVER.indexOf(status) < 0;
  context.setVariable('llmr.failover_needed', allowed ? 'true' : 'false');
} else {
  context.setVariable('llmr.primary_failed', 'false');
  context.setVariable('llmr.failover_needed', 'false');
}
