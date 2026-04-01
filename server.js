import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
//  Team & Flag Definitions – the single source of truth for the demo
// ---------------------------------------------------------------------------

const TEAMS = {
  infrastructure: {
    name: 'Platform Infrastructure',
    color: '#6366f1',
    abbr: 'INF',
    description: 'Cloud infrastructure, payment gateway provisioning, DB migrations, CDN',
  },
  api: {
    name: 'Core API',
    color: '#f59e0b',
    abbr: 'API',
    description: 'Payment processing, order management, inventory services',
  },
  web: {
    name: 'Web Experience',
    color: '#10b981',
    abbr: 'WEB',
    description: 'Checkout UI redesign, one-click purchase, responsive web',
  },
  mobile: {
    name: 'Mobile Engineering',
    color: '#ef4444',
    abbr: 'MOB',
    description: 'iOS & Android checkout flows, Apple Pay, push notifications',
  },
  data: {
    name: 'Data & Analytics',
    color: '#8b5cf6',
    abbr: 'DAT',
    description: 'Event tracking, real-time dashboards, A/B test reporting',
  },
};

const FLAG_DEFINITIONS = [
  {
    key: 'infra-payment-gateway',
    name: 'Payment Gateway Provisioning',
    team: 'infrastructure',
    description: 'Provision and validate new Stripe/Adyen payment gateway endpoints',
    prerequisites: [],
  },
  {
    key: 'infra-database-migration',
    name: 'Database Schema Migration',
    team: 'infrastructure',
    description: 'Run v2 schema migrations for orders, payments, and inventory tables',
    prerequisites: [],
  },
  {
    key: 'infra-cdn-optimization',
    name: 'CDN Edge Caching',
    team: 'infrastructure',
    description: 'Deploy optimized CDN rules for new checkout assets and API responses',
    prerequisites: [],
  },
  {
    key: 'api-payment-service-v2',
    name: 'Payment Service v2',
    team: 'api',
    description: 'New payment processing endpoints with multi-currency and 3DS2 support',
    prerequisites: ['infra-payment-gateway', 'infra-database-migration'],
  },
  {
    key: 'api-order-management-v2',
    name: 'Order Management v2',
    team: 'api',
    description: 'Redesigned order lifecycle API with real-time status webhooks',
    prerequisites: ['infra-database-migration'],
  },
  {
    key: 'api-inventory-realtime',
    name: 'Real-time Inventory API',
    team: 'api',
    description: 'WebSocket-based inventory availability with sub-second updates',
    prerequisites: ['infra-database-migration'],
  },
  {
    key: 'web-checkout-redesign',
    name: 'Checkout Redesign',
    team: 'web',
    description: 'Complete checkout page overhaul with streamlined 3-step flow',
    prerequisites: ['api-payment-service-v2', 'api-order-management-v2'],
  },
  {
    key: 'web-one-click-purchase',
    name: 'One-Click Purchase',
    team: 'web',
    description: 'Saved payment method one-click buy for returning customers',
    prerequisites: ['web-checkout-redesign', 'api-payment-service-v2'],
  },
  {
    key: 'mobile-checkout-flow',
    name: 'Mobile Checkout Flow',
    team: 'mobile',
    description: 'Native mobile checkout with gesture navigation and haptic feedback',
    prerequisites: ['api-payment-service-v2', 'api-order-management-v2'],
  },
  {
    key: 'mobile-apple-pay-v2',
    name: 'Apple Pay v2 Integration',
    team: 'mobile',
    description: 'Updated Apple Pay integration using new payment service with tokenization',
    prerequisites: ['mobile-checkout-flow', 'api-payment-service-v2'],
  },
  {
    key: 'data-event-tracking-v2',
    name: 'Event Tracking v2',
    team: 'data',
    description: 'New checkout funnel event schema with enriched attribution data',
    prerequisites: ['api-payment-service-v2', 'api-order-management-v2'],
  },
  {
    key: 'data-realtime-dashboard',
    name: 'Real-time Analytics Dashboard',
    team: 'data',
    description: 'Live revenue & conversion dashboard powered by streaming inventory data',
    prerequisites: ['data-event-tracking-v2', 'api-inventory-realtime'],
  },
  {
    key: 'release-checkout-v2',
    name: 'Checkout v2 — Full Release',
    team: 'all',
    description: 'Master gate: enables Unified Checkout 2.0 for all customers',
    prerequisites: [
      'web-checkout-redesign',
      'mobile-checkout-flow',
      'data-event-tracking-v2',
    ],
  },
];

