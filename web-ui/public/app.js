const LOGOS = {
  gemini: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#1a73e8" d="M12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22Z"/></svg>',
  azure: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#0078D4" d="M21 9l-4.5-2.5-1-6h-7l-1 6L3 9l2.5 5.5L3 20l7 2.5 7-2.5-2.5-5.5L21 9zM12 19.5L6.5 17.5l2-4.5-2.5-5 4.5 1.5 1.5 5 1.5-5 4.5-1.5-2.5 5 2 4.5L12 19.5z"/></svg>',
  anthropic: '<svg viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="4" fill="#d97757"/><path fill="#fff" d="M12 4L4 20h3.5l1.5-3h6l1.5 3H20L12 4zm-1.5 10l1.5-3 1.5 3h-3z"/></svg>',
  xai: '<svg viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="4" fill="#000"/><path fill="#fff" d="M6 5l4.5 7-4.5 7h2.5l3.5-5.5 3.5 5.5H18l-4.5-7 4.5-7h-2.5l-3.5 5.5L8.5 5H6z"/></svg>',
  zai: '<svg viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="4" fill="#2d5bff"/><path fill="#fff" d="M6 6h12v2.2L9.2 16H18v2H6v-2.2L14.8 8H6z"/></svg>',
  default: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#9ca3af"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>'
};

const TIER_ICONS = {
  simple: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
  standard: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
  complex: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>',
  coding: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>'
};
// Apigee LLM Router demo - frontend (vanilla JS; untrusted text only via textContent, no innerHTML).
'use strict';

// Trusted inline SVG constants for strategy logos (never user input).
const STRATEGY_LOGOS = {
  nvidia: '<svg viewBox="0 0 24 24" fill="#76B900" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z"/></svg>',
};

const STRATEGIES = [
  { id: 'rules', name: 'Preset Rules Engine', icon: '📏', css: 'silver', pill: '~0 ms', short: 'Prompt-length heuristics', details: '🔍 View Details',
    desc: 'Prompt-length rules in Apigee. Instant, free, predictable.',
    flow: [['💬', 'Prompt'], ['📏', 'Rules'], ['🎯', 'Model']] },
  { id: 'classifier', name: 'Classifier LLM', icon: '🧠', css: 'blue', pill: '3.5 Flash-Lite', short: 'Gemini classifies intent & complexity', details: '🔍 View Details',
    desc: 'Flash-Lite judges intent & complexity. Smarter, ~1 s extra.',
    flow: [['💬', 'Prompt'], ['🧠', 'Flash-Lite'], ['🎯', 'Model']], fallback: true },
  { id: 'nvidia', name: 'NVIDIA NemoCurator Complexity Classifier', icon: '⚡', iconSvg: 'nvidia', css: 'green', pill: 'DeBERTa-v3', short: 'Multi-task classification on Cloud Run', details: '🔍 View Details',
    desc: 'Scores 6 complexity dimensions via DeBERTa-v3 on Cloud Run (~35ms). Smart & fast.',
    flow: [['💬', 'Prompt'], ['⚡', 'NVIDIA'], ['🎯', 'Model']], fallback: true },
];
const PRESETS = [
  { id: 'simple', title: '⚡ Simple Query', hint: '→ Flash-Lite', text: "Hi! What's the capital of Japan?" },
  { id: 'standard', title: '📝 Business Writing', hint: '→ Flash', text: 'Write a friendly two-paragraph email to a customer explaining that their order will be delayed by three days because of a warehouse move.' },
  { id: 'complex', title: '🏗️ Architecture Design', hint: '→ Pro', text: 'Design a multi-region active-active architecture for a payments API on Google Cloud. Compare Spanner vs AlloyDB, explain the consistency trade-offs, and give failure scenarios step by step.' },
  { id: 'code', title: '💻 Code Generation', hint: '→ Pro', text: 'Write a Python function that parses an Apache access log and returns the top 10 IPs by request count, with unit tests.' },
  // Tricky prompts: prompt length says one thing, the actual task says another (compare Rules vs the classifiers).
  { id: 'short-hard', title: '🧮 Short but Hard', hint: 'Rules → Flash-Lite · AI → Pro', tricky: true, text: 'Prove there are infinitely many primes, then explain why the same argument fails for twin primes.' },
  { id: 'long-easy', title: '📋 Long but Easy', hint: 'Rules → Pro · AI → cheaper', tricky: true, text: 'Hi team, a quick update on the office move. Starting next Monday, everyone on floors three and four will move to the new building on Harbour Street. The movers will pack your desks on Friday afternoon, so please clear personal items, label your monitors with the orange stickers at reception, and leave your laptop docks where they are. Parking at the new site is on levels B1 and B2; your current badge will open the gates from Monday morning. The cafeteria opens at 8am and the coffee machines on each floor are already installed. Meeting rooms keep the same names, so existing calendar invites do not need to change. IT will be on site all week to help with printers and Wi-Fi, and the help desk moves to the ground floor next to the lifts. If you have ergonomic equipment such as a standing desk or a special chair, tell facilities by Wednesday so it can be moved first. Lockers are available on a first come, first served basis from the facilities desk. The old building closes for good on the last day of the month, so please make sure nothing is left in the kitchens or storage rooms. Bike racks and showers are in the basement. The new building also has two quiet rooms on each floor, a wellness room on level five, and a small library corner with power outlets for anyone who prefers a calm place to work. A welcome breakfast is planned for Monday at 9am in the atrium. Thanks everyone for your patience while we settle in, and please send any questions to the facilities team.\n\nSummarize this message in one line.' },
];
const TIERS = ['simple', 'standard', 'complex', 'coding'];
const TIER_LABELS = { simple: 'Simple Tasks', standard: 'General Content Writing', complex: 'Reasoning & Complex', coding: 'Software Engineering' };

const state = { staticModel: null, strategy: 'classifier', preset: null, models: {}, prefs: {}, busy: false, mix: {}, cost: 0, proCost: 0, requests: 0, latencySum: 0, baseline: null };
const $ = id => document.getElementById(id);

function el(tag, attrs, children) {
  const n = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  });
  (children || []).forEach(c => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}
const stratById = id => STRATEGIES.find(s => s.id === id);
const tierOfModel = m => TIERS.find(t => state.models[t] && state.models[t].id === m) || null;
const modelLabel = t => (state.models[t] || {}).label || t;
const shortLabel = t => modelLabel(t).replace(/^Gemini /, '');
// The model Apigee actually routed to (x-routed-model) can differ from the tier default (static route / overrides).
const catalogModel = id => (state.catalog && id && state.catalog[id]) || null;
const routedLabel = (d, tier) => (catalogModel(d.model) || {}).label || d.model || modelLabel(tier);
const routedShort = (d, tier) => routedLabel(d, tier).replace(/^Gemini /, '');

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('themeIconSun').classList.toggle('hidden', theme === 'dark');
  $('themeIconMoon').classList.toggle('hidden', theme !== 'dark');
  try { localStorage.setItem('llmr-theme', theme); } catch (e) { /* storage unavailable */ }
}

/* ---------- Left panel ---------- */
// Emoji icon by default; a brand SVG when the item names one in STRATEGY_LOGOS.
function strategyIcon(item, cls, tag) {
  const node = el(tag || 'span', { class: cls + (item.iconSvg ? ' brand-logo' : '') });
  if (item.iconSvg && STRATEGY_LOGOS[item.iconSvg]) node.innerHTML = STRATEGY_LOGOS[item.iconSvg];
  else node.textContent = item.icon;
  return node;
}

