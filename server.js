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

// Each flag: key, name, team, description, prerequisites (array of flag keys)
const FLAG_DEFINITIONS = [
  // ── Infrastructure (no prerequisites – foundational layer) ──────────────
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

  // ── Core API (depends on infrastructure) ────────────────────────────────
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

  // ── Web Experience (depends on API) ─────────────────────────────────────
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

  // ── Mobile Engineering (depends on API) ─────────────────────────────────
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

  // ── Data & Analytics (depends on API) ───────────────────────────────────
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

  // ── Master Release Gate ─────────────────────────────────────────────────
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

// ---------------------------------------------------------------------------
//  In-memory flag state (simulation mode)
// ---------------------------------------------------------------------------

const flagState = {};
FLAG_DEFINITIONS.forEach((f) => {
  flagState[f.key] = false;
});

// Build a lookup map for quick access
const flagMap = {};
FLAG_DEFINITIONS.forEach((f) => {
  flagMap[f.key] = f;
});

function prerequisitesMet(flagKey) {
  const flag = flagMap[flagKey];
  if (!flag) return false;
  return flag.prerequisites.every((prereq) => flagState[prereq] === true);
}

function getEffectiveState(flagKey) {
  if (!flagState[flagKey]) return false;
  return prerequisitesMet(flagKey);
}

// When a flag is turned off, cascade: turn off all dependents
function cascadeOff(flagKey) {
  const turned_off = [];
  FLAG_DEFINITIONS.forEach((f) => {
    if (f.prerequisites.includes(flagKey) && flagState[f.key]) {
      flagState[f.key] = false;
      turned_off.push(f.key);
      turned_off.push(...cascadeOff(f.key));
    }
  });
  return turned_off;
}

// ---------------------------------------------------------------------------
//  LaunchDarkly SDK integration (optional – uses simulation if no key)
// ---------------------------------------------------------------------------

let ldClient = null;
const LD_SDK_KEY = process.env.LD_SDK_KEY;

async function initLaunchDarkly() {
  if (!LD_SDK_KEY) {
    console.log('[info] No LD_SDK_KEY found – running in simulation mode');
    return;
  }

  try {
    const ld = await import('@launchdarkly/node-server-sdk');
    ldClient = ld.init(LD_SDK_KEY);
    await ldClient.waitForInitialization({ timeout: 10 });
    console.log('[ok] LaunchDarkly SDK initialized');
  } catch (err) {
    console.error('[warn] LaunchDarkly init failed – falling back to simulation mode:', err.message);
    ldClient = null;
  }
}

const LD_CONTEXT = { kind: 'user', key: 'orchestration-demo', name: 'Orchestration Demo' };

async function evaluateFlag(flagKey) {
  if (ldClient) {
    try {
      return await ldClient.variation(flagKey, LD_CONTEXT, false);
    } catch {
      return getEffectiveState(flagKey);
    }
  }
  return getEffectiveState(flagKey);
}

// ---------------------------------------------------------------------------
//  API Routes
// ---------------------------------------------------------------------------

app.get('/api/teams', (_req, res) => {
  res.json(TEAMS);
});

app.get('/api/flags', async (_req, res) => {
  const flags = await Promise.all(
    FLAG_DEFINITIONS.map(async (f) => ({
      ...f,
      enabled: flagState[f.key],
      effective: await evaluateFlag(f.key),
      prerequisitesMet: prerequisitesMet(f.key),
    }))
  );
  res.json(flags);
});

app.post('/api/flags/:key/toggle', (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;

  if (!flagMap[key]) {
    return res.status(404).json({ error: 'Flag not found' });
  }

  if (enabled && !prerequisitesMet(key)) {
    return res.status(400).json({
      error: 'Prerequisites not met',
      unmet: flagMap[key].prerequisites.filter((p) => !flagState[p]),
    });
  }

  flagState[key] = enabled;

  let cascaded = [];
  if (!enabled) {
    cascaded = cascadeOff(key);
  }

  res.json({
    key,
    enabled: flagState[key],
    effective: getEffectiveState(key),
    cascadedOff: cascaded,
  });
});

app.post('/api/flags/reset', (_req, res) => {
  FLAG_DEFINITIONS.forEach((f) => {
    flagState[f.key] = false;
  });
  res.json({ message: 'All flags reset' });
});

app.post('/api/flags/enable-all', (_req, res) => {
  // Enable in topological order (respect prerequisites)
  const enabled = [];
  const visited = new Set();

  function enableFlag(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const flag = flagMap[key];
    if (!flag) return;
    flag.prerequisites.forEach((p) => enableFlag(p));
    flagState[key] = true;
    enabled.push(key);
  }

  FLAG_DEFINITIONS.forEach((f) => enableFlag(f.key));
  res.json({ enabled });
});

// Scripted rollout scenario that demonstrates prerequisite gating behavior.
// Teams work independently and at different paces — flags block until their
// prerequisites are satisfied, then cascade-unlock in bursts.
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
    // ── Act 1: Downstream teams try to ship — but they're gated ──────
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

    // ── Act 2: Infrastructure completes foundational work ────────────
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

    // ── Act 3: API gates open — enable API flags ─────────────────────
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

    // ── Act 4: Gate opens — cascade unlock for Web, Mobile, Data ─────
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

    // ── Act 5: Second-order features unlock ──────────────────────────
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

    // ── Act 6: Master release gate ───────────────────────────────────
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

app.get('/api/graph', (_req, res) => {
  const nodes = FLAG_DEFINITIONS.map((f) => {
    const unmetPrereqs = f.prerequisites
      .filter((p) => !flagState[p])
      .map((p) => flagMap[p]?.name || p);
    return {
      id: f.key,
      name: f.name,
      team: f.team,
      description: f.description,
      enabled: flagState[f.key],
      effective: getEffectiveState(f.key),
      prerequisitesMet: prerequisitesMet(f.key),
      unmetPrereqs,
      teamColor: f.team === 'all' ? '#f472b6' : TEAMS[f.team]?.color || '#94a3b8',
    };
  });

  const links = [];
  FLAG_DEFINITIONS.forEach((f) => {
    f.prerequisites.forEach((prereq) => {
      links.push({
        source: prereq,
        target: f.key,
        met: flagState[prereq],
      });
    });
  });

  res.json({ nodes, links, teams: TEAMS });
});

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------

await initLaunchDarkly();

app.listen(PORT, () => {
  console.log(`\nOrchestration Demo running at http://localhost:${PORT}`);
  console.log(`  Dashboard:     http://localhost:${PORT}/`);
  console.log(`  Visualization: http://localhost:${PORT}/viz.html\n`);
});