const flagMap = {};
FLAG_DEFINITIONS.forEach((f) => { flagMap[f.key] = f; });

// ---------------------------------------------------------------------------
//  Simulation mode – in-memory flag state (used when no LD keys)
// ---------------------------------------------------------------------------

const simState = {};
FLAG_DEFINITIONS.forEach((f) => { simState[f.key] = false; });

function simPrereqsMet(key) {
  const flag = flagMap[key];
  if (!flag) return false;
  return flag.prerequisites.every((p) => simState[p] === true);
}

function simEffective(key) {
  if (!simState[key]) return false;
  return simPrereqsMet(key);
}

function simCascadeOff(key) {
  const off = [];
  FLAG_DEFINITIONS.forEach((f) => {
    if (f.prerequisites.includes(key) && simState[f.key]) {
      simState[f.key] = false;
      off.push(f.key);
      off.push(...simCascadeOff(f.key));
    }
  });
  return off;
}

// ---------------------------------------------------------------------------
//  LaunchDarkly live mode – SDK for evaluation, REST API for mutations
// ---------------------------------------------------------------------------

let ldClient = null;
let ldLiveMode = false;

const LD_SDK_KEY = process.env.LD_SDK_KEY;
const LD_API_KEY = process.env.LD_API_KEY;
const LD_PROJECT_KEY = process.env.LD_PROJECT_KEY || 'default';
const LD_ENVIRONMENT_KEY = process.env.LD_ENVIRONMENT_KEY || 'production';
const LD_BASE_URL = 'https://app.launchdarkly.com/api/v2';
const LD_CONTEXT = { kind: 'user', key: 'orchestration-demo', name: 'Orchestration Demo' };

// Local cache of targeting on/off state, synced with LD
const targetingState = {};
FLAG_DEFINITIONS.forEach((f) => { targetingState[f.key] = false; });

async function ldApiCall(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': LD_API_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    if (body._semanticPatch) {
      opts.headers['Content-Type'] = 'application/json; domain-model=launchdarkly.semanticpatch';
      delete body._semanticPatch;
    }
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${LD_BASE_URL}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function fetchTargetingStates() {
  try {
    const { ok, data } = await ldApiCall(
      'GET',
      `/flags/${LD_PROJECT_KEY}?tag=orchestration-demo&env=${LD_ENVIRONMENT_KEY}`
    );
    if (!ok || !data.items) return;
    for (const flag of data.items) {
      if (flag.key in targetingState) {
        targetingState[flag.key] = flag.environments?.[LD_ENVIRONMENT_KEY]?.on ?? false;
      }
    }
  } catch (err) {
    console.error('[warn] Failed to fetch targeting states:', err.message);
  }
}

async function ldToggleFlag(key, on) {
  const { ok, data } = await ldApiCall('PATCH', `/flags/${LD_PROJECT_KEY}/${key}`, {
    _semanticPatch: true,
    environmentKey: LD_ENVIRONMENT_KEY,
    instructions: [{ kind: on ? 'turnFlagOn' : 'turnFlagOff' }],
  });
  if (ok) {
    targetingState[key] = on;
  }
  return { ok, data };
}

async function ldEvaluate(key) {
  try {
    return await ldClient.variation(key, LD_CONTEXT, false);
  } catch {
    return false;
  }
}

