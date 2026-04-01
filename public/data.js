// Shared data and client-side state management for the Orchestration Demo.
// Replaces the Express API — all state lives in localStorage so it persists
// across page reloads and is shared between dashboard and visualization pages.

(function () {
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
      prerequisites: ['web-checkout-redesign', 'mobile-checkout-flow', 'data-event-tracking-v2'],
    },
  ];

  const STORAGE_KEY = 'ld-orchestration-flags';

  const flagMap = {};
  FLAG_DEFINITIONS.forEach(f => { flagMap[f.key] = f; });

  let flagState = {};

  function load() {
    FLAG_DEFINITIONS.forEach(f => { flagState[f.key] = false; });
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const k in parsed) {
          if (k in flagState) flagState[k] = parsed[k];
        }
      }
    } catch { /* ignore */ }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flagState));
  }

  load();

  // Re-sync when another tab changes state
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) load();
  });

  function prereqsMet(key) {
    const flag = flagMap[key];
    if (!flag) return false;
    return flag.prerequisites.every(p => flagState[p] === true);
  }

  function effective(key) {
    if (!flagState[key]) return false;
    return prereqsMet(key);
  }

  function cascadeOff(key) {
    const off = [];
    FLAG_DEFINITIONS.forEach(f => {
      if (f.prerequisites.includes(key) && flagState[f.key]) {
        flagState[f.key] = false;
        off.push(f.key);
        off.push(...cascadeOff(f.key));
      }
    });
    return off;
  }

  function flagInfo(key) {
    const f = flagMap[key];
    const teamName = f.team === 'all' ? 'Master Release Gate' : TEAMS[f.team]?.name || f.team;
    const prereqNames = f.prerequisites.map(p => flagMap[p]?.name || p);
    const prereqKeys = f.prerequisites;
    const dependents = FLAG_DEFINITIONS
      .filter(d => d.prerequisites.includes(key))
      .map(d => ({ key: d.key, name: d.name }));
    return { key, name: f.name, team: teamName, description: f.description,
             prereqNames, prereqKeys, dependents };
  }

  window.AppStore = {
    getTeams() {
      return TEAMS;
    },

    getFlags() {
      return FLAG_DEFINITIONS.map(f => ({
        ...f,
        enabled: flagState[f.key],
        effective: effective(f.key),
        prerequisitesMet: prereqsMet(f.key),
      }));
    },

    toggle(key, enabled) {
      if (!flagMap[key]) return { ok: false, error: 'Flag not found' };
      if (enabled && !prereqsMet(key)) {
        return {
          ok: false,
          error: 'Prerequisites not met',
          unmet: flagMap[key].prerequisites.filter(p => !flagState[p]),
        };
      }
      flagState[key] = enabled;
      let cascaded = [];
      if (!enabled) cascaded = cascadeOff(key);
      save();
      return { ok: true, key, enabled: flagState[key], effective: effective(key), cascadedOff: cascaded };
    },

    reset() {
      FLAG_DEFINITIONS.forEach(f => { flagState[f.key] = false; });
      save();
    },

    enableAll() {
      const enabled = [];
      const visited = new Set();
      function enableFlag(key) {
        if (visited.has(key)) return;
        visited.add(key);
        const flag = flagMap[key];
        if (!flag) return;
        flag.prerequisites.forEach(p => enableFlag(p));
        flagState[key] = true;
        enabled.push(key);
      }
      FLAG_DEFINITIONS.forEach(f => enableFlag(f.key));
      save();
      return enabled;
    },

    getGraph() {
      const nodes = FLAG_DEFINITIONS.map(f => {
        const unmetPrereqs = f.prerequisites
          .filter(p => !flagState[p])
          .map(p => flagMap[p]?.name || p);
        return {
          id: f.key,
          name: f.name,
          team: f.team,
          description: f.description,
          enabled: flagState[f.key],
          effective: effective(f.key),
          prerequisitesMet: prereqsMet(f.key),
          unmetPrereqs,
          teamColor: f.team === 'all' ? '#f472b6' : TEAMS[f.team]?.color || '#94a3b8',
        };
      });

      const links = [];
      FLAG_DEFINITIONS.forEach(f => {
        f.prerequisites.forEach(prereq => {
          links.push({ source: prereq, target: f.key, met: flagState[prereq] });
        });
      });

      return { nodes, links, teams: TEAMS };
    },

    getScenario() {
      return [
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
    },
  };
})();