function selectorCard(item, selected, sub, used) {
  const isComing = Boolean(item.comingSoon);
  const btn = el('button', {
    type: 'button',
    class: 'app-card' + (selected ? ' selected' : '') + (isComing ? ' coming-soon' : ''),
    'aria-pressed': String(selected),
    title: isComing ? `${item.name} (Coming soon)` : item.name,
    tabindex: isComing ? '-1' : '0'
  }, [
    strategyIcon(item, 'app-card-icon-wrap ' + item.css),
    el('div', { class: 'app-card-body' }, [
      el('div', { class: 'app-card-main-row' }, [
        el('span', { class: 'app-card-name', text: item.name }),
        isComing
          ? el('span', { class: 'coming-soon-badge', text: 'Coming soon' })
          : el('span', { class: 'tier-pill ' + item.css, text: item.label || item.pill }),
      ]),
      el('div', { class: 'app-card-sub-row' }, [
        el('span', { class: 'desc', text: sub }),
        used != null ? el('span', { class: 'app-card-used', text: used }) : null,
      ]),
    ]),
  ]);
  return btn;
}

// Mini diagram: 💬 Prompt → <decider> → 🎯 Model  [↩ rules]
function flowDiagram(s) {
  const kids = [];
  s.flow.forEach(([icon, label], i) => {
    if (i) kids.push(el('span', { class: 'flow-arrow', 'aria-hidden': 'true', text: '→' }));
    kids.push(el('span', { class: 'flow-node' + (i === 1 ? ' decider ' + s.css : ' end'), title: label }, [
      i === 1 && s.iconSvg ? strategyIcon(s, 'flow-icon') : el('span', { class: 'flow-icon', text: icon }),
      i === 1 ? el('span', { class: 'flow-label', text: label }) : null,
    ]));
  });
  if (s.fallback) kids.push(el('span', { class: 'flow-fallback', title: 'Falls back to the rules engine if the verdict is missing, invalid or low-confidence', text: '↩ responses' }));
  return el('div', { class: 'flow', role: 'img', 'aria-label': s.flow.map(f => f[1]).join(' to ') }, kids);
}


/* ---------- Static routing: one explicit model for every prompt ---------- */
function formatPrice(m) {
  if (!m.price || (!m.price.in && !m.price.out)) return 'Free';
  return `$${m.price.in.toFixed(2)} / $${m.price.out.toFixed(2)}`;
}

// Models with expected slow answers: flag them so slow answers aren't mistaken for gateway latency.
// gemma: self-hosted on deliberately tiny hardware; glm: reasoning model that thinks before answering.
const DEMO_HARDWARE = {
  gemma: { full: 'Very small hardware (Cloud Run, CPU-only: 4 vCPU · 8 GiB, no GPU). For demonstration purposes only; expect slow responses.', short: 'Very small hardware · demo only' },
  glm: { full: 'Reasoning model: thinks before it answers (shown under Model reasoning), so expect a longer wait. The answer arrives as one event.', short: 'Reasoning model · slower' },
};
// compact: short label for narrow table cells; full text stays available as the tooltip / accessible name.
function demoHardwareWarning(id, compact) {
  const key = Object.keys(DEMO_HARDWARE).find(k => String(id).includes(k));
  if (!key) return null;
  const { full, short } = DEMO_HARDWARE[key];
  return el('div', { class: 'demo-hw-warn', role: 'note', title: full, 'aria-label': full }, [
    el('span', { 'aria-hidden': 'true', text: key === 'glm' ? '🧠' : '⚠️' }),
    el('span', { text: compact ? short : full }),
  ]);
}

function renderStaticModels() {
  const list = $('static-model-list');
  if (!list || !state.catalog) return;
  const models = Object.values(state.catalog);
  if (!models.length) return;

  list.replaceChildren();
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', 'Static model');
  models.forEach(m => {
    const selected = state.staticModel === m.id;
    const logo = el('div', { class: 'app-card-icon-wrap static-logo' });
    logo.innerHTML = getProviderLogo(m.id); // trusted inline SVG constants
    const card = el('button', {
      type: 'button',
      class: 'app-card static-model-card' + (selected ? ' selected' : ''),
      role: 'radio',
      'aria-checked': String(selected),
      title: m.label,
    }, [
      el('span', { class: 'radio-dot' + (selected ? ' on' : ''), 'aria-hidden': 'true' }),
      logo,
      el('div', { class: 'app-card-body' }, [
        el('div', { class: 'app-card-main-row' }, [
          el('span', { class: 'app-card-name', text: m.label }),
          el('span', { class: 'static-price', title: 'Price per 1M tokens (input / output)', text: formatPrice(m) }),
        ]),
        el('div', { class: 'app-card-sub-row' }, [
          el('span', { class: 'desc', text: `${getProviderName(m.id)} · ${getHostingPlatform(m.id)}` }),
        ]),
        demoHardwareWarning(m.id),
      ]),
    ]);
    card.addEventListener('click', () => {
      if (state.busy) return;
      state.staticModel = m.id;
      state.strategy = null;
      renderStaticModels();
      renderBanner();
    });
    list.appendChild(card);
  });
}

// Dynamic and static routing are mutually exclusive.
function setMode(mode) {
  const isStatic = mode === 'static';
  [['tab-dynamic', !isStatic], ['tab-static', isStatic]].forEach(([id, on]) => {
    $(id).classList.toggle('active', on);
    $(id).setAttribute('aria-selected', String(on));
  });
  $('dynamic-content').classList.toggle('hidden', isStatic);
  $('static-content').classList.toggle('hidden', !isStatic);
  $('mode-hint').textContent = isStatic
    ? 'You pick one model. Every prompt is sent to it.'
    : 'Apigee picks the best-fit model for each prompt.';
  if (isStatic) {
    state.strategy = null;
    if (!state.staticModel && state.catalog) state.staticModel = (Object.values(state.catalog)[0] || {}).id || null;
    renderStaticModels();
  } else {
    state.staticModel = null;
    if (!state.strategy) state.strategy = 'rules';
    renderStrategies();
  }
  renderBanner();
}

function renderStrategies() {
  const grid = $('strategy-grid');
  grid.replaceChildren();
  STRATEGIES.forEach(s => {
    const card = selectorCard(s, s.id === state.strategy, s.desc, null);
    card.classList.add('wrap-desc');
    card.querySelector('.app-card-body').appendChild(flowDiagram(s));
    card.addEventListener('click', () => {
      if (state.busy || s.comingSoon) return;
      state.strategy = s.id;
      state.staticModel = null;
      renderStrategies();
      renderBanner();
    });
    if (!s.details) { grid.appendChild(card); return; }
    const view = el('button', { type: 'button', class: 'view-rules-btn', 'aria-haspopup': 'dialog', text: s.details });
    view.addEventListener('click', () => openStrategyDialog(s.id));
    grid.appendChild(el('div', { class: 'card-wrap stacked' }, [card, view]));
  });
}

/* ---------- Strategy detail dialog (config from /api/rules = proxy bundle config) ---------- */
let rulesCache = null;
async function openStrategyDialog(id) {
  const s = stratById(id);
  const dlg = $('rules-dialog');
  const body = $('rules-body');
  const title = $('rules-title');
  if (s.iconSvg) {
    title.replaceChildren(strategyIcon(s, 'dialog-title-logo'), document.createTextNode(' ' + s.name));
  } else {
    title.textContent = `${s.icon} ${s.name}`;
  }
  body.replaceChildren(el('p', { class: 'rules-muted', text: 'Loading…' }));
  if (!dlg.open) dlg.showModal();
  try {
    if (!rulesCache) {
      const res = await fetch('/api/rules');
      if (!res.ok) throw new Error('unavailable');
      rulesCache = await res.json();
    }
    if (id === 'classifier') renderClassifier(body, rulesCache);
    else if (id === 'nvidia') renderNvidia(body, rulesCache);
    else renderRules(body, rulesCache);
  } catch (e) {
    body.replaceChildren(el('p', { class: 'rules-muted', text: 'Could not load the routing configuration.' }));
  }
}