async function ldPrereqsMet(key) {
  const flag = flagMap[key];
  if (!flag) return false;
  const results = await Promise.all(flag.prerequisites.map((p) => ldEvaluate(p)));
  return results.every(Boolean);
}

async function initLaunchDarkly() {
  if (!LD_SDK_KEY || !LD_API_KEY) {
    if (LD_SDK_KEY && !LD_API_KEY) {
      console.log('[info] LD_SDK_KEY found but no LD_API_KEY – running in simulation mode');
      console.log('       Add LD_API_KEY to enable bidirectional sync with LaunchDarkly');
    } else {
      console.log('[info] No LD keys found – running in simulation mode');
    }
    return;
  }

  try {
    const ld = await import('@launchdarkly/node-server-sdk');
    ldClient = ld.init(LD_SDK_KEY);
    await ldClient.waitForInitialization({ timeout: 10 });
    console.log('[ok] LaunchDarkly SDK initialized (streaming)');

    await fetchTargetingStates();
    console.log('[ok] Flag targeting states loaded from LD REST API');

    ldLiveMode = true;
    console.log('[ok] Live mode active — bidirectional sync with LaunchDarkly');

    setInterval(fetchTargetingStates, 10_000);
  } catch (err) {
    console.error('[warn] LaunchDarkly init failed – falling back to simulation mode:', err.message);
    ldClient = null;
    ldLiveMode = false;
  }
}

// ---------------------------------------------------------------------------
//  Unified accessors – route to sim or LD depending on mode
// ---------------------------------------------------------------------------

async function isEnabled(key) {
  return ldLiveMode ? targetingState[key] : simState[key];
}

async function isEffective(key) {
  if (ldLiveMode) return ldEvaluate(key);
  return simEffective(key);
}

async function arePrereqsMet(key) {
  if (ldLiveMode) return ldPrereqsMet(key);
  return simPrereqsMet(key);
}

async function getUnmetPrereqs(key) {
  const flag = flagMap[key];
  if (!flag) return [];
  const checks = await Promise.all(
    flag.prerequisites.map(async (p) => ({
      key: p,
      met: ldLiveMode ? await ldEvaluate(p) : simState[p],
    }))
  );
  return checks.filter((c) => !c.met).map((c) => flagMap[c.key]?.name || c.key);
}

// ---------------------------------------------------------------------------
//  API Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ mode: ldLiveMode ? 'live' : 'simulation' });
});

app.get('/api/teams', (_req, res) => {
  res.json(TEAMS);
});

app.get('/api/flags', async (_req, res) => {
  const flags = await Promise.all(
    FLAG_DEFINITIONS.map(async (f) => ({
      ...f,
      enabled: await isEnabled(f.key),
      effective: await isEffective(f.key),
      prerequisitesMet: await arePrereqsMet(f.key),
    }))
  );
  res.json(flags);
});

app.post('/api/flags/:key/toggle', async (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;

  if (!flagMap[key]) {
    return res.status(404).json({ error: 'Flag not found' });
  }

  if (ldLiveMode) {
    const { ok, data } = await ldToggleFlag(key, enabled);
    if (!ok) {
      return res.status(502).json({ error: 'LD API error', detail: data });
    }
    // Give the SDK stream a moment to propagate
    await new Promise((r) => setTimeout(r, 300));
    return res.json({
      key,
      enabled: targetingState[key],
      effective: await ldEvaluate(key),
      cascadedOff: [],
    });
  }

  // Simulation mode
  if (enabled && !simPrereqsMet(key)) {
    return res.status(400).json({
      error: 'Prerequisites not met',
      unmet: flagMap[key].prerequisites.filter((p) => !simState[p]),
    });
  }

  simState[key] = enabled;
  let cascaded = [];
  if (!enabled) {
    cascaded = simCascadeOff(key);
  }

  res.json({
    key,
    enabled: simState[key],
    effective: simEffective(key),
    cascadedOff: cascaded,
  });
});

