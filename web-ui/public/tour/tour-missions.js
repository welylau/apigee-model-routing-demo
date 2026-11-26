/**
 * Guided Tour - mission definitions for Apigee: Dynamic Model (LLM) Routing.
 *
 * Purely declarative: tour-engine.js renders and sequences these. A mission is complete when its
 * last step completes; then the "What just happened?" explainer is shown.
 *
 * Step fields (full schema: references/tour.md in the apigee-demo-ui skill)
 *   kind        'action' | 'scenario'
 *   title/body  coachmark copy (string or fn(engine)); body is trusted, authored HTML
 *   target      CSS selector to spotlight ('scenario' steps default to [data-scenario="<id>"])
 *   scenario    preset id from PRESETS in app.js (kind 'scenario': pick -> loaded -> running phases)
 *   shade       false = highlight without dimming
 *   action      { label, run(engine) } primary button (kind 'action')
 *   before(engine)  setup when the step is shown
 *   expect      short "Expected:" line
 *   done        { click: selector } | { verdict: [...] } | { run: fn(detail, engine) -> bool }
 *   onMiss      fn(detail, engine) -> hint HTML when a run does not satisfy `done`
 * Mission fields: id (used by ?tour=<id>), title, badge, bonus?, steps[], explainer {title, flow[{text,state,tag}], note} | fn(engine)
 *
 * demo:runresult detail (app.js chatResultDetail / compare):
 *   { ok, httpStatus, verdict: 'allowed'|'error', mode: 'chat'|'compare', static, scenarioId, tokens,
 *     routing: { tier, model, decidedBy, confidence, decisionMs, fellBack, failover, failoverFrom, cost, baselineCost, baselineLabel },
 *     compare: [{ strategy, name, model, tier, fellBack, error, decisionMs }] }
 * Explainer flow text/tags are escaped by the engine, so run values are safe there. Never put them in body/note HTML.
 */

const click = (sel) => document.querySelector(sel)?.click();
const usd = (v) => (v == null ? '—' : v > 0 && v < 0.0001 ? '<$0.0001' : `$${v.toFixed(4)}`);
const ms = (v) => (v == null ? '' : ` in ${v} ms`);
const chatOk = (d) => d.ok && d.mode === 'chat';

// Native <dialog>s render in the top layer, above the tour. Steps that open one complete when it closes,
// so the explainer is not hidden behind the modal.
const completeOnClose = (dialogId) => (e) => {
  const dlg = document.getElementById(dialogId);
  const missionId = e.mission?.id;
  const step = e.state.step;
  dlg?.addEventListener('close', () => {
    if (e.mode === 'step' && e.mission?.id === missionId && e.state.step === step) e.completeStep();
  }, { once: true });
};

const failHint = (d) => (d.ok ? '' : 'The request failed. Check the gateway status badge in the header, then send it again.');

export const WELCOME = {
  icon: '🔀',
  title: 'Welcome to Dynamic Model (LLM) Routing',
  subtitle: 'Watch Apigee X pick the right model for every prompt, and keep answering when a model goes down.',
  minutes: 5,
  bullets: [
    'How Apigee sits between apps and every model',
    'Cheap model for easy prompts, premium for hard ones',
    'Rules vs AI classifiers on a tricky prompt',
    'Automatic failover during a model outage',
    'Static routing: pin one model',
  ],
};

export const FINISH = {
  lead: "You've seen Apigee:",
  bullets: [
    'Route each prompt to the cheapest model that can handle it',
    'Swap the decision engine (rules, Gemini, NVIDIA) without changing apps',
    'Fail over to a backup model when one goes down',
    'Still serve apps that pin one model',
  ],
};

