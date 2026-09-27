// failover-apply.js (target response flow, after SC-Failover)
// On a successful backup call, replace the failed response with the backup model's answer (Gemini format),
// and record what happened so AM-RouteHeaders / DataCapture can report it.
var primaryModel = context.getVariable('llmr.model');
var backupModel = context.getVariable('llmr.failover_model');
var primaryStatus = context.getVariable('llmr.primary_status');
var simulated = context.getVariable('llmr.simulated_outage') === 'true';
var scStatus = parseInt(context.getVariable('failoverResponse.status.code'), 10) || 0;
var reason = 'HTTP ' + primaryStatus + (simulated ? ' (simulated outage)' : '');

var body = null;
if (scStatus === 200) {
  try { body = JSON.parse(context.getVariable('failoverResponse.content')); } catch (e) { body = null; }
}

if (body) {
  if (context.getVariable('proxy.name') === 'stream') {
    // Backup is called non-streaming; send the whole answer as one Gemini-style SSE event.
    context.setVariable('response.content', 'data: ' + JSON.stringify(body) + '\n\n');
    context.setVariable('response.header.Content-Type', 'text/event-stream');
  } else {
    context.setVariable('response.content', JSON.stringify(body));
    context.setVariable('response.header.Content-Type', 'application/json');
  }
  context.setVariable('response.status.code', '200');
  context.setVariable('response.reason.phrase', 'OK');
  context.setVariable('llmr.failover', 'true');
  context.setVariable('llmr.failover_from', primaryModel);
  context.setVariable('llmr.failover_reason', reason);
  context.setVariable('llmr.model', backupModel); // the model that actually served the answer
} else {
  context.setVariable('llmr.failover', 'failed');
  context.setVariable('llmr.failover_reason', reason + '; backup ' + backupModel + ' returned ' + (scStatus || 'no response'));
}
