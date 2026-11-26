// custom-request.js (custom / on-prem endpoint target, request flow)
// Resolves the endpoint, re-checks it (the BFF also checks DNS), then translates the Gemini payload to
// OpenAI Chat Completions.
//   llmr.custom_slot = "custom"    -> personal endpoint: URL, model and optional key arrive in x-custom-endpoint-* headers
//   llmr.custom_slot = "shared-N"  -> shared endpoint registered by an admin in the encrypted KVM "custom-endpoints"
// Sets: llmr.custom_url, llmr.custom_host, llmr.custom_has_key, private.custom_key, or llmr.custom_invalid + reason.
var slot = context.getVariable('llmr.custom_slot');
var url = '', model = '', key = '', reason = '';

function hdr(name) { return String(context.getVariable('request.header.' + name) || '').trim(); }

if (slot === 'custom') {
  url = hdr('x-custom-endpoint-url');
  model = hdr('x-custom-endpoint-model');
  key = hdr('x-custom-endpoint-key');
} else {
  try {
    var meta = JSON.parse(context.getVariable('private.custom_meta') || '');
    url = String(meta.url || '');
    model = String(meta.model || '');
  } catch (e) {
    reason = 'shared endpoint ' + slot + ' is not configured';
  }
  key = String(context.getVariable('private.custom_key_kvm') || '');
}

var INTERNAL = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|arpa)$/;
var IP_IN_NAME = /(^|[.-])\d{1,3}[.-]\d{1,3}[.-]\d{1,3}[.-]\d{1,3}([.-]|$)/;
var WILDCARD = /(^|\.)(nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me|lvh\.me|vcap\.me|lacolhost\.com)$/;
var URL_RE = /^https:\/\/([a-z0-9.-]{1,253})(:443)?((\/[A-Za-z0-9._~-]+)*\/chat\/completions)$/;
var HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

function allowListed(host) {
  var raw = String(context.getVariable('propertyset.routing.custom_allowed_hosts') || '').trim();
  if (!raw) return true;
  var list = raw.split(',');
  for (var i = 0; i < list.length; i++) {
    var a = list[i].trim().toLowerCase();
    if (!a) continue;
    if (a.indexOf('*.') === 0 ? (host.length > a.length - 1 && host.slice(-(a.length - 1)) === a.slice(1)) : host === a) return true;
  }
  return false;
}

var host = '';
if (!reason) {
  var m = URL_RE.exec(url); // BFF and CLI normalise the host to lower case
  if (!m) reason = 'URL must be https://<host>[/path]/chat/completions on port 443';
  else {
    host = m[1];
    if (!HOST_RE.test(host)) reason = 'host must be a DNS name (no IP addresses)';
    else if (INTERNAL.test(host)) reason = 'internal host names are not allowed';
    else if (IP_IN_NAME.test(host) || WILDCARD.test(host)) reason = 'host names that embed an IP address are not allowed';
    else if (!allowListed(host)) reason = 'host is not on the allow-list';
  }
}
if (!reason && !/^[A-Za-z0-9._:\/@+-]{1,128}$/.test(model)) reason = 'model name is missing or invalid';
if (!reason && key && !/^[\x21-\x7e]{1,512}$/.test(key)) reason = 'API key is invalid';
if (!reason && context.getVariable('propertyset.routing.custom_endpoints_enabled') === 'false') reason = 'custom endpoints are disabled';

if (reason) {
  context.setVariable('llmr.custom_invalid', 'true');
  context.setVariable('llmr.custom_invalid_reason', reason);
} else {
  var target = 'https://' + host + m[3];
  // Demo only: x-simulate-outage points the call at a missing path on the same host (expected 404 -> failover).
  if (context.getVariable('llmr.simulated_outage') === 'true') target = target.replace(/\/chat\/completions$/, '/simulated-outage');
  context.setVariable('llmr.custom_url', target);
  context.setVariable('llmr.custom_host', host);
  context.setVariable('llmr.custom_has_key', key ? 'true' : 'false');
  if (key) context.setVariable('private.custom_key', key);

  // Gemini -> OpenAI Chat Completions (same mapping as azure-request.js, with the endpoint's own model name).
  var payload = JSON.parse(context.getVariable('request.content') || '{}');
  var out = { model: model, messages: [], stream: false };
  function textOf(parts) { var t = ''; for (var i = 0; parts && i < parts.length; i++) t += parts[i].text || ''; return t; }
  if (payload.systemInstruction && payload.systemInstruction.parts) {
    var sys = textOf(payload.systemInstruction.parts);
    if (sys) out.messages.push({ role: 'system', content: sys });
  }
  var contents = payload.contents || [];
  for (var c = 0; c < contents.length; c++) {
    out.messages.push({ role: contents[c].role === 'model' ? 'assistant' : 'user', content: textOf(contents[c].parts) });
  }
  var gc = payload.generationConfig || {};
  if (gc.temperature !== undefined) out.temperature = gc.temperature;
  if (gc.topP !== undefined) out.top_p = gc.topP;
  if (gc.maxOutputTokens !== undefined) out.max_tokens = gc.maxOutputTokens;
  if (gc.stopSequences !== undefined) out.stop = gc.stopSequences;
  context.setVariable('request.content', JSON.stringify(out));
  context.setVariable('request.header.Content-Type', 'application/json');
}