// Tier → model table. Shows the *current* model per tier (incl. ⚙ overrides from the mapping dialog),
// the thinking level from routing.properties, and dims tiers this strategy can never select.
function tierTable(r, reachable) {
  const reach = reachable || TIERS;
  return el('table', { class: 'rules-table' }, [
    el('thead', {}, [el('tr', {}, ['Tier', 'Current model', 'Thinking'].map(h => el('th', { text: h })))]),
    el('tbody', {}, r.tiers.map(t => {
      const cur = state.models[t.tier];
      const custom = Boolean(state.prefs[t.tier]);
      const canReach = reach.includes(t.tier);
      return el('tr', { class: canReach ? '' : 'tier-unreachable' }, [
        el('td', {}, [modelPill(t.tier, t.tier)]),
        el('td', {}, [
          el('span', { text: cur ? cur.label : t.model }),
          custom ? el('span', { class: 'custom-tag', title: `Default: ${t.model}`, text: 'custom' }) : null,
          canReach ? null : el('span', { class: 'rules-muted-inline', text: ' · not selected by this strategy' }),
        ]),
        el('td', { class: 'mono', text: t.thinking }),
      ]);
    })),
  ]);
}

const numberedSteps = steps => el('table', { class: 'rules-table' }, [
  el('tbody', {}, steps.map(([n, t]) => el('tr', {}, [el('td', { class: 'mono', text: n }), el('td', { text: t })]))),
]);

function renderClassifier(body, r) {
  const rubric = [
    ['simple', 'Greetings, chit-chat, short factual lookups, short rewrites or translations, yes/no questions.'],
    ['standard', 'Explanations, summaries, emails, general writing, customer-support answers, light analysis.'],
    ['complex', 'Multi-step reasoning, maths, legal/financial/medical analysis, long documents, tasks needing careful planning or high accuracy (not primarily about code).'],
    ['coding', 'Writing, reviewing, refactoring or debugging code, SQL, scripts, APIs, or software/system architecture design.'],
  ];
  const steps = [
    ['1', 'The SC-Classifier ServiceCallout in Apigee calls Gemini 3.5 Flash-Lite on Vertex AI (global endpoint, Google access token) with the first 4,000 characters of the prompt plus its total length. Thinking is set to minimal and temperature to 0.'],
    ['2', 'Gemini replies with schema-enforced JSON: tier, domain, confidence (0–1) and a reason of up to 15 words. It never answers the prompt itself.'],
    ['3', `JS-DecideRoute accepts the verdict only if the tier is valid and confidence ≥ ${r.minConfidence}. Otherwise the Preset Rules Engine decides.`],
    ['4', 'The tier is mapped to its model and thinking level (below), the request is forwarded, and the decision comes back in x-route-* headers (tier, decided-by, confidence, reason, fallback).'],
  ];
  body.replaceChildren(
    el('figure', { class: 'rules-figure' }, [
      el('img', { src: '/assets/classifier.png', alt: `Classifier LLM flow: inside the Apigee proxy, the SC-Classifier ServiceCallout sends the first 4,000 chars to Gemini 3.5 Flash-Lite on Vertex AI, which returns tier, domain, confidence and reason. If the tier is valid and confidence ≥ ${r.minConfidence}, route to Simple (Gemini 3.5 Flash-Lite), Standard (Gemini 3.5 Flash), Complex (Gemini 3.1 Pro) or Coding (Gemini 2.5 Pro); on error, timeout, invalid tier or low confidence, fall back to the Preset Rules Engine.`, width: '3432', height: '973' }),
    ]),
    el('p', { class: 'rules-muted', text: 'A small, fast LLM reads the prompt and decides which tier it needs. Because it understands intent, a short but hard question (e.g. a tricky maths problem) still goes to Complex, which length-based rules would send to Simple. The cost is about one extra second per request.' }),
    el('h4', { class: 'rules-h', text: 'How it works' }),
    numberedSteps(steps),
    el('h4', { class: 'rules-h', text: 'Classification rubric (system instruction)' }),
    el('table', { class: 'rules-table' }, [
      el('tbody', {}, rubric.map(([t, d]) => el('tr', {}, [el('td', {}, [modelPill(t, t)]), el('td', { text: d })]))),
    ]),
    el('p', { class: 'rules-note', text: 'ⓘ Code and architecture prompts go to the Coding tier; other hard prompts go to Complex.' }),
    el('h4', { class: 'rules-h', text: 'Tier → model' }),
    tierTable(r),
    el('h4', { class: 'rules-h', text: 'Safeguards' }),
    el('ul', { class: 'rules-list' }, [
      el('li', { text: 'The prompt is wrapped in <prompt> tags and treated as data; instructions inside it about how to classify are ignored.' }),
      el('li', { text: 'Output is constrained by a JSON schema with an enum of tiers and domains, so free-text answers are rejected.' }),
      el('li', { text: `Classifier error, 5 s timeout, unparsable or invalid tier, or confidence below ${r.minConfidence} → the Preset Rules Engine decides instead (decided_by: "rules (fallback)").` }),
    ]),
  );
}

function renderNvidia(body, r) {
  const nv = r.nvidia || {};
  const codingTasks = [...new Set([...(nv.complexTasks || ['Code Generation']), 'System Design'])].join(' or ');
  const steps = [
    ['1', 'The SC-ClassifierEngine ServiceCallout in Apigee calls the private Cloud Run service prompt-classifier (asia-southeast1) through TargetServer classifier-engine, sending the first 4,000 characters of the prompt.'],
    ['2', 'Apigee authenticates with a Google-signed ID token for the proxy service account (YOUR_PROXY_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com); Cloud Run IAM rejects every other caller.'],
    ['3', 'The container runs the NVIDIA NemoCurator Prompt Task & Complexity Classifier (DeBERTa-v3-base) on CPU in ~35 ms and returns task_type, task_prob and six scores (0–1): complexity, reasoning, creativity, domain knowledge, constraints and more.'],
    ['4', 'JS-DecideRoute checks the rules below from top to bottom and picks the first tier that matches. Thresholds come from routing.properties.'],
    ['5', 'The request is forwarded to the model mapped to that tier; the task and full score breakdown are returned in the x-route-task and x-route-scores headers.'],
  ];
  const rules = [
    ['1', 'coding', `Task is ${codingTasks}`, 'Code writing, debugging or system design goes to the coding model.'],
    ['2', 'complex', `Reasoning ≥ ${nv.reasoningComplex}`, 'Multi-step logic, maths, proofs, word problems.'],
    ['3', 'complex', `Domain ≥ ${nv.domainComplex} and Constraints ≥ ${nv.constraintComplex}`, 'Deep specialist topic with several explicit constraints.'],
    ['4', 'simple', `Complexity < ${nv.simpleMaxComplexity} and Reasoning < ${nv.simpleMaxReasoning}`, 'Low overall complexity and little reasoning needed.'],
    ['5', 'standard', 'Everything else', 'General writing, summaries, business communication.'],
    ['↩', 'rules', `Error, 3 s timeout, missing score, task "Unknown" or task_prob < ${nv.minTaskProb}`, 'Falls back to the Preset Rules Engine (decided_by: "rules (fallback)").'],
  ];
  body.replaceChildren(
    el('figure', { class: 'rules-figure' }, [
      el('img', { src: '/assets/nvidia.png', alt: 'NVIDIA NemoCurator Complexity Classifier flow: inside Apigee, SC-ClassifierEngine calls the private Cloud Run DeBERTa-v3 classifier with a Google ID token. JS-DecideRoute checks task_prob ≥ 0.2, then first match wins: Code Generation or System Design → Coding (Gemini 2.5 Pro); reasoning ≥ 0.4, or domain ≥ 0.9 and constraints ≥ 0.45 → Complex (Gemini 3.1 Pro); complexity < 0.15 and reasoning < 0.2 → Simple (Gemini 3.5 Flash-Lite); otherwise Standard (Gemini 3.5 Flash). Errors, timeouts, missing scores, Unknown task or low task_prob fall back to the Preset Rules Engine.', width: '2656', height: '954' }),
    ]),
    el('p', { class: 'rules-muted', text: 'A dedicated, self-hosted DeBERTa-v3 model on Cloud Run scores the prompt in ~35 ms, far faster than a classifier LLM (~1 s). It can select all four tiers, including Coding.' }),
    el('h4', { class: 'rules-h', text: 'How it works' }),
    numberedSteps(steps),
    el('h4', { class: 'rules-h', text: 'Decision logic (first match wins)' }),
    el('table', { class: 'rules-table' }, [
      el('thead', {}, [el('tr', {}, ['#', 'Tier', 'Condition', 'Meaning'].map(h => el('th', { text: h })))]),
      el('tbody', {}, rules.map(([n, tier, cond, desc]) => el('tr', {}, [
        el('td', { class: 'mono', text: n }),
        el('td', {}, [modelPill(tier, tier === 'rules' ? 'fallback' : tier)]),
        el('td', { class: 'mono', text: cond }),
        el('td', { text: desc }),
      ]))),
    ]),
    el('h4', { class: 'rules-h', text: 'Tier → model' }),
    tierTable(r),
    el('h4', { class: 'rules-h', text: 'Safeguards' }),
    el('ul', { class: 'rules-list' }, [
      el('li', { text: 'Private Cloud Run: only the Apigee proxy service account may invoke the endpoint.' }),
      el('li', { text: 'Bounded input: at most 4,000 characters are sent, and the model reads at most 512 tokens.' }),
      el('li', { text: `Fail-safe: if the service errors, times out (3 s), returns an incomplete or "Unknown" result, or task_prob is below ${nv.minTaskProb}, the Preset Rules Engine decides.` }),
    ]),
  );
}