app.post('/api/flags/reset', async (_req, res) => {
  if (ldLiveMode) {
    for (const f of FLAG_DEFINITIONS) {
      await ldToggleFlag(f.key, false);
      await new Promise((r) => setTimeout(r, 150));
    }
    await new Promise((r) => setTimeout(r, 500));
    return res.json({ message: 'All flags turned off in LD' });
  }

  FLAG_DEFINITIONS.forEach((f) => { simState[f.key] = false; });
  res.json({ message: 'All flags reset' });
});

app.post('/api/flags/enable-all', async (_req, res) => {
  const enabled = [];
  const visited = new Set();

  async function enableFlag(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const flag = flagMap[key];
    if (!flag) return;
    for (const p of flag.prerequisites) {
      await enableFlag(p);
    }
    if (ldLiveMode) {
      await ldToggleFlag(key, true);
      await new Promise((r) => setTimeout(r, 150));
    } else {
      simState[key] = true;
    }
    enabled.push(key);
  }

  for (const f of FLAG_DEFINITIONS) {
    await enableFlag(f.key);
  }

  if (ldLiveMode) {
    await new Promise((r) => setTimeout(r, 500));
  }

  res.json({ enabled });
});

app.get('/api/flags/scenario', (_req, res) => {
  function flagInfo(key) {
    const f = flagMap[key];
    const teamName = f.team === 'all' ? 'Master Release Gate'
      : TEAMS[f.team]?.name || f.team;
    const prereqNames = f.prerequisites.map((p) => flagMap[p]?.name || p);
    const prereqKeys = f.prerequisites;
    const dependents = FLAG_DEFINITIONS
      .filter((d) => d.prerequisites.includes(key))
      .map((d) => ({ key: d.key, name: d.name }));
    return { key, name: f.name, team: teamName, description: f.description,
             prereqNames, prereqKeys, dependents };
  }

  const scenario = [
    {
      type: 'narration',
      title: 'Teams begin independent work',
      message: 'All five teams have been developing features in parallel. Downstream teams attempt to enable their flags first, but LaunchDarkly prerequisite flags will gate them.',
    },
    {
      type: 'blocked',
      ...flagInfo('web-checkout-redesign'),
      message: 'Web Experience team finished their checkout redesign and attempts to enable it. Blocked — the API endpoints it depends on are not live yet.',
    },
    {
      type: 'blocked',
      ...flagInfo('mobile-checkout-flow'),
      message: 'Mobile Engineering has their new checkout flow ready. Blocked — same API dependencies are still missing.',
    },
    {
      type: 'blocked',
      ...flagInfo('data-event-tracking-v2'),
      message: 'Data team wants to start collecting v2 events. Blocked — the new API contracts are not available yet.',
    },
    {
      type: 'blocked',
      ...flagInfo('api-payment-service-v2'),
      message: 'Core API team tries to launch Payment Service v2. Blocked — infrastructure has not provisioned the payment gateway or run DB migrations yet.',
    },
    {
      type: 'narration',
      title: 'Infrastructure team delivers',
      message: 'The Platform Infrastructure team completes provisioning. These are foundational flags with no prerequisites, so they can enable immediately. This will unblock the API layer.',
    },
    {
      type: 'enable',
      ...flagInfo('infra-payment-gateway'),
      message: 'Payment gateway provisioned and validated. No prerequisites required.',
    },
    {
      type: 'enable',
      ...flagInfo('infra-database-migration'),
      message: 'Database schema v2 migration complete. This unblocks three API flags that were waiting on it.',
    },
    {
      type: 'enable',
      ...flagInfo('infra-cdn-optimization'),
      message: 'CDN edge caching rules deployed. No downstream dependencies were gated on this alone.',
    },
    {
      type: 'narration',
      title: 'API layer prerequisites satisfied',
      message: 'With infrastructure in place, the Core API team can now enable their services. Once the API layer is live, all three downstream teams (Web, Mobile, Data) that were blocked will be unblocked simultaneously.',
    },
    {
      type: 'enable',
      ...flagInfo('api-payment-service-v2'),
      message: 'Prerequisites met (Payment Gateway + DB Migration). Payment Service v2 goes live.',
    },
    {
      type: 'enable',
      ...flagInfo('api-order-management-v2'),
      message: 'DB Migration prerequisite was already met. Order Management v2 goes live.',
    },
    {
      type: 'enable',
      ...flagInfo('api-inventory-realtime'),
      message: 'DB Migration prerequisite was already met. Real-time Inventory API goes live.',
    },
    {
      type: 'narration',
      title: 'Gate opens — three teams unblock at once',
      message: 'The API layer is now fully live. All prerequisite conditions for Web, Mobile, and Data first-tier flags are now satisfied. LaunchDarkly allows all three to enable simultaneously — this is the power of prerequisite orchestration.',
    },
    {
      type: 'cascade',
      flags: [
        flagInfo('web-checkout-redesign'),
        flagInfo('mobile-checkout-flow'),
        flagInfo('data-event-tracking-v2'),
      ],
      message: 'Three flags from three different teams enable at once — their shared API prerequisites are now all satisfied.',
    },
    {
      type: 'narration',
      title: 'Second-order features unlock',
      message: 'With the first tier of team flags active, second-order features that depend on them can now proceed. Each team enables their remaining flags.',
    },
    {
      type: 'cascade',
      flags: [
        flagInfo('web-one-click-purchase'),
        flagInfo('mobile-apple-pay-v2'),
        flagInfo('data-realtime-dashboard'),
      ],
      message: 'All second-tier flags now have their prerequisites met. One-Click Purchase, Apple Pay v2, and the Real-time Dashboard all go live.',
    },
    {
      type: 'narration',
      title: 'All teams green — master gate opens',
      message: 'Every team has their flags enabled. The master release gate requires Web Checkout, Mobile Checkout, and Event Tracking — all active. The full Checkout v2 release can now ship.',
    },
    {
      type: 'enable',
      ...flagInfo('release-checkout-v2'),
      message: 'All three prerequisite flags are active. Checkout v2 is now live for all customers.',
    },
  ];

  res.json(scenario);
});

