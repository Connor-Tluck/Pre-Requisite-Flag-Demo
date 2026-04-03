// Shared data and client-side state management for the Orchestration Demo.
// Replaces the Express API — all state lives in localStorage so it persists
// across page reloads and is shared between dashboard and visualization pages.

(function () {
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
      prerequisites: ['web-checkout-redesign', 'web-one-click-purchase'],
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

  window._AppStore = {
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
          title: 'Day 1 — Sprint planning for Checkout v2',
          message: 'Two teams are kicking off a 2-week sprint to ship Unified Checkout 2.0. The Core API team is building new payment and order management services, while the Web Experience team is redesigning the checkout flow and adding one-click purchasing. The Web team can\'t go live until the API endpoints they depend on are ready — LaunchDarkly prerequisite flags enforce this automatically.',
        },
        {
          type: 'narration',
          title: 'Day 4 — Web team finishes ahead of schedule',
          message: 'The Web Experience team has been working fast. Their checkout redesign passes QA and their PM wants to push it live. But the API team is still mid-sprint.',
        },
        {
          type: 'blocked',
          ...flagInfo('web-checkout-redesign'),
          message: 'The Web PM merges the checkout redesign to production and toggles the flag on. But the feature stays dark — it requires both Payment Service v2 and Order Management v2, and neither API endpoint is live yet.',
        },
        {
          type: 'blocked',
          ...flagInfo('web-one-click-purchase'),
          message: 'One-Click Purchase also passes QA. The PM toggles it on too, but it\'s doubly blocked — it requires Checkout Redesign (which is itself blocked) to be active first.',
        },
        {
          type: 'narration',
          title: 'Day 8 — Core API team completes development',
          message: 'End of week 1. The Core API team finishes both services and they pass integration testing. These are foundational flags with no prerequisites, so the API PM can enable them immediately.',
        },
        {
          type: 'enable',
          ...flagInfo('api-payment-service-v2'),
          message: 'Payment Service v2 goes live. No prerequisites — it activates immediately. The Checkout Redesign now has one of its two prerequisites satisfied.',
        },
        {
          type: 'enable',
          ...flagInfo('api-order-management-v2'),
          message: 'Order Management v2 deployed and verified. This was the last prerequisite blocking the Checkout Redesign.',
        },
        {
          type: 'narration',
          title: 'The cascade — Web Experience goes live',
          message: 'The Web PM toggled both flags on days ago. Now that both API services are live, LaunchDarkly re-evaluates the downstream flags — and both Web features activate simultaneously.',
        },
        {
          type: 'cascade',
          flags: [
            flagInfo('web-checkout-redesign'),
            flagInfo('web-one-click-purchase'),
          ],
          message: 'Both Web features go live at once. Checkout Redesign activates because its API prerequisites are met, and One-Click Purchase follows immediately because its own prerequisite just became active.',
        },
        {
          type: 'narration',
          title: 'Day 10 — Release manager opens the gate',
          message: 'Both teams have shipped and every prerequisite is green. The master release gate requires both Web features to be active. The release manager can flip the final switch with confidence.',
        },
        {
          type: 'enable',
          ...flagInfo('release-checkout-v2'),
          message: 'The release manager flips the final switch. Checkout v2 is now live for all customers.',
        },
      ];
    },
  };
  // Keep a public alias so pages can still reference AppStore for direct access
  window.AppStore = window._AppStore;

  // -------------------------------------------------------------------------
  //  DataLayer — auto-detects server (LD live mode) vs static (client-side)
  //
  //  Call DataLayer.init() on page load. All methods return Promises so the
  //  calling code doesn't need to care which backend is active.
  // -------------------------------------------------------------------------

  let _useServer = false;
  let _serverMode = 'simulation';

  const ServerAPI = {
    async getTeams() {
      return fetch('/api/teams').then(r => r.json());
    },
    async getFlags() {
      return fetch('/api/flags').then(r => r.json());
    },
    async toggle(key, enabled) {
      const res = await fetch(`/api/flags/${key}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      data.ok = res.ok;
      return data;
    },
    async reset() {
      await fetch('/api/flags/reset', { method: 'POST' });
    },
    async enableAll() {
      const res = await fetch('/api/flags/enable-all', { method: 'POST' });
      return res.json();
    },
    async getGraph() {
      return fetch('/api/graph').then(r => r.json());
    },
    async getScenario() {
      return fetch('/api/flags/scenario').then(r => r.json());
    },
  };

  const ClientAPI = {
    async getTeams()    { return window._AppStore.getTeams(); },
    async getFlags()    { return window._AppStore.getFlags(); },
    async toggle(k, e)  { return window._AppStore.toggle(k, e); },
    async reset()       { return window._AppStore.reset(); },
    async enableAll()   { return window._AppStore.enableAll(); },
    async getGraph()    { return window._AppStore.getGraph(); },
    async getScenario() { return window._AppStore.getScenario(); },
  };

  window.DataLayer = {
    get useServer() { return _useServer; },
    get mode() { return _useServer ? _serverMode : 'client'; },

    async init() {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const info = await res.json();
          _useServer = true;
          _serverMode = info.mode || 'simulation';
          console.log(`[DataLayer] Server detected — mode: ${_serverMode}`);
          return;
        }
      } catch { /* server not reachable */ }
      _useServer = false;
      console.log('[DataLayer] No server — using client-side AppStore');
    },

    async getTeams()       { return (_useServer ? ServerAPI : ClientAPI).getTeams(); },
    async getFlags()       { return (_useServer ? ServerAPI : ClientAPI).getFlags(); },
    async toggle(key, en)  { return (_useServer ? ServerAPI : ClientAPI).toggle(key, en); },
    async reset()          { return (_useServer ? ServerAPI : ClientAPI).reset(); },
    async enableAll()      { return (_useServer ? ServerAPI : ClientAPI).enableAll(); },
    async getGraph()       { return (_useServer ? ServerAPI : ClientAPI).getGraph(); },
    async getScenario()    { return (_useServer ? ServerAPI : ClientAPI).getScenario(); },
  };
})();