function renderRules(body, r) {
  const rows = [
    ['1', `Prompt shorter than ${r.simpleMaxChars} characters`, 'simple'],
    ['2', `Prompt at least ${r.complexMinChars.toLocaleString()} characters`, 'complex'],
    ['3', 'Anything else', 'standard'],
  ];
  body.replaceChildren(
    el('figure', { class: 'rules-figure' }, [
      el('img', { src: '/assets/rules-engine.png', alt: 'Preset Rules Engine flow (prompt length only): shorter than 160 chars → Simple (Gemini 3.5 Flash-Lite); at least 1,500 chars → Complex (Gemini 3.1 Pro); otherwise → Standard (Gemini 3.5 Flash). The rules never select the Coding tier.', width: '2703', height: '725' }),
    ]),
    el('p', { class: 'rules-muted', text: 'The simplest strategy: JS-DecideRoute looks only at the prompt length. It adds no latency or cost and always gives the same answer, but it cannot tell an easy long prompt from a hard short one. Thresholds come from the routing.properties property set.' }),
    el('table', { class: 'rules-table' }, [
      el('thead', {}, [el('tr', {}, ['#', 'Condition', 'Tier'].map(h => el('th', { text: h })))]),
      el('tbody', {}, rows.map(([n, cond, tier]) => el('tr', {}, [
        el('td', { class: 'mono', text: n }), el('td', { text: cond }), el('td', {}, [modelPill(tier, tier)]),
      ]))),
    ]),
    el('p', { class: 'rules-note', text: 'ⓘ Every verdict has confidence 1.0. The rules never select the Coding tier.' }),
    el('h4', { class: 'rules-h', text: 'Tier → model' }),
    tierTable(r, ['simple', 'standard', 'complex']),
    el('h4', { class: 'rules-h', text: 'Also the safety net' }),
    el('ul', { class: 'rules-list' }, [
      el('li', { text: `When the Classifier LLM or NVIDIA classifier fails, times out, returns an invalid tier or is not confident enough (Classifier < ${r.minConfidence}, NVIDIA task_prob < ${(r.nvidia || {}).minTaskProb}), these rules decide instead and the response shows decided_by: "rules (fallback)".` }),
    ]),
  );
}

/* ---------- Tier mapping ---------- */
function openMapDialog() {
  if (!state.catalog) return;
  const dlg = $('settings-dialog');
  if (!dlg.open) dlg.showModal();
}

// Read-only summary of the tier → model mapping shown in the Dynamic Routing tab.
function renderTierMap() {
  const box = $('tier-map');
  if (!box) return;
  box.replaceChildren();
  if (!state.defaults) {
    box.appendChild(el('div', { class: 'tier-map-empty', text: 'Model mapping unavailable (gateway offline).' }));
    return;
  }
  TIERS.forEach(t => {
    const m = state.models[t] || state.defaults[t];
    if (!m) return;
    const logo = el('span', { class: 'tier-map-logo', 'aria-hidden': 'true' });
    logo.innerHTML = getProviderLogo(m.id); // trusted inline SVG constants
    box.appendChild(el('div', { class: 'tier-map-row' }, [
      el('span', { class: 'tier-map-tier t-' + t, text: t }),
      logo,
      el('span', { class: 'tier-map-model', text: m.label }),
      state.prefs[t] ? el('span', { class: 'custom-tag', title: 'Changed from the default', text: 'custom' }) : null,
    ]));
  });
}

// Pipeline label reflects the active routing mode.
function renderBanner() {
  updateCompareAvailability();
  const s = stratById(state.strategy);
  if (state.staticModel) $('decide-label').textContent = 'Route · Static';
  else if (s) $('decide-label').textContent = 'Decide · ' + s.name.split(' ·')[0];
}

/* ---------- Presets & prompt ---------- */
function renderPresets() {
  const box = $('presets');
  box.replaceChildren();
  PRESETS.forEach(p => {
    const b = el('button', { type: 'button', class: 'preset-btn' + (p.tricky ? ' tricky' : '') + (state.preset === p.id ? ' active' : '') }, [
      el('span', { class: 'preset-title', text: p.title }),
      el('span', { class: 'preset-tokens', text: p.hint }),
    ]);
    b.addEventListener('click', () => { state.preset = p.id; $('prompt').value = p.text; updateCharCount(); renderPresets(); });
    box.appendChild(b);
  });
}
function updateCharCount() {
  const t = $('prompt');
  const n = t.value.length;
  $('char-count').textContent = `${n.toLocaleString()} chars (~${Math.ceil(n / 4).toLocaleString()} tokens)`;
  // Grow with the text; CSS max-height caps it (then it scrolls).
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 2 + 'px';
}

/* ---------- Telemetry ---------- */
function setPipeline(status) {
  $('pipeline').querySelectorAll('li').forEach(li => { li.className = status[li.dataset.step] || ''; });
}

function showAlert(kind, icon, title, msg) {
  const a = $('alert');
  if (!kind) { a.classList.add('hidden'); return; }
  a.className = 'alert ' + kind;
  $('alert-icon').textContent = icon;
  $('alert-title').textContent = title;
  $('alert-msg').textContent = msg;
}

function modelPill(tier, text) {
  return el('span', { class: 'model-pill t-' + (tier || 'error'), text });
}

