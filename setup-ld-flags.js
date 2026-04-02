#!/usr/bin/env node

// ---------------------------------------------------------------------------
//  LaunchDarkly Flag Setup Script
//
//  Creates all 5 feature flags for the Orchestration Demo in your
//  LaunchDarkly project, complete with names, descriptions, tags, and
//  prerequisite relationships.
//
//  Usage:
//    LD_API_KEY=api-xxxx LD_PROJECT_KEY=default LD_ENVIRONMENT_KEY=production node setup-ld-flags.js
//
//  Or add them to your .env file and run:
//    node setup-ld-flags.js
//
//  Required env vars:
//    LD_API_KEY          – REST API access token (starts with api-)
//    LD_PROJECT_KEY      – Your LaunchDarkly project key (default: "default")
//    LD_ENVIRONMENT_KEY  – Environment to configure prerequisites in (default: "production")
// ---------------------------------------------------------------------------

import dotenv from 'dotenv';
dotenv.config();

const LD_API_KEY = process.env.LD_API_KEY;
const LD_PROJECT_KEY = process.env.LD_PROJECT_KEY || 'default';
const LD_ENVIRONMENT_KEY = process.env.LD_ENVIRONMENT_KEY || 'production';
const BASE_URL = 'https://app.launchdarkly.com/api/v2';

