# LaunchDarkly Prerequisite Flag Orchestration Demo

An interactive dependency graph that visualizes how **LaunchDarkly prerequisite feature flags** coordinate multi-team software releases. Toggle flags on and off and watch dependencies cascade through the graph in real time.

![Dependency Graph](docs/images/dependency-graph.png)

---

## What This Demo Shows

Enterprise releases often span multiple teams and services. A frontend checkout redesign can't go live until the backend payment API is ready. A one-click purchase flow depends on the checkout redesign being stable. A master release gate shouldn't open until every component is verified.

**LaunchDarkly prerequisite flags** encode these dependency relationships directly into flag configuration:

- A flag **cannot evaluate to true** until all its prerequisites are met
- Disabling an upstream flag **automatically blocks** everything downstream
- Teams work independently while the system enforces release order
- A master release gate aggregates readiness across the entire feature surface

This demo makes that concept visual and interactive.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your LaunchDarkly credentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `LD_API_KEY` | Yes | REST API access token (starts with `api-`). Create at [Settings → Authorization](https://app.launchdarkly.com/settings/authorization) |
| `LD_PROJECT_KEY` | Yes | Your LaunchDarkly project key |
| `LD_ENVIRONMENT_KEY` | Yes | Target environment (e.g. `production`) |
| `LD_SDK_KEY` | For live mode | Server-side SDK key (starts with `sdk-`). Leave empty for simulation mode |
| `LD_CLIENT_SIDE_ID` | Optional | Client-side ID for browser SDK features (observability, session replay) |
| `PORT` | No | Server port (default: `3000`) |

### 3. Create flags in LaunchDarkly

Run the setup script to create all flags with prerequisite relationships:

```bash
npm run setup-flags
```

This creates 6 boolean flags in your project:

| Flag Key | Name | Team | Prerequisites |
|----------|------|------|---------------|
| `api-payment-service-v2` | Payment Service v2 | Core API | — |
| `api-order-management-v2` | Order Management v2 | Core API | — |
| `web-checkout-redesign` | Checkout Redesign | Web Experience | Payment Service v2, Order Management v2 |
| `web-one-click-purchase` | One-Click Purchase | Web Experience | Checkout Redesign |
| `web-recommended-styles` | Recommended Styles | Web Experience | — |
| `release-checkout-v2` | Checkout v2 — Full Release | Release Gate | Checkout Redesign, One-Click Purchase |

### 4. Start the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) — this loads the dependency graph.

**Simulation mode** (no LD keys): The app runs with an in-memory flag simulation that mirrors prerequisite behavior. No LaunchDarkly account needed.

**Live mode** (with `LD_SDK_KEY` + `LD_API_KEY`): Flags sync bidirectionally with LaunchDarkly. Toggle in the graph and see it reflected in the LD dashboard, or toggle in LD and see the graph update.

---

## The Dependency Graph

![Guided Rollout](docs/images/guided-rollout.png)

### Flag Cards

Each flag is rendered as a card showing:
- **Status**: ACTIVE (green), BLOCKED (amber), READY (blue), OFF (gray)
- **Team**: Color-coded team affiliation
- **Prerequisites**: Listed with met/unmet indicators
- **Dependents**: What downstream flags this flag gates

### Link Colors

| Color | Meaning |
|-------|---------|
| Green | Prerequisite is met — downstream path is unblocked |
| Orange | Prerequisite is not met — blocking the downstream flag |
| Red | Broken dependency — downstream is ON but upstream is OFF |

### Controls

- **Sidebar → Controls tab**: Toggle individual flags on/off
- **Click a node**: View details and toggle from the detail panel
- **Animate Rollout**: Step-by-step narrated walkthrough of the release sequence
- **Reset / Enable All**: Quick actions to reset or activate all flags

### Dependency Chain

```
api-payment-service-v2 ──────┐
                              ├──► web-checkout-redesign ──► web-one-click-purchase ──┐
api-order-management-v2 ──────┘                                                       ├──► release-checkout-v2
                                                          web-one-click-purchase ──────┘

web-recommended-styles (standalone)
```

---

## How Prerequisite Flags Work

In LaunchDarkly, a **prerequisite** is a flag that must be ON and serving a specific variation before a dependent flag can evaluate its own targeting rules. If the prerequisite isn't met, the dependent flag returns its off-variation.

![LaunchDarkly Prerequisites](docs/images/ld-prerequisites.png)

This demo mirrors that behavior:

1. Each flag tracks `enabled` (targeting ON) and `effective` (enabled AND all prerequisites met)
2. Toggling a flag ON is blocked if any prerequisite is still OFF
3. Toggling a flag OFF cascades — all downstream dependents are automatically blocked
4. The release gate only becomes effective when both checkout redesign and one-click purchase are active

---

## Code References (Optional)

To link flag keys in your codebase to the LaunchDarkly dashboard:

**GitHub Actions** (automatic on push):
1. In your GitHub repo, add these under Settings → Secrets and variables → Actions:
   - Secret: `LD_ACCESS_TOKEN` — your `LD_API_KEY` value
   - Variable: `LD_PROJECT_KEY` — your project key
2. Push to `main` — the workflow runs automatically

**Manual** (local):
```bash
brew tap launchdarkly/tap && brew install ld-find-code-refs
LD_ACCESS_TOKEN=api-xxxx ld-find-code-refs \
  --dir=. \
  --projKey=your-project-key \
  --repoName=Orchestration
```

---

## Project Structure

```
├── server.js              # Express server — API routes, LD SDK integration
├── setup-ld-flags.js      # Creates flags + prerequisites in LD via REST API
├── public/
│   ├── viz.html            # Dependency graph (main page)
│   ├── data.js             # Shared data layer (server or client-side)
│   ├── styles.css          # Shared navigation styles
│   ├── index.html          # Release dashboard (hidden)
│   ├── demo.html           # Technical demo page (hidden)
│   └── shop.html           # Mock storefront (hidden, flag-driven UI)
├── .env.example            # Environment variable template
├── .github/workflows/      # GitHub Actions for code references
└── .launchdarkly/          # Code references config
```

---

## Tech Stack

- **Node.js + Express** — API server with optional LaunchDarkly SDK
- **LaunchDarkly Node Server SDK** — server-side flag evaluation (streaming)
- **D3.js v7** — dependency graph visualization
- **Vanilla HTML/CSS/JS** — no framework dependencies