// Only called from user actions (send / compare / validation), so scrolling here is expected.
function showTelemetry() {
  $('empty-state').classList.add('hidden');
  $('telemetry').classList.remove('hidden');
  const card = document.querySelector('.response-card');
  if (card && card.getBoundingClientRect().top > window.innerHeight * 0.4) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderDecision(r) {
  const d = r.decision || {};
  const tier = d.tier || tierOfModel(d.model);
  const fellBack = /fallback/.test(d.decided_by || '');

  $('latency-pill').classList.remove('hidden');
  $('latency').textContent = r.latencyMs + ' ms';

  const failedOver = !!d.failover_from && !r.error;
  $('f-model').replaceChildren(...(d.model
    ? [modelPill(tier, routedLabel(d, tier)), failedOver ? el('span', { class: 'failover-tag', title: 'Served by the backup model', text: 'failover' }) : null].filter(Boolean)
    : [document.createTextNode('–')]));
  $('f-decided').textContent = decidedBy(d);
  const conf = typeof d.confidence === 'number' ? d.confidence : null;
  $('f-conf').textContent = conf === null ? '–' : conf.toFixed(2);
  $('f-conf-bar').style.width = conf === null ? '0%' : Math.round(conf * 100) + '%';
  $('f-ms').textContent = d.decision_ms != null ? d.decision_ms + ' ms' : '–';
  $('f-tokens').textContent = r.usage ? `${r.usage.total.toLocaleString()} (${r.usage.prompt} / ${r.usage.output})` : (r.mode === 'route' ? 'n/a · dry run' : '–');
  renderCost(r, d, tier);
  $('f-reason').textContent = state.staticModel && d.model
    ? `Static route: pinned to ${routedLabel(d, tier)}; dynamic routing bypassed`
    : (d.reason || '–');

  if (r.error) {
    showAlert('error', '⛔', `HTTP ${r.status || 'error'} — request not completed`, r.error + (d.failover_reason ? ` (${d.failover_reason})` : ''));
  } else if (failedOver) {
    const from = (catalogModel(d.failover_from) || {}).label || d.failover_from;
    showAlert('warn', '🔁', `Failover: ${from} → ${routedLabel(d, tier)}`,
      `${from} failed: ${d.failover_reason || 'error'}. Apigee retried once on the tier's backup model, so the caller still got an answer.` +
      (fellBack ? ` The decision itself also fell back to the rules engine: ${d.fallback_reason || 'unavailable'}.` : ''));
  } else if (fellBack) {
    showAlert('warn', '↩️', 'Fallback to rules engine', `Primary strategy verdict rejected: ${d.fallback_reason || 'unavailable'}. Apigee applied the deterministic rules instead.`);
  } else {
    showAlert(null);
  }

  setPipeline({
    auth: r.status === 401 || r.status === 403 ? 'err' : 'ok',
    decide: r.error && !d.model ? 'err' : (fellBack ? 'warn' : 'ok'),
    model: r.mode === 'route' ? 'skip' : (r.error ? 'err' : (failedOver ? 'warn' : 'ok')),
  });

  const scoresStr = d.scores || d.classifier_scores;
  let scoresBox = $('scores-box');
  if (scoresStr) {
    if (!scoresBox) {
      scoresBox = el('div', { id: 'scores-box', class: 'scores-card' });
      $('telemetry').insertBefore(scoresBox, $('answer-box'));
    }
    const pairs = {};
    scoresStr.split(';').forEach(part => {
      const idx = part.indexOf('=');
      if (idx > 0) pairs[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    });
    const items = [
      { key: 'task', label: 'Task Category', val: pairs.task || d.task || '–', isText: true },
      { key: 'p', label: 'Task Probability', val: pairs.p },
      { key: 'complexity', label: 'Overall Complexity', val: pairs.complexity },
      { key: 'reasoning', label: 'Reasoning Depth', val: pairs.reasoning },
      { key: 'domain', label: 'Domain Knowledge', val: pairs.domain },
      { key: 'constraints', label: 'Constraints', val: pairs.constraints },
      { key: 'creativity', label: 'Creativity Scope', val: pairs.creativity },
    ];
    scoresBox.replaceChildren(
      el('div', { class: 'scores-head' }, [
        el('span', { text: '⚡ NVIDIA NemoCurator Classifier Dimensions' }),
        el('span', { class: 'mono', text: d.task || pairs.task || '' }),
      ]),
      el('div', { class: 'scores-grid' }, items.map(item => {
        const numVal = parseFloat(item.val);
        const hasNum = !item.isText && !isNaN(numVal);
        return el('div', { class: 'score-item' }, [
          el('span', { class: 'score-lbl', text: item.label }),
          el('div', { class: 'score-val' }, [
            el('span', { text: item.val || '–' }),
          ]),
          hasNum ? el('div', { class: 'score-bar-bg' }, [
            el('div', { class: 'score-bar-fill', style: `width: ${Math.round(numVal * 100)}%` })
          ]) : null,
        ]);
      }))
    );
    scoresBox.classList.remove('hidden');
  } else if (scoresBox) {
    scoresBox.classList.add('hidden');
  }
}

/* ---------- Stats & log ---------- */
function priceOf(tier, usage, modelId) {
  const m = catalogModel(modelId) || state.models[tier];
  return m && usage ? (usage.prompt * m.price.in + usage.output * m.price.out) / 1e6 : 0;
}

function recordStats(r, prompt) {
  const d = r.decision || {};
  const tier = d.tier || tierOfModel(d.model);
  if (!tier) return;
  const key = d.model || tier;
  const entry = state.mix[key] || (state.mix[key] = { n: 0, tier, label: routedShort(d, tier), full: routedLabel(d, tier) });
  entry.n += 1;
  state.requests += 1;
  state.latencySum += r.latencyMs || 0;
  if (r.usage) { state.cost += priceOf(tier, r.usage, d.model); state.proCost += baselineCost(r.usage); }

  const entries = Object.values(state.mix);
  const total = entries.reduce((a, e) => a + e.n, 0);
  const mix = $('mix');
  mix.replaceChildren();
  entries.forEach(e => {
    const seg = el('div', { class: 'mix-seg t-' + e.tier, title: `${e.full}: ${e.n}` }, [el('span', { text: `${e.label} · ${e.n}` })]);
    seg.style.flex = String(e.n / total);
    mix.appendChild(seg);
  });
  $('s-cost').textContent = '$' + state.cost.toFixed(4);
  $('s-pro').textContent = '$' + state.proCost.toFixed(4);
  $('s-saved').textContent = state.proCost > 0 ? Math.round((1 - state.cost / state.proCost) * 100) + '%' : '–';
  $('k-req').textContent = String(state.requests);
  $('k-lat').textContent = formatMs(state.latencySum / state.requests);

  const hist = $('history');
  const empty = hist.querySelector('.log-empty');
  if (empty) empty.remove();
  hist.prepend(el('tr', {}, [
    el('td', { class: 'mono', text: new Date().toLocaleTimeString('en-GB', { hour12: false }) }),
    el('td', { class: /fallback/.test(d.decided_by || '') ? 'warn-text' : '', text: decidedBy(d, r.strategy) }),
    el('td', { class: d.failover_from ? 'warn-text' : '', title: d.failover_from ? `Failover from ${d.failover_from}` : '', text: d.failover_from ? '🔁 Failover' : 'Chat' }),
    el('td', {}, [modelPill(tier, routedShort(d, tier))]),
    el('td', { class: 'mono', text: r.usage ? String(r.usage.total) : '–' }),
    el('td', { class: 'mono', text: formatMs(r.latencyMs) }),
    el('td', { class: 'prompt-cell', title: prompt.slice(0, 300), text: prompt }),
  ]));
  while (hist.children.length > 15) hist.lastChild.remove();
}

/* ---------- Gateway calls ---------- */
// In static mode the proxy still reports its internal verdict ("rules"), but the model was pinned by the user.
function decidedBy(d, dflt) {
  if (state.staticModel && d.model) return 'static';
  return d.decided_by || dflt || '–';
}

// Static mode pins every tier to the chosen model; the strategy is then irrelevant, so send the cheapest ('rules').
function gatewayBody(mode, strategy) {
  const m = state.staticModel;
  const prefs = m ? { simple: m, standard: m, complex: m, coding: m } : state.prefs;
  return JSON.stringify({
    prompt: $('prompt').value, strategy: strategy || state.strategy || 'rules', mode, prefs,
    simulateOutage: mode !== 'route' && $('opt-outage').checked,
  });
}

async function callGateway(mode, strategy) {
  const res = await fetch('/api/gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: gatewayBody(mode, strategy),
  });
  const json = await res.json().catch(() => ({ error: 'Unexpected response from local server.' }));
  if (!res.ok) return { status: res.status, error: json.error || `HTTP ${res.status}`, mode, strategy, latencyMs: 0, decision: {} };
  return json;
}

function setBusy(on) {
  state.busy = on;
  $('btn-chat').disabled = on;
  updateCompareAvailability();
  document.body.classList.toggle('busy', on);
}

// Comparing strategies is meaningless when every prompt is pinned to one model.
function updateCompareAvailability() {
  const b = $('btn-compare');
  if (!b) return;
  b.disabled = state.busy || !!state.staticModel;
  b.title = state.staticModel
    ? 'Comparison applies to Dynamic Routing. Switch to Dynamic Routing to compare strategies.'
    : 'Runs every Dynamic Routing strategy on this prompt. Decision only; no model is called.';
}

// One story at a time: a single request's telemetry, or the strategy comparison.
function setView(view) {
  const cmp = view === 'compare';
  ['pipeline', 'tele-grid'].forEach(id => $(id).classList.toggle('hidden', cmp));
  if (cmp) $('latency-pill').classList.add('hidden'); // renderDecision shows it again for single requests
  $('answer-box').classList.toggle('hidden', cmp);
  $('compare-box').classList.toggle('hidden', !cmp);
}

function validPrompt() {
  if ($('prompt').value.trim()) return true;
  showTelemetry();
  showAlert('error', '✏️', 'Prompt required', 'Type a prompt or pick one of the presets first.');
  return false;
}

// "Route & Send" is the only single-prompt action; the decision-only (route) mode is still used by Compare.
async function run() {
  if (state.busy || !validPrompt()) return;
  return runStream();
}

// Streaming chat: NDJSON events from the BFF (meta -> delta* -> done | error).
async function runStream() {
  const prompt = $('prompt').value.trim();
  const t0 = performance.now();
  setBusy(true);
  showTelemetry();
  showAlert(null);
  setView('single');
  $('answer').textContent = 'Waiting for the routing decision…';
  $('answer').classList.remove('md');
  $('answer-model').textContent = '';
  showReasoning('');
  setPipeline({ auth: 'ok', decide: 'run' });

  const r = { mode: 'chat', strategy: state.strategy, decision: {}, latencyMs: 0, status: 0 };
  let answer = '';
  const tick = setInterval(() => { $('f-total').textContent = Math.round(performance.now() - t0) + ' ms'; }, 100);
  try {
    const res = await fetch('/api/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: gatewayBody('stream'),
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      Object.assign(r, { status: res.status, error: j.error || `HTTP ${res.status}` });
      renderDecision(r);
      $('answer').textContent = r.error;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.type === 'meta') {
          r.status = ev.status;
          r.decision = ev.decision || {};
          r.latencyMs = ev.headersMs;
          renderDecision(r);
          if (ev.status >= 200 && ev.status < 300) {
            setPipeline({ auth: 'ok', decide: /fallback/.test(r.decision.decided_by || '') ? 'warn' : 'ok', model: 'run' });
            const dm = r.decision;
            $('answer').textContent = dm.failover_from
              ? `${(catalogModel(dm.failover_from) || {}).label || dm.failover_from} failed; answered by backup ${routedLabel(dm, dm.tier)}…`
              : `Routed to ${routedLabel(dm, dm.tier)} — waiting for the answer…`;
            $('answer-model').textContent = r.decision.model ? `${r.decision.model} · ${getHostingPlatform(r.decision.model)}` : '';
          }
        } else if (ev.type === 'reasoning') {
          showReasoning(ev.text);
        } else if (ev.type === 'delta') {
          answer += ev.text;
          $('answer').classList.add('md');
          renderMarkdown($('answer'), answer);
          $('answer').scrollTop = $('answer').scrollHeight;
        } else if (ev.type === 'done') {
          r.usage = ev.usage || null;
          r.latencyMs = ev.latencyMs;
        } else if (ev.type === 'error') {
          r.error = ev.error;
        }
      }
    }
    renderDecision(r);
    if (!answer) { $('answer').classList.remove('md'); $('answer').textContent = r.error || '(empty response)'; }
    if (!r.error) recordStats(r, prompt);
  } catch (e) {
    showAlert('error', '⛔', 'Local server unreachable', 'Could not reach the demo backend.');
    setPipeline({});
  } finally {
    clearInterval(tick);
    $('f-total').textContent = Math.round(performance.now() - t0) + ' ms';
    setBusy(false);
  }
}

