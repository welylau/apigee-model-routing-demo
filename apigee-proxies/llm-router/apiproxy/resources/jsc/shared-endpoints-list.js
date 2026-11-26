// shared-endpoints-list.js (GET /v1/custom-endpoints)
// Lists the shared custom endpoints an admin registered in the encrypted KVM "custom-endpoints"
// (entries shared-1..3, written by scripts/custom-endpoint.sh). Returns display metadata only:
// never the API key, and only the host of the URL.
function num(v) { var n = parseFloat(v); return isFinite(n) && n >= 0 ? n : null; }
var out = [];
for (var i = 1; i <= 3; i++) {
  var raw = context.getVariable('private.shared_meta_' + i);
  if (!raw) continue;
  try {
    var m = JSON.parse(raw);
    var hm = /^https:\/\/([a-z0-9.-]+)/.exec(String(m.url || ''));
    var pin = num(m.priceIn), pout = num(m.priceOut);
    out.push({
      id: 'shared-' + i,
      label: String(m.label || ('Shared endpoint ' + i)).replace(/[\u0000-\u001f<>]/g, '').slice(0, 40),
      model: String(m.model || '').slice(0, 128),
      host: hm ? hm[1] : null,
      price: pin !== null && pout !== null ? { in: pin, out: pout } : null
    });
  } catch (e) { /* skip malformed entry */ }
}
context.setVariable('response.status.code', '200');
context.setVariable('response.header.Content-Type', 'application/json');
context.setVariable('response.content', JSON.stringify({ endpoints: out }));
