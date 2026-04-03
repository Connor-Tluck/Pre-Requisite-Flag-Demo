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
  api: {
    name: 'Core API',
    color: '#f59e0b',
    abbr: 'API',
    description: 'Payment processing, order management, backend services',
  },
  web: {
    name: 'Web Experience',
    color: '#10b981',
    abbr: 'WEB',
    description: 'Checkout UI redesign, one-click purchase, responsive web',
  },
};

const FLAG_DEFINITIONS = [
  {
    key: 'api-payment-service-v2',
    name: 'Payment Service v2',
    team: 'api',
    description: 'New payment processing endpoints with multi-currency and 3DS2 support',
    prerequisites: [],
  },
  {
    key: 'api-order-management-v2',
    name: 'Order Management v2',
    team: 'api',
    description: 'Redesigned order lifecycle API with real-time status webhooks',
    prerequisites: [],
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
    prerequisites: ['web-checkout-redesign'],
  },
  {
    key: 'web-recommended-styles',
    name: 'Recommended Styles',
    team: 'web',
    description: 'Curated inspiration gallery showing styled outfits and product combinations',
    prerequisites: [],
  },
  {
    key: 'release-checkout-v2',
    name: 'Checkout v2 — Full Release',
    team: 'all',
    description: 'Master gate: enables Unified Checkout 2.0 for all customers',
    prerequisites: [
      'web-checkout-redesign',
      'web-one-click-purchase',
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

app.get('/api/ld-config', (_req, res) => {
  res.json({ clientSideId: process.env.LD_CLIENT_SIDE_ID || '' });
});

app.get('/api/flags', async (req, res) => {
  const userKey = req.query.userKey;
  const context = userKey
    ? { kind: 'user', key: userKey, ...(req.query.userName && { name: req.query.userName }),
        ...(req.query.plan && { plan: req.query.plan }),
        ...(req.query.country && { country: req.query.country }),
        ...(req.query.beta && { beta: req.query.beta === 'true' }),
        ...(req.query.role && { role: req.query.role }) }
    : null;

  const flags = await Promise.all(
    FLAG_DEFINITIONS.map(async (f) => {
      if (context && ldLiveMode && ldClient) {
        const eff = await ldClient.variation(f.key, context, false);
        return { ...f, enabled: await isEnabled(f.key), effective: eff, prerequisitesMet: await arePrereqsMet(f.key) };
      }
      return {
        ...f,
        enabled: await isEnabled(f.key),
        effective: await isEffective(f.key),
        prerequisitesMet: await arePrereqsMet(f.key),
      };
    })
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
    // ── Act 1: Sprint planning ───────────────────────────────────────
    {
      type: 'narration',
      title: 'Day 1 — Sprint planning for Checkout v2',
      message: 'Two teams are kicking off a 2-week sprint to ship Unified Checkout 2.0. The Core API team is building new payment and order management services, while the Web Experience team is redesigning the checkout flow and adding one-click purchasing. The Web team can\'t go live until the API endpoints they depend on are ready — LaunchDarkly prerequisite flags enforce this automatically.',
      ldInsight: 'Before any code is written, the prerequisite relationships are already configured in LaunchDarkly. This means PMs have a safety net from day one — no matter when someone toggles a flag, features won\'t reach users until every dependency in the chain is satisfied.',
    },

    // ── Act 2: Web team finishes early, tries to ship ────────────────
    {
      type: 'narration',
      title: 'Day 4 — Web team finishes ahead of schedule',
      message: 'The Web Experience team has been working fast. Their checkout redesign passes QA and their PM wants to push it live. But the API team is still mid-sprint — Payment Service v2 and Order Management v2 aren\'t deployed yet.',
      ldInsight: 'In a traditional release process, the Web PM would need to wait, check a spreadsheet, or ping the API team on Slack. With LaunchDarkly, they can just toggle the flag — the prerequisite gate handles the coordination.',
    },
    {
      type: 'blocked',
      ...flagInfo('web-checkout-redesign'),
      message: 'Day 4 — The Web PM merges the checkout redesign to production and toggles the flag on in LaunchDarkly. But the feature stays dark — it requires both Payment Service v2 and Order Management v2, and neither API endpoint is live yet. The PM doesn\'t need to worry; LaunchDarkly is holding it back safely.',
      ldInsight: 'The code is deployed and the flag is ON, but LaunchDarkly evaluates the prerequisite chain and returns false. Zero risk of a broken checkout reaching users — the new UI would call API endpoints that don\'t exist yet.',
    },
    {
      type: 'blocked',
      ...flagInfo('web-one-click-purchase'),
      message: 'Day 5 — One-Click Purchase also passes QA. The PM eagerly toggles it on too, but it\'s doubly blocked — it requires Checkout Redesign (which is itself blocked) to be active first. The entire chain is safely gated.',
      ldInsight: 'Prerequisite chains can be multiple levels deep. One-Click Purchase → Checkout Redesign → Payment Service v2 + Order Management v2. LaunchDarkly resolves this entire dependency graph automatically — no PM has to manually verify each layer.',
    },

    // ── Act 3: API team completes and ships ──────────────────────────
    {
      type: 'narration',
      title: 'Day 8 — Core API team completes development',
      message: 'End of week 1. The Core API team finishes both services and they pass integration testing. These are foundational flags with no prerequisites of their own, so the API PM can enable them immediately. The moment they go live, LaunchDarkly will re-evaluate every downstream flag in real time.',
      ldInsight: 'API flags sit at the bottom of the dependency graph. The moment they\'re enabled, LaunchDarkly re-evaluates the entire graph. Flags that were returning false may now return true — without anyone needing to notify the Web team or schedule a sync meeting.',
    },
    {
      type: 'enable',
      ...flagInfo('api-payment-service-v2'),
      message: 'Day 8 — Payment Service v2 goes live. No prerequisites — it activates immediately. The Checkout Redesign now has one of its two prerequisites satisfied, but Order Management v2 is still needed.',
    },
    {
      type: 'enable',
      ...flagInfo('api-order-management-v2'),
      message: 'Day 8 — Order Management v2 deployed and verified. This was the last prerequisite blocking the Checkout Redesign. The Web team\'s features are about to cascade live.',
    },

    // ── Act 4: Cascade — Web features auto-activate ──────────────────
    {
      type: 'narration',
      title: 'The cascade — Web Experience goes live instantly',
      message: 'Remember the Web PM who toggled both flags on days ago? Those features were safely held back by LaunchDarkly while the API team finished their work. Now that both API services are live, LaunchDarkly re-evaluates the downstream flags — and both Web features activate simultaneously, without the Web PM lifting a finger.',
      ldInsight: 'This is the moment that would have required a release coordination meeting, a shared spreadsheet, and a "go/no-go" call in a world without prerequisite flags. Instead, the Web PM toggled their flags days earlier and went back to building. LaunchDarkly orchestrated the release automatically.',
    },
    {
      type: 'cascade',
      flags: [
        flagInfo('web-checkout-redesign'),
        flagInfo('web-one-click-purchase'),
      ],
      message: 'Both Web features go live at once. Checkout Redesign activates because its API prerequisites are now met, and One-Click Purchase follows immediately because its own prerequisite — the redesign — just became active. The Web PM gets a notification but didn\'t have to do anything.',
    },

    // ── Act 5: Master release gate ───────────────────────────────────
    {
      type: 'narration',
      title: 'Day 10 — Release manager opens the gate',
      message: 'Both teams have shipped and every prerequisite in the chain is green. The master release gate — "Checkout v2 Full Release" — requires both Web features to be active. They are. The release manager can now flip the final switch, confident that LaunchDarkly has verified every technical dependency.',
      ldInsight: 'The master gate is a business-level decision, not a technical checklist. By the time a release manager can activate it, LaunchDarkly has already verified that all 4 upstream flags are live and healthy. Two teams, one sprint, zero coordination incidents.',
    },
    {
      type: 'enable',
      ...flagInfo('release-checkout-v2'),
      message: 'The release manager flips the final switch. Checkout v2 is now live for all customers. Two teams shipped 4 features across a 2-week sprint — each at their own pace — and LaunchDarkly prerequisite flags ensured nothing reached users until every dependency was ready.',
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