const STRATEGY_SHORT = { rules: 'Rules', classifier: 'Classifier LLM', nvidia: 'NVIDIA' };

// One-line takeaway: do the decision engines agree on this prompt?
function compareVerdict(ids, results) {
  const groups = new Map();
  results.forEach((r, i) => {
    const d = r.decision || {};
    const key = r.error || !d.model ? 'error' : routedShort(d, d.tier || tierOfModel(d.model));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(STRATEGY_SHORT[ids[i]] || ids[i]);
  });
  const join = names => names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0];
  if (groups.size === 1) {
    const [model] = groups.keys();
    return model === 'error'
      ? { kind: 'error', text: 'No strategy returned a decision.' }
      : { kind: 'agree', text: `✅ All strategies agree: ${model}.` };
  }
  const parts = [...groups.entries()].map(([model, names]) => `${join(names)} → ${model === 'error' ? 'error' : model}`);
  return { kind: 'disagree', text: `⚠️ Strategies disagree: ${parts.join(' · ')}` };
}

async function compare() {
  if (state.busy || state.staticModel || !validPrompt()) return;
  setBusy(true);
  showTelemetry();
  showAlert(null);
  setView('compare');
  const body = $('compare-body');
  body.replaceChildren();
  const verdict = $('compare-verdict');
  verdict.className = 'compare-verdict';
  verdict.textContent = 'Asking each decision engine…';
  try {
    const ids = STRATEGIES.filter(s => !s.comingSoon).map(s => s.id);
    const results = await Promise.all(ids.map(s => callGateway('route', s)));
    results.forEach((r, i) => {
      const d = r.decision || {};
      const tier = d.tier || tierOfModel(d.model);
      const m = catalogModel(d.model);
      const fellBack = /fallback/.test(d.decided_by || '');
      const nameCell = el('td', {}, [
        el('span', { text: stratById(ids[i]).name }),
        ids[i] === state.strategy ? el('span', { class: 'sel-tag', text: 'selected' }) : null,
      ]);
      const whyCell = el('td', { class: 'reason-cell' }, [
        fellBack ? el('span', { class: 'fallback-tag', title: d.fallback_reason || '', text: '↩ fell back to rules' }) : null,
        el('span', { text: r.error ? r.error : (d.reason || '–') }),
      ]);
      body.appendChild(el('tr', { class: ids[i] === state.strategy ? 'is-selected' : '' }, [
        nameCell,
        el('td', {}, [modelPill(r.error ? null : tier, r.error ? 'error' : routedShort(d, tier))]),
        whyCell,
        el('td', { class: 'mono', text: d.decision_ms != null ? d.decision_ms + ' ms' : '–' }),
        el('td', { class: 'mono', title: m ? formatPrice(m) + ' per 1M tokens (in / out)' : '', text: m ? m.cost : '–' }),
      ]));
    });
    const v = compareVerdict(ids, results);
    verdict.className = 'compare-verdict ' + v.kind;
    verdict.textContent = v.text;
  } catch (e) {
    verdict.textContent = '';
    showAlert('error', '⛔', 'Comparison failed', 'Could not reach the demo backend.');
  } finally {
    setBusy(false);
  }
}

/* ---------- Left panel resizer ---------- */
const PANEL_DEFAULT_W = 540;
const PANEL_MIN_W = 320;
function initPanelResizer() {
  const panel = $('left-panel');
  const handle = $('panel-resizer');
  if (!panel || !handle) return;
  // Keep at least ~560px for the right panel on narrow screens.
  const maxW = () => Math.max(PANEL_MIN_W, Math.min(900, window.innerWidth - 560));
  const apply = (w, persist) => {
    const clamped = Math.round(Math.min(maxW(), Math.max(PANEL_MIN_W, w)));
    panel.style.width = clamped + 'px';
    handle.setAttribute('aria-valuenow', String(clamped));
    handle.setAttribute('aria-valuemin', String(PANEL_MIN_W));
    handle.setAttribute('aria-valuemax', String(maxW()));
    if (persist) { try { localStorage.setItem('llmr-panel-w', String(clamped)); } catch (e) { /* ignore */ } }
  };
  let saved = NaN;
  try { saved = parseInt(localStorage.getItem('llmr-panel-w'), 10); } catch (e) { /* ignore */ }
  apply(Number.isFinite(saved) ? saved : PANEL_DEFAULT_W, false);

  let startX = 0, startW = 0;
  const onMove = e => apply(startW + (e.clientX - startX), false);
  const onUp = e => {
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing');
    handle.releasePointerCapture?.(e.pointerId);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    apply(panel.getBoundingClientRect().width, true);
  };
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    handle.setPointerCapture?.(e.pointerId);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
  handle.addEventListener('dblclick', () => apply(PANEL_DEFAULT_W, true));
  handle.addEventListener('keydown', e => {
    const step = e.shiftKey ? 60 : 20;
    const w = panel.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') { e.preventDefault(); apply(w - step, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); apply(w + step, true); }
    else if (e.key === 'Home') { e.preventDefault(); apply(PANEL_MIN_W, true); }
    else if (e.key === 'End') { e.preventDefault(); apply(maxW(), true); }
  });
  window.addEventListener('resize', () => apply(panel.getBoundingClientRect().width, false));
}