if (!LD_API_KEY) {
  console.error('\n  Missing LD_API_KEY. Set it in your .env or as an environment variable.');
  console.error('  This must be a REST API access token (starts with api-), not an SDK key.\n');
  console.error('  Create one at: https://app.launchdarkly.com/settings/authorization\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
//  Flag Definitions (mirrors data.js / server.js)
// ---------------------------------------------------------------------------

const FLAGS = [
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
    key: 'release-checkout-v2',
    name: 'Checkout v2 — Full Release',
    team: 'release-gate',
    description: 'Master gate: enables Unified Checkout 2.0 for all customers',
    prerequisites: ['web-checkout-redesign', 'web-one-click-purchase'],
  },
];

// ---------------------------------------------------------------------------
//  API Helpers
// ---------------------------------------------------------------------------

const headers = {
  'Authorization': LD_API_KEY,
  'Content-Type': 'application/json',
};

async function apiCall(method, path, body) {
  const opts = { method, headers: { ...headers } };
  if (body) {
    if (body._semanticPatch) {
      opts.headers['Content-Type'] = 'application/json; domain-model=launchdarkly.semanticpatch';
      delete body._semanticPatch;
    }
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
//  Step 1: Create Flags
// ---------------------------------------------------------------------------

async function createFlags() {
  console.log('\n--- Step 1: Creating feature flags ---\n');

  const variationIdMap = {};

  const TEAM_TAGS = {
    'api':          'team-core-api',
    'web':          'team-web-experience',
    'release-gate': 'team-release-gate',
  };

  for (const flag of FLAGS) {
    const tags = ['orchestration-demo', TEAM_TAGS[flag.team] || flag.team];

    const { status, ok, data } = await apiCall('POST', `/flags/${LD_PROJECT_KEY}`, {
      key: flag.key,
      name: flag.name,
      description: flag.description,
      tags,
      variations: [
        { value: true, name: 'Enabled' },
        { value: false, name: 'Disabled' },
      ],
      defaults: {
        onVariation: 0,
        offVariation: 1,
      },
      temporary: false,
    });

    if (status === 409) {
      console.log(`  [exists]  ${flag.key}`);
      const existing = await apiCall('GET', `/flags/${LD_PROJECT_KEY}/${flag.key}`);
      if (existing.ok) {
        const trueVar = existing.data.variations?.find(v => v.value === true);
        variationIdMap[flag.key] = trueVar?._id;
      }
    } else if (ok) {
      console.log(`  [created] ${flag.key}`);
      const trueVar = data.variations?.find(v => v.value === true);
      variationIdMap[flag.key] = trueVar?._id;
    } else {
      console.error(`  [ERROR]   ${flag.key}: ${status} — ${JSON.stringify(data)}`);
    }

    await sleep(200);
  }

  return variationIdMap;
}

// ---------------------------------------------------------------------------
//  Step 2: Configure Prerequisites
// ---------------------------------------------------------------------------

async function configurePrerequisites(variationIdMap) {
  console.log('\n--- Step 2: Configuring prerequisites ---\n');

  const flagsWithPrereqs = FLAGS.filter(f => f.prerequisites.length > 0);

  for (const flag of flagsWithPrereqs) {
    const missingIds = flag.prerequisites.filter(p => !variationIdMap[p]);
    if (missingIds.length) {
      console.error(`  [SKIP]    ${flag.key} — missing variation IDs for: ${missingIds.join(', ')}`);
      continue;
    }

    const instructions = flag.prerequisites.map(prereqKey => ({
      kind: 'addPrerequisite',
      key: prereqKey,
      variationId: variationIdMap[prereqKey],
    }));

    const { status, ok, data } = await apiCall('PATCH', `/flags/${LD_PROJECT_KEY}/${flag.key}`, {
      _semanticPatch: true,
      environmentKey: LD_ENVIRONMENT_KEY,
      comment: `Setup prerequisite flags for orchestration demo`,
      instructions,
    });

    if (ok) {
      const prereqNames = flag.prerequisites.join(', ');
      console.log(`  [ok]      ${flag.key}  <--  ${prereqNames}`);
    } else if (status === 409 || (data?.message && data.message.includes('already'))) {
      console.log(`  [exists]  ${flag.key} — prerequisites already configured`);
    } else {
      console.error(`  [ERROR]   ${flag.key}: ${status} — ${JSON.stringify(data)}`);
    }

    await sleep(200);
  }
}

// ---------------------------------------------------------------------------
//  Step 3: Turn all flags OFF (clean starting state)
// ---------------------------------------------------------------------------

async function turnAllFlagsOff() {
  console.log('\n--- Step 3: Setting all flags to OFF (clean demo state) ---\n');

  for (const flag of FLAGS) {
    const { ok } = await apiCall('PATCH', `/flags/${LD_PROJECT_KEY}/${flag.key}`, {
      _semanticPatch: true,
      environmentKey: LD_ENVIRONMENT_KEY,
      instructions: [{ kind: 'turnFlagOff' }],
    });

    if (ok) {
      console.log(`  [off]     ${flag.key}`);
    } else {
      console.log(`  [skip]    ${flag.key} — may already be off`);
    }

    await sleep(100);
  }
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log('  LaunchDarkly Orchestration Demo — Flag Setup');
  console.log('='.repeat(60));
  console.log(`\n  Project:     ${LD_PROJECT_KEY}`);
  console.log(`  Environment: ${LD_ENVIRONMENT_KEY}`);
  console.log(`  Flags:       ${FLAGS.length}`);

  const variationIdMap = await createFlags();
  await configurePrerequisites(variationIdMap);
  await turnAllFlagsOff();

  console.log('\n' + '='.repeat(60));
  console.log('  Setup complete!');
  console.log('='.repeat(60));
  console.log(`
  All ${FLAGS.length} flags have been created in your "${LD_PROJECT_KEY}" project
  with prerequisite relationships configured for the "${LD_ENVIRONMENT_KEY}" environment.

  Next steps:
    1. Copy your SDK key from the LaunchDarkly dashboard
    2. Add it to your .env file:  LD_SDK_KEY=sdk-xxxx
    3. Run the app:  node server.js
       (or deploy to Vercel as a static site — no SDK key needed)

  Flag hierarchy:
    Layer 0 (Core API):       api-payment-service-v2, api-order-management-v2
    Layer 1 (Web Experience): web-checkout-redesign, web-one-click-purchase
    Layer 2 (Release Gate):   release-checkout-v2
`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