app.get('/api/graph', async (_req, res) => {
  const nodes = await Promise.all(
    FLAG_DEFINITIONS.map(async (f) => {
      const unmetPrereqs = await getUnmetPrereqs(f.key);
      return {
        id: f.key,
        name: f.name,
        team: f.team,
        description: f.description,
        enabled: await isEnabled(f.key),
        effective: await isEffective(f.key),
        prerequisitesMet: await arePrereqsMet(f.key),
        unmetPrereqs,
        teamColor: f.team === 'all' ? '#f472b6' : TEAMS[f.team]?.color || '#94a3b8',
      };
    })
  );

  const links = await Promise.all(
    FLAG_DEFINITIONS.flatMap((f) =>
      f.prerequisites.map(async (prereq) => ({
        source: prereq,
        target: f.key,
        met: ldLiveMode ? await ldEvaluate(prereq) : simState[prereq],
      }))
    )
  );

  res.json({ nodes, links, teams: TEAMS });
});

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------

await initLaunchDarkly();

app.listen(PORT, () => {
  const mode = ldLiveMode ? 'LIVE (synced with LaunchDarkly)' : 'SIMULATION (in-memory)';
  console.log(`\nOrchestration Demo running at http://localhost:${PORT}`);
  console.log(`  Mode:          ${mode}`);
  console.log(`  Dashboard:     http://localhost:${PORT}/`);
  console.log(`  Visualization: http://localhost:${PORT}/viz.html`);
  console.log(`  Demo App:      http://localhost:${PORT}/demo.html\n`);
});