/* ---------- Cost & Markdown ---------- */
const formatMs = ms => (ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms');
const formatUsd = v => (v > 0 && v < 0.0001 ? '<$0.0001' : '$' + v.toFixed(4));
const baselineCost = usage => (state.baseline ? priceOf(null, usage, state.baseline.id) : 0);

// Per-request cost of the model that actually answered, vs the same tokens on the baseline (most expensive) model.
function renderCost(r, d, tier) {
  const box = $('f-cost');
  box.replaceChildren();
  box.removeAttribute('title');
  if (!r.usage || !d.model) { box.textContent = '–'; return; }
  const cost = priceOf(tier, r.usage, d.model);
  const base = baselineCost(r.usage);
  box.appendChild(document.createTextNode(formatUsd(cost)));
  if (base > 0 && state.baseline && state.baseline.id !== d.model) {
    const pct = Math.round((1 - cost / base) * 100);
    box.appendChild(el('span', { class: 'cost-delta' + (pct < 0 ? ' neg' : ''), text: pct >= 0 ? `−${pct}%` : `+${-pct}%` }));
    box.title = `${formatUsd(base)} if the same tokens went to ${state.baseline.label}`;
  }
}

// Minimal Markdown renderer for model output. Builds DOM nodes only (textContent / createTextNode),
// never innerHTML, so model output cannot inject markup. Supports headings, paragraphs, bold/italic,
// inline code, fenced code blocks, lists, block quotes, simple tables, rules and http(s) links.
function mdInline(text) {
  const out = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*|(?<![A-Za-z0-9])_[^_\s][^_\n]*?_(?![A-Za-z0-9]))|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(el('code', { text: t.slice(1, -1) }));
    else if (m[2]) out.push(el('strong', {}, mdInline(t.slice(2, -2))));
    else if (m[3]) out.push(el('em', {}, mdInline(t.slice(1, -1))));
    else if (m[4]) {
      const label = t.slice(1, t.indexOf(']('));
      out.push(el('a', { href: m[5], target: '_blank', rel: 'noopener noreferrer' }, [label]));
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function mdCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function renderMarkdown(box, src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const frag = document.createDocumentFragment();
  let para = [];
  let list = null;
  const flush = () => { if (para.length) { frag.appendChild(el('p', {}, mdInline(para.join(' ')))); para = []; } };
  const block = node => { flush(); list = null; frag.appendChild(node); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      block(el('pre', { class: 'md-code' }, [el('code', { 'data-lang': lang, text: code.join('\n') })]));
      continue;
    }
    if (!line.trim()) { flush(); list = null; continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { block(el('h' + Math.min(6, m[1].length + 2), { class: 'md-h' }, mdInline(m[2].replace(/#+\s*$/, '')))); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { block(el('hr')); continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = mdCells(line);
      const rows = [];
      i += 1;
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(mdCells(lines[++i]));
      block(el('div', { class: 'md-table' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, head.map(c => el('th', {}, mdInline(c))))]),
        el('tbody', {}, rows.map(r => el('tr', {}, r.map(c => el('td', {}, mdInline(c)))))),
      ])]));
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { block(el('blockquote', {}, mdInline(m[1]))); continue; }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      flush();
      const ordered = /\d/.test(m[2]);
      const tag = ordered ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { list = el(tag, { class: 'md-list' }); frag.appendChild(list); }
      list.appendChild(el('li', { class: m[1].length >= 2 ? 'md-nested' : '' }, mdInline(m[3])));
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { // continuation of the previous list item
      const li = list.lastChild;
      li.appendChild(document.createTextNode(' '));
      mdInline(line.trim()).forEach(n => li.appendChild(typeof n === 'string' ? document.createTextNode(n) : n));
      continue;
    }
    list = null;
    para.push(line.trim());
  }
  flush();
  box.replaceChildren(frag);
}

/* ---------- Init ---------- */
// Header "One Gateway. Any Model." logo stack, built from the trusted inline LOGOS constants.
function renderLogoStack() {
  const box = $('logo-stack');
  if (!box) return;
  [['gemini', 'Gemini & Gemma'], ['azure', 'GPT (Azure AI Foundry)'], ['anthropic', 'Claude'], ['xai', 'Grok'], ['zai', 'GLM (Vertex AI MaaS)']].forEach(([k, name]) => {
    const chip = el('span', { class: 'logo-chip logo-' + k, title: name });
    chip.innerHTML = LOGOS[k]; // trusted inline SVG constants
    box.appendChild(chip);
  });
}

async function init() {
  let saved = 'light';
  try { saved = localStorage.getItem('llmr-theme') || 'light'; } catch (e) { /* ignore */ }
  applyTheme(saved === 'dark' ? 'dark' : 'light');
  renderLogoStack();
  initPanelResizer();
  $('themeToggleBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  $('rules-close').addEventListener('click', () => $('rules-dialog').close());
  $('rules-dialog').addEventListener('click', e => { if (e.target === $('rules-dialog')) $('rules-dialog').close(); }); // backdrop
  
  $('btn-customize-map').addEventListener('click', openMapDialog);
  $('tier-map').addEventListener('click', openMapDialog);
  $('tier-map').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMapDialog(); } });
  $('settings-close').addEventListener('click', () => $('settings-dialog').close());
  $('settings-dialog').addEventListener('click', e => { if (e.target === $('settings-dialog')) $('settings-dialog').close(); });
  
  renderPresets();
  renderStrategies();
  $('prompt').addEventListener('input', () => { state.preset = null; updateCharCount(); renderPresets(); });
  $('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run('chat'); });
  $('btn-chat').addEventListener('click', () => run('chat'));
  $('btn-compare').addEventListener('click', compare);
  $('btn-outage-help').addEventListener('click', () => $('outage-dialog').showModal());
  $('outage-close').addEventListener('click', () => $('outage-dialog').close());
  $('outage-dialog').addEventListener('click', e => { if (e.target === $('outage-dialog')) $('outage-dialog').close(); }); // backdrop
  $('btn-arch').addEventListener('click', () => $('arch-dialog').showModal());
  $('arch-close').addEventListener('click', () => $('arch-dialog').close());
  $('arch-dialog').addEventListener('click', e => { if (e.target === $('arch-dialog')) $('arch-dialog').close(); }); // backdrop
  $('opt-outage').addEventListener('change', () => $('opt-outage').closest('.opt-toggle').classList.toggle('on', $('opt-outage').checked));
  $('tab-dynamic').addEventListener('click', () => { if (!state.busy) setMode('dynamic'); });
  $('tab-static').addEventListener('click', () => { if (!state.busy) setMode('static'); });

  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    state.defaults = cfg.models;
    state.models = { ...cfg.models };
    state.catalog = cfg.catalog;
    // Savings baseline: the most expensive model in the catalog ("what if every prompt went to the premium model?").
    state.baseline = Object.values(cfg.catalog).reduce((a, m) => (!a || m.price.in + m.price.out > a.price.in + a.price.out ? m : a), null);
    $('s-pro-lbl').textContent = `If always ${state.baseline.label}`;
    $('s-pro-lbl').title = `Same tokens priced at ${state.baseline.label} (${formatPrice(state.baseline)} per 1M tokens in / out)`;
    $('statusDot').className = 'status-dot ok';
    $('statusText').textContent = 'Gateway Active';
    renderPrefs();
    renderStaticModels();
  } catch (e) {
    $('statusDot').className = 'status-dot err';
    $('statusText').textContent = 'Backend Offline';
  }
  renderTierMap();
  renderBanner();
  if (location.hash === '#static') setMode('static');
  if (location.hash === '#mapping') openMapDialog();
  if (['#rules', '#classifier', '#nvidia'].includes(location.hash)) openStrategyDialog(location.hash.slice(1));
  state.preset = 'simple';
  $('prompt').value = PRESETS[0].text;
  renderPresets();
  updateCharCount();
}

