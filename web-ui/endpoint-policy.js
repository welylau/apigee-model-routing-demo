// endpoint-policy.js - rules for user-supplied (custom / on-prem) model endpoints.
// Used by server.js (personal endpoints, per request) and scripts/custom-endpoint.sh (shared endpoints).
// The Apigee proxy re-checks the URL shape (custom-request.js); only this module can do the DNS check.
//
// Allowed: public HTTPS, DNS host name, port 443, OpenAI-compatible Chat Completions path.
// Blocked: http://, IP literals, user:pass@, query strings, internal names (localhost, *.local, *.internal ...),
//          wildcard-DNS services that embed an IP (nip.io, sslip.io ...), and names resolving to private,
//          loopback, link-local, CGNAT or other non-public addresses.
// Known limit: the gateway resolves the name again when it calls it (time-of-check vs time-of-use), so a
// hostile DNS server could still answer differently. Use the optional host allow-list to close that gap.
'use strict';
const dns = require('dns').promises;
const net = require('net');

const INTERNAL_SUFFIX = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|arpa)$/;
const IP_IN_NAME = /(^|[.-])\d{1,3}[.-]\d{1,3}[.-]\d{1,3}[.-]\d{1,3}([.-]|$)/;
const WILDCARD_DNS = /(^|\.)(nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me|lvh\.me|vcap\.me|lacolhost\.com)$/;
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const PATH_RE = /^(\/[A-Za-z0-9._~-]+)*$/;
const MODEL_RE = /^[A-Za-z0-9._:\/@+-]{1,128}$/;
const KEY_RE = /^[\x21-\x7e]{1,512}$/;

class EndpointError extends Error {}

// Accepts a base URL (https://host/v1) or the full .../chat/completions URL; returns the full URL.
function normalizeUrl(input, allowedHosts) {
  if (typeof input !== 'string' || input.length > 300) throw new EndpointError('URL is missing or too long');
  let s = input.trim();
  if (!/^https:\/\//i.test(s)) throw new EndpointError('URL must start with https://');
  let u;
  try { u = new URL(s); } catch (e) { throw new EndpointError('URL is not valid'); }
  if (u.username || u.password) throw new EndpointError('URL must not contain a user name or password');
  if (u.search || u.hash) throw new EndpointError('URL must not contain a query string or fragment');
  if (u.port && u.port !== '443') throw new EndpointError('only port 443 is allowed');
  const host = u.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) throw new EndpointError('use a DNS host name, not an IP address');
  if (!HOST_RE.test(host)) throw new EndpointError('host name is not valid');
  if (INTERNAL_SUFFIX.test(host)) throw new EndpointError('internal host names are not allowed');
  if (IP_IN_NAME.test(host) || WILDCARD_DNS.test(host)) throw new EndpointError('host names that embed an IP address are not allowed');
  if (!hostAllowed(host, allowedHosts)) throw new EndpointError('host is not on the allow-list');
  let p = u.pathname.replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(p)) p += '/chat/completions';
  if (!PATH_RE.test(p) || p.length > 200) throw new EndpointError('URL path is not valid');
  return { url: `https://${host}${p}`, host };
}

// allowedHosts: [] = any public host; entries are exact names or "*.example.com".
function hostAllowed(host, allowedHosts) {
  const list = (allowedHosts || []).map(h => String(h).trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  return list.some(a => (a.startsWith('*.') ? host.endsWith(a.slice(1)) && host.length > a.length - 1 : host === a));
}

function isPublicIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;            // this-net, private, loopback, multicast/reserved
    if (a === 100 && b >= 64 && b <= 127) return false;                        // CGNAT
    if (a === 169 && b === 254) return false;                                  // link-local (incl. metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return false;                         // private
    if (a === 192 && b === 168) return false;                                  // private
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;            // IETF / TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return false;                     // benchmarking
    if ((a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false; // TEST-NET-2/3
    return true;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return false;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    if (/^(fc|fd)/.test(v)) return false;                                      // unique local
    if (/^fe[89ab]/.test(v)) return false;                                     // link-local
    if (/^ff/.test(v)) return false;                                           // multicast
    if (/^2001:db8:/.test(v) || /^64:ff9b:/.test(v)) return false;             // documentation, NAT64
    return true;
  }
  return false;
}

const dnsCache = new Map(); // host -> {ok, at}
async function checkDns(host) {
  const hit = dnsCache.get(host);
  if (hit && Date.now() - hit.at < 60000) { if (!hit.ok) throw new EndpointError(hit.reason); return; }
  let reason = '';
  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    if (!addrs.length) reason = 'host name does not resolve';
    else if (!addrs.every(a => isPublicIp(a.address))) reason = 'host resolves to a private or internal address';
  } catch (e) {
    reason = 'host name does not resolve';
  }
  dnsCache.set(host, { ok: !reason, reason, at: Date.now() });
  if (dnsCache.size > 500) dnsCache.delete(dnsCache.keys().next().value);
  if (reason) throw new EndpointError(reason);
}

function checkModel(m) {
  if (typeof m !== 'string' || !MODEL_RE.test(m.trim())) throw new EndpointError('model name must be 1-128 characters (letters, digits, . _ : / @ + -)');
  return m.trim();
}

function checkKey(k) {
  if (k === undefined || k === null || k === '') return '';
  if (typeof k !== 'string' || !KEY_RE.test(k)) throw new EndpointError('API key must be 1-512 printable characters without spaces');
  return k;
}

function checkLabel(l, fallback) {
  if (l === undefined || l === null || String(l).trim() === '') return fallback;
  const s = String(l).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (!s || s.length > 40) throw new EndpointError('display name must be 1-40 characters');
  return s;
}

// Returns {in, out} or null (price not set). Both or neither.
function checkPrice(pin, pout) {
  const blank = v => v === undefined || v === null || v === '';
  if (blank(pin) && blank(pout)) return null;
  const a = blank(pin) ? NaN : Number(pin), b = blank(pout) ? NaN : Number(pout);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 1000 || b > 1000) {
    throw new EndpointError('prices must both be numbers between 0 and 1000 (USD per 1M tokens), or both empty');
  }
  return { in: a, out: b };
}

module.exports = { EndpointError, normalizeUrl, hostAllowed, isPublicIp, checkDns, checkModel, checkKey, checkLabel, checkPrice };