export const MISSIONS = [
  // ---------------------------------------------------------------- 1
  {
    id: 'architecture', title: 'Meet the architecture', badge: 'Overview',
    steps: [{
      kind: 'action', title: 'Meet the architecture', target: '#btn-arch',
      before: completeOnClose('arch-dialog'),
      body: `Apps send prompts to one <b>Apigee X</b> endpoint. Apigee then routes each one to a model.
        <ul><li><b>Static</b>: the app names the model</li><li><b>Dynamic</b>: Apigee picks it per prompt</li></ul>
        <small>Close the diagram (<kbd>Esc</kbd> or ✕) to continue.</small>`,
      action: { label: 'Open the diagram', run: () => click('#btn-arch') },
    }],
    explainer: {
      title: 'One gateway in front of every model',
      flow: [
        { text: 'Your app calls one Apigee endpoint', state: 'ok', tag: 'Gateway' },
        { text: 'Apigee checks the API key and SpikeArrest', state: 'ok', tag: 'Policy' },
        { text: 'Static: the app names the model', state: 'ok', tag: 'Static' },
        { text: 'Dynamic: Apigee picks a tier with rules, a Gemini classifier or an NVIDIA classifier', state: 'ok', tag: 'Dynamic' },
        { text: 'The tier maps to a model on any provider', state: 'ok', tag: 'Model' },
      ],
    },
  },
  // ---------------------------------------------------------------- 2
  {
    id: 'dynamic', title: 'Let Apigee pick the model', badge: 'Dynamic',
    steps: [{
      kind: 'action', title: 'Choose how Apigee decides', target: '#strategy-grid',
      before: (e) => { e.app.setOutage(false); e.app.setMode('dynamic'); },
      body: `Three decision engines, one gateway:<ul>
        <li><b>Rules</b>: prompt length, instant and free</li>
        <li><b>Classifier LLM</b>: Gemini Flash-Lite reads the intent</li>
        <li><b>NVIDIA</b>: a DeBERTa classifier on Cloud Run, ~35 ms</li></ul>`,
      action: { label: 'Use Classifier LLM', run: (e) => { e.app.setStrategy('classifier'); e.completeStep(); } },
      done: { click: '#strategy-grid .app-card' },
    }, {
      kind: 'scenario', scenario: 'simple', title: 'Send an easy prompt',
      body: 'A one-line factual question. It doesn\'t need a premium model.',
      expect: 'Simple tier · a cheap, fast model',
      done: { run: (d, e) => { if (chatOk(d)) e.simpleRun = d; return chatOk(d); } },
      onMiss: failHint,
    }, {
      kind: 'scenario', scenario: 'complex', title: 'Now a hard prompt',
      body: 'A multi-region architecture design. Same endpoint, same app. Watch Apigee switch model.',
      expect: 'Complex tier · a premium reasoning model',
      done: { run: chatOk },
      onMiss: failHint,
    }],
    explainer: (e) => {
      const s = e.simpleRun?.routing, c = e.lastRun?.routing || {};
      const st = e.app.stats?.() || {};
      return {
        title: 'Right model, right price',
        flow: [
          ...(s ? [{ text: `Easy prompt → ${s.tier || '?'} tier → ${s.model || '?'}`, state: 'ok', tag: usd(s.cost) }] : []),
          { text: `Hard prompt → ${c.tier || '?'} tier → ${c.model || '?'}`, state: 'ok', tag: usd(c.cost) },
          { text: `Decided by ${c.decidedBy || '—'}${ms(c.decisionMs)}`, state: c.fellBack ? 'miss' : 'ok', tag: 'Decide' },
          ...(st.savedPct != null ? [{ text: `Session: ${st.savedPct}% cheaper than sending everything to ${st.baselineLabel}`, state: 'ok', tag: 'Saved' }] : []),
        ],
        note: 'The <b>Model mix</b> and <b>Saved</b> KPIs at the top keep this running total for the whole session.',
      };
    },
  },
  // ---------------------------------------------------------------- 3
  {
    id: 'compare', title: 'Rules vs AI on a tricky prompt', badge: 'Compare',
    steps: [{
      kind: 'action', title: 'Load a tricky prompt', target: '[data-scenario="short-hard"]',
      before: (e) => e.app.setMode('dynamic'),
      body: '<b>Short but Hard</b>: a one-line maths proof. Length rules think "short = easy". Do the classifiers agree?',
      action: { label: 'Load it', run: (e) => { e.app.loadScenario('short-hard'); e.completeStep(); } },
      done: { click: '[data-scenario="short-hard"]' },
    }, {
      kind: 'action', title: 'Compare every strategy', target: '#btn-compare', shade: false,
      body: 'Asks all three decision engines about the same prompt. <b>Decision only</b>: no model is called, so it costs nothing.',
      expect: 'A table: one routed model per strategy',
      action: { label: 'Compare ⚖️', run: (e) => e.app.compare() },
      done: { run: (d) => d.mode === 'compare' && d.ok },
      onMiss: (d) => (d.mode === 'compare' ? 'No strategy returned a decision. Check the gateway status, then compare again.' : ''),
    }],
    explainer: (e) => {
      const rows = e.lastRun?.compare || [];
      return {
        title: e.lastRun?.agreement === 'disagree' ? 'The engines disagree' : 'Same prompt, three engines',
        flow: rows.map((r) => ({
          text: `${r.name} → ${r.error ? 'error' : r.model}${r.fellBack ? ' (fell back to rules)' : ''}`,
          state: r.error ? 'fail' : r.fellBack ? 'miss' : 'ok',
          tag: r.decisionMs != null ? `${r.decisionMs} ms` : '—',
        })),
        note: 'Rules are instant but only see length. The classifiers read the task, at the cost of a little latency. Pick per app, in Apigee, with no app change.',
      };
    },
  },
  // ---------------------------------------------------------------- 4
  {
    id: 'failover', title: 'Survive a model outage', badge: 'Failover',
    steps: [{
      kind: 'action', title: 'Break the model on purpose', target: '.opt-toggle.outage',
      before: (e) => e.app.setMode('dynamic'),
      body: '<b>Simulate model outage</b> makes the chosen model\'s call return <b>HTTP 404</b>. Nothing changes on the real backend.',
      action: { label: 'Turn it on', run: (e) => { e.app.setOutage(true); e.completeStep(); } },
      done: { click: '#opt-outage' },
    }, {
      kind: 'scenario', scenario: 'standard', anyScenario: true, title: 'Send a prompt',
      body: 'The routed model will fail. Watch what the caller gets back.',
      expect: '🔁 Failover banner · answered by the backup Gemini model',
      done: { run: (d) => chatOk(d) && d.routing?.failover },
      onMiss: (d) => (d.ok && !d.routing?.failover
        ? 'No failover this time. Is <b>Simulate model outage</b> still ticked?'
        : 'The request failed: the backup returned an error too. Send it again.'),
    }],
    explainer: (e) => {
      const r = e.lastRun?.routing || {};
      return {
        title: 'The caller never saw the outage',
        flow: [
          { text: `Apigee called ${r.failoverFrom || 'the routed model'}`, state: 'fail', tag: 'HTTP 404' },
          { text: 'Apigee caught the error and retried once on the tier\'s backup', state: 'ok', tag: 'Retry' },
          { text: `${r.model || 'The backup'} answered the caller`, state: 'ok', tag: usd(r.cost) },
        ],
        note: 'Real 404, 408, 429 and 5xx errors trigger the same failover. The outage toggle is switched off in the next mission.',
      };
    },
  },
  // ---------------------------------------------------------------- 5
  {
    id: 'static', title: 'Static routing: pin one model', badge: 'Static',
    steps: [{
      kind: 'action', title: 'Switch to Static Routing', target: '#tab-static',
      before: (e) => e.app.setOutage(false),
      body: 'Some apps must always use one model (compliance, an evaluated prompt, a contract). Apigee serves them too.',
      action: { label: 'Switch to Static', run: () => click('#tab-static') },
      done: { click: '#tab-static' },
    }, {
      kind: 'action', title: 'Pick a model', target: '#static-model-list',
      body: 'Gemini, Claude, GPT, Grok, GLM, Amazon Nova or a self-hosted Gemma, all behind the same endpoint. Pick one.',
      action: { label: 'Keep this one', run: (e) => e.completeStep() },
      done: { click: '#static-model-list .static-model-card' },
    }, {
      kind: 'scenario', scenario: 'simple', anyScenario: true, title: 'Send a prompt',
      body: 'Apigee skips the decision engine and forwards to the model you pinned.',
      expect: 'Decided By: static',
      done: { run: (d) => chatOk(d) && d.static },
      onMiss: (d) => (d.ok && !d.static ? 'That went through Dynamic Routing. Switch to the <b>Static Routing</b> tab first.' : failHint(d)),
    }],
    explainer: (e) => {
      const r = e.lastRun?.routing || {};
      return {
        title: 'The app chose, Apigee governed',
        flow: [
          { text: `The client pinned ${r.model || 'one model'}`, state: 'ok', tag: 'Static' },
          { text: 'Apigee still checked the API key and SpikeArrest', state: 'ok', tag: 'Policy' },
          { text: 'Tier rules skipped: no per-prompt optimisation', state: 'skip', tag: 'Decide' },
          { text: `${r.model || 'The model'} answered`, state: 'ok', tag: usd(r.cost) },
        ],
        note: 'Static is simple, but every prompt pays the same price. Dynamic routing is what saved money in Mission 2.',
      };
    },
  },
  // ---------------------------------------------------------------- bonus
  {
    id: 'mapping', title: 'Bonus: change the tier → model map', badge: 'Map', bonus: true,
    steps: [{
      kind: 'action', title: 'Change which model serves a tier', target: '#btn-customize-map',
      before: (e) => { e.app.setMode('dynamic'); completeOnClose('settings-dialog')(e); },
      body: `Decision engines output a <b>tier</b>, never a model name. Pick a different model for any tier
        (✅ recommended, ⚠️ not suitable).<br><small>Close the dialog (<kbd>Esc</kbd> or ✕) to continue.</small>`,
      action: { label: 'Open the mapping', run: () => click('#btn-customize-map') },
    }],
    explainer: {
      title: 'Models are configuration, not code',
      flow: [
        { text: 'The decision engine picks a tier: simple, standard, complex or coding', state: 'ok', tag: 'Tier' },
        { text: 'The map turns each tier into a model from any provider', state: 'ok', tag: 'Map' },
        { text: 'Swap a model without touching apps or the decision logic', state: 'ok', tag: 'Change' },
      ],
      note: 'Defaults live in the proxy\'s <code>routing.properties</code> property set; this dialog overrides them per request.',
    },
  },
];