document.addEventListener('DOMContentLoaded', init);

// Collapsible "Model reasoning" panel above the answer. Reasoning models (e.g. GLM 5.2 on Vertex AI MaaS)
// return their thinking as Gemini "thought" parts; Apigee passes it through untouched. Untrusted text: textContent only.
function showReasoning(text) {
  const box = $('reasoning-box');
  if (!box) return;
  const body = $('reasoning');
  if (!text) {
    box.classList.add('hidden');
    box.open = false;
    body.textContent = '';
    $('reasoning-meta').textContent = '';
    return;
  }
  body.textContent += text;
  const words = body.textContent.trim().split(/\s+/).length;
  $('reasoning-meta').textContent = `~${words.toLocaleString()} words`;
  box.classList.remove('hidden');
}

function getProviderLogo(id) {
  if (id.includes('gemini') || id.includes('gemma')) return LOGOS.gemini;
  if (id.includes('gpt')) return LOGOS.azure;
  if (id.includes('claude')) return LOGOS.anthropic;
  if (id.includes('grok')) return LOGOS.xai;
  if (id.includes('glm')) return LOGOS.zai;
  return LOGOS.default;
}

const TIER_DESC = {
  simple: 'Data extraction, sentiment analysis, spam filtering, and automated responses.',
  standard: 'General content writing, summarization, and customer support.',
  complex: 'Advanced reasoning, complex analysis, and autonomous agents.',
  coding: 'Complex code generation, technical debugging, and architecture design.'
};



const SUITABILITY = {
  simple: {
    recommended: ['gemini-3.5-flash-lite', 'gpt-4.1-nano', 'gemma2:2b'],
    unsuitable: ['gemini-3.1-pro-preview', 'grok-4.6@001', 'gemini-2.5-pro', 'glm-5.2']
  },
  standard: {
    recommended: ['gemini-3.5-flash', 'claude-sonnet-4-5@20250929'],
    unsuitable: ['gemma2:2b', 'gpt-4.1-nano']
  },
  complex: {
    recommended: ['gemini-3.1-pro-preview', 'grok-4.6@001', 'glm-5.2'],
    unsuitable: ['gemma2:2b', 'gpt-4.1-nano', 'gemini-3.5-flash-lite']
  },
  coding: {
    recommended: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929', 'glm-5.2'],
    unsuitable: ['gemma2:2b', 'gpt-4.1-nano', 'gemini-3.5-flash-lite']
  }
};

function getHostingPlatform(id) {
  if (id.includes('gemma')) return 'Cloud Run';
  if (id.includes('gpt')) return 'Azure AI Foundry';
  if (id.includes('grok')) return 'Vertex AI Model Garden';
  if (id.includes('glm')) return 'Vertex AI MaaS';
  return 'Google Cloud Vertex';
}

function getProviderName(id) {
  if (id.includes('gemini') || id.includes('gemma')) return 'Google';
  if (id.includes('gpt')) return 'OpenAI';
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('grok')) return 'xAI';
  if (id.includes('glm')) return 'Z.ai';
  return 'Unknown';
}

function renderPrefs() {
  const box = $('model-preferences');
  if (!box) return;
  box.replaceChildren();

  const table = el('table', { class: 'model-matrix-table' });
  
  // Header
  const thead = el('thead');
  const trHead = el('tr');
  trHead.appendChild(el('th', { text: 'Model' }));
  trHead.appendChild(el('th', { text: 'Provider', class: 'matrix-provider-th' }));
  trHead.appendChild(el('th', { text: 'Hosting', class: 'matrix-provider-th' }));
  
  TIERS.forEach(t => {
    const th = el('th');
    const headerDiv = el('div', { class: 'matrix-tier-header' });
    headerDiv.innerHTML = `${TIER_ICONS[t] || ''} <span>${t.charAt(0).toUpperCase() + t.slice(1)}</span>`;
    th.appendChild(headerDiv);
    const descDiv = el('div', { class: 'matrix-tier-desc', text: TIER_DESC[t] });
    th.appendChild(descDiv);
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  
  Object.values(state.catalog).forEach(m => {
    const tr = el('tr');
    
    // Model Info Cell
    const tdInfo = el('td', { class: 'matrix-model-cell' });
    const logoWrapper = el('div', { class: 'model-rc-logo' });
    logoWrapper.innerHTML = getProviderLogo(m.id);
    tdInfo.appendChild(logoWrapper);
    
    const infoDiv = el('div');
    infoDiv.appendChild(el('div', { class: 'model-rc-name', text: m.label }));
    let priceText = 'Free';
    if (m.price.in > 0 || m.price.out > 0) {
      priceText = `${m.price.in.toFixed(2)} in / ${m.price.out.toFixed(2)} out per 1M`;
    }
    infoDiv.appendChild(el('div', { class: 'model-rc-price', text: priceText }));
    const hw = demoHardwareWarning(m.id, true);
    if (hw) infoDiv.appendChild(hw);
    tdInfo.appendChild(infoDiv);
    tr.appendChild(tdInfo);
    
    // Provider Cell
    const tdProvider = el('td', { class: 'matrix-provider-cell', text: getProviderName(m.id) });
    tr.appendChild(tdProvider);
    const tdHosting = el('td', { class: 'matrix-provider-cell', text: getHostingPlatform(m.id) });
    tr.appendChild(tdHosting);
    
    // Radio Cells for each tier
    TIERS.forEach(t => {
      const defM = state.defaults[t];
      const isDef = (m.id === defM.id);
      const isSelected = (state.prefs[t] ? state.prefs[t] === m.id : isDef);
      
      const tdRadio = el('td', { class: 'matrix-radio-cell' });
      const label = el('label', { class: 'matrix-radio-wrapper', title: isDef ? 'Default model' : '' });
      
      const input = el('input', { type: 'radio', name: `tier_${t}`, value: m.id });
      input.checked = isSelected;
      
      input.addEventListener('change', e => {
        if (e.target.checked) {
          state.prefs[t] = (m.id === defM.id) ? null : m.id;
          state.models[t] = state.prefs[t] ? state.catalog[state.prefs[t]] : state.defaults[t];
          renderTierMap();
          renderPrefs(); // Re-render to update classes
        }
      });
      
      label.appendChild(input);
      
      const span = el('span', { class: 'custom-radio' });
      label.appendChild(span);
      
      // Optionally add a tiny star if it's the default
      if (isDef) {
        label.appendChild(el('span', { class: 'matrix-def-star', text: '⭐' }));
      }
      
      tdRadio.appendChild(label);
      if (isSelected) {
        tdRadio.classList.add('selected-cell');
      }
      if (SUITABILITY[t].recommended.includes(m.id)) {
        tdRadio.classList.add('matrix-rec');
        tdRadio.appendChild(el('div', { class: 'suitability-badge rec', text: '✅ Recommended' }));
      } else if (SUITABILITY[t].unsuitable.includes(m.id)) {
        tdRadio.classList.add('matrix-warn');
        tdRadio.appendChild(el('div', { class: 'suitability-badge warn', text: '⚠️ Not Suitable' }));
      }
      tr.appendChild(tdRadio);
    });
    
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  box.appendChild(table);
}