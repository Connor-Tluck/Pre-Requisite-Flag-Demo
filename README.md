# LaunchDarkly Feature Flag Orchestration Demo

An interactive demo application that shows how **LaunchDarkly prerequisite feature flags** enable safe, coordinated multi-team software releases. Built for Solutions Engineers and Sales teams to walk customers through a real-world release orchestration scenario.

---

## Why This Demo Exists

Enterprise engineering organizations routinely ship features that span multiple teams, services, and deployment boundaries. A frontend checkout redesign can't go live until the backend payment API is ready. A one-click purchase flow depends on both the checkout redesign and payment processing being stable. A master release gate shouldn't open until every component is verified.

Without guardrails, these cross-team dependencies become coordination nightmares — Slack threads, spreadsheets, "are you done yet?" standups, and the occasional production incident when someone flips a flag too early.

**LaunchDarkly prerequisite flags solve this.** They encode dependency relationships directly into the flag configuration so that:

- A flag **cannot evaluate to true** until all its prerequisites are met
- Disabling an upstream flag **automatically blocks** everything downstream
- Teams work independently on their own flags while the system enforces the release order
- A master release gate aggregates readiness across the entire feature surface

This demo makes that abstract concept **tangible and visual** — customers can watch flags light up in dependency order, see what happens when an upstream flag is disabled, and interact with a real application whose UI changes in real time based on flag state.

### Why the LaunchDarkly UI alone is a weak demo

Prerequisite flags matter for safe, coordinated releases, but they are **hard to show convincingly if you stay inside the LaunchDarkly UI.** The flag details view explains *that* prerequisites exist and how they are wired, but it rarely carries the **release-orchestration story**: how teams can work **independently** while the platform still enforces order, what happens **downstream** when an upstream flag changes, and how those flags behave **together** across services and the product. Relying only on the UI can miss the real impact of a prerequisite-based rollout and undersell how LaunchDarkly helps teams ship without constant manual coordination. The sections below — dependency graph, guided rollout, and live storefront — are there so Solutions Engineers can tell that full story, not just walk through settings.

![Prerequisite flags in the LaunchDarkly UI](UI/UI_Updates/readme_images/Pre-Req%20Flag%20Launchdarkly%20UI.png)

*Example: prerequisite configuration for a single flag in the LaunchDarkly dashboard — accurate, but not the full orchestration narrative on its own.*

### How this demo tells the story (read in order)

Use [What You Can Show Customers](#what-you-can-show-customers) (**sections 1–3** below) as the live walkthrough; the bullets here summarize the narrative arc.

**1. Dependency graph — the orchestration story (`/viz.html`)**  
The interactive **flow-chart** view (**section 1** below) shows the whole release as a graph: every flag, team ownership, prerequisite edges, and **live** link status (green / orange / red). That is where you narrate **order**, **blocking**, and **downstream impact** in one place—what a one-flag-at-a-time LaunchDarkly screen cannot surface.

**2. Guided rollout — the sequence (`/viz.html` → Animate Rollout)**  
**Section 2** walks the enable order step by step so the audience sees prerequisite enforcement in motion (what must flip first, what stays blocked, and when the release gate can open).

**3. Client-side impact — proof the release landed (`/shop.html`)**  
The **VERDE+ storefront** (**section 3** below) is the end-user lens. Before orchestration is complete, the app reflects the **pre-release** experience; after the chain is fully effective—including the master release gate—the **post-orchestration** UI shows the new checkout, one-click purchase, promos, and other gated surfaces. That visual before/after is how you show that release orchestration **succeeded**, not only that flags were toggled. Still images under [UI screenshots](#ui-screenshots): original vs updated client UI.

---

## The Scenario: Unified Checkout 2.0

A modern e-commerce company (VERDE+) is shipping a major checkout overhaul. Two engineering teams must coordinate across six feature flags:

| Layer | Team | Flag | Description | Prerequisites |
|-------|------|------|-------------|---------------|
| **0 — Core API** | Core API | `api-payment-service-v2` | Multi-currency payment endpoints with 3DS2 support | — |
| **0 — Core API** | Core API | `api-order-management-v2` | Redesigned order lifecycle with real-time webhooks | — |
| **1 — Web** | Web Experience | `web-checkout-redesign` | Streamlined 3-step checkout flow | Payment Service v2, Order Management v2 |
| **1 — Web** | Web Experience | `web-one-click-purchase` | Saved payment one-click buy for returning customers | Checkout Redesign |
| **1 — Web** | Web Experience | `web-recommended-styles` | Curated inspiration gallery (targeted to beta segment) | — |
| **2 — Release Gate** | All | `release-checkout-v2` | Master gate for Unified Checkout 2.0 | Checkout Redesign, One-Click Purchase |

### Dependency Chain

```
api-payment-service-v2 ──────┐
                              ├──► web-checkout-redesign ──► web-one-click-purchase ──┐
api-order-management-v2 ──────┘                                                       ├──► release-checkout-v2
                                                          web-one-click-purchase ──────┘

web-recommended-styles (standalone, segment-targeted to beta users)
```

Each downstream flag has **LaunchDarkly prerequisites** pointing to its upstream dependencies. The system enforces that flags can only become effective when their prerequisites are satisfied.

---

## What You Can Show Customers

### 1. Prerequisite Flag Dependencies (Dependency Graph)

**Page:** `/viz.html`

The interactive D3.js graph visualizes every flag as a card with live status, team affiliation, and prerequisite/dependent lists. Connections between flags are color-coded:

| Link Color | Meaning |
|------------|---------|
| **Green** | Prerequisite is met — downstream flag is unblocked on this path |
| **Orange** | Prerequisite is not met — this dependency is blocking the downstream flag |
| **Red** | Broken state — downstream flag is ON but an upstream prerequisite is OFF |

**Key talking points:**
- "Here's the entire release dependency graph. Each card is a feature flag owned by a specific team."
- "Watch what happens when I enable the Payment Service flag — the green path flows downstream."
- "Now if I disable it, everything downstream is automatically blocked. No human coordination needed."

### 2. Guided Walkthrough (Animated Rollout)

**Page:** `/viz.html` → click "Animate Rollout"

A step-by-step narrated walkthrough that:
- Resets all flags to OFF
- Walks through the enable sequence in topological order
- Highlights each flag as it's enabled, with pan/zoom focus
- Shows blocking states when dependencies aren't met
- Includes LaunchDarkly-specific insight callouts explaining the platform value

**Key talking points:**
- "Let me walk you through the actual release sequence. Notice the system enforces the order."
- "The web team can't enable checkout redesign until both API flags are live — that's prerequisite enforcement."
- "The release gate only opens when every component is verified. No spreadsheets, no hoping."

### 3. Real Application Impact (Shop)

**Page:** `/shop.html`

A fully designed VERDE+ storefront that dynamically renders UI elements based on flag state:

| Flag | What Changes in the App |
|------|------------------------|
| `api-payment-service-v2` | Currency selector appears in navigation; 3DS2 badge and wallet buttons show in checkout |
| `api-order-management-v2` | Post-purchase confirmation upgrades from static text to animated order timeline |
| `web-checkout-redesign` | Single-page legacy checkout becomes a 3-step guided flow (Shipping → Payment → Review) |
| `web-one-click-purchase` | "BUY NOW" buttons appear on products; one-click purchase modal becomes available |
| `web-recommended-styles` | Curated style inspiration panel appears alongside the product grid |
| `release-checkout-v2` | Promo banner and "NEW" badges appear across the store |

**Key talking points:**
- "This is what the end user sees. Toggle flags on the dashboard and watch the store update in real time."
- "The checkout went from one page to three steps — that's a real UI change, not a mock."
- "Notice the recommended styles panel only appears for our beta tester. That's segment targeting."

### 4. User Context & Targeting

**Page:** `/shop.html` → Sign In button (top right)

Three user profiles demonstrate context-aware flag evaluation:

| User | Plan | Country | Beta | Segment |
|------|------|---------|------|---------|
| **Sarah Chen** | Premium | US | No | — |
| **Marcus Johnson** | Standard | GB | No | — |
| **Aisha Patel** | Standard | IN | Yes | Beta Users |

When signed in as Aisha, the `web-recommended-styles` flag evaluates to `true` (targeted via the Beta Users segment). Sarah and Marcus see the standard experience.

**Key talking points:**
- "Different users can see different features. Aisha is in our beta segment, so she gets the recommended styles panel."
- "I can switch users in real time and the app updates immediately. That's context-aware evaluation."

### 5. Observability, Session Replay & Code References

The shop page integrates LaunchDarkly's observability stack:

- **Session Replay** — every user session is recorded and viewable in the LD dashboard
- **Error Monitoring** — frontend errors are automatically captured and correlated with flag state
- **Web Vitals** — LCP, FCP, INP, CLS, TTFB metrics collected per context
- **Network Tracing** — request/response recording with headers
- **Custom Metrics** — `page-view`, `add-to-cart`, `checkout-started`, `order-placed`, `one-click-purchase`, `user-sign-in`
- **Code References** — every flag key in the codebase is linked back to LaunchDarkly (via `ld-find-code-refs` and GitHub Actions)

**Key talking points:**
- "We can see the session replay for Aisha's checkout flow, correlated with exactly which flags were on."
- "If there's an error, we know which flags were active for that user at that moment."
- "Code references show me exactly where each flag is used in the codebase — click through from the LD dashboard."

### 6. Release Dashboard

**Page:** `/` (index)

Team-organized cards with toggle switches, prerequisite badges, progress tracking, and an activity log. Includes staged rollout (enables flags in topological order) and cascade disable behavior.

---

## UI screenshots

Reference images for the visualization and storefront live in [`UI/UI_Updates/readme_images/`](UI/UI_Updates/readme_images/).

| What | Image (link) |
|------|----------------|
| Prerequisite flag in LaunchDarkly UI (single-flag view) | [Pre-Req Flag LaunchDarkly UI](UI/UI_Updates/readme_images/Pre-Req%20Flag%20Launchdarkly%20UI.png) |
| Prerequisite flag dependency graph (`/viz.html`) | [Pre-req flag viz view](UI/UI_Updates/readme_images/Pre-req_flag%20viz%20view.png) |
| Demo app (shop) — before release | [Demo app — original client UI](UI/UI_Updates/readme_images/Demo%20App%20Client%20Side%20-%20Original%20Version.png) |
| Demo app (shop) — after release | [Demo app — updated client UI](UI/UI_Updates/readme_images/Demo%20App%20Client%20Side%20-%20Updated%20Version.png) |

![Pre-req flag dependency graph](UI/UI_Updates/readme_images/Pre-req_flag%20viz%20view.png)

![VERDE+ shop — before release](UI/UI_Updates/readme_images/Demo%20App%20Client%20Side%20-%20Original%20Version.png)

![VERDE+ shop — after release](UI/UI_Updates/readme_images/Demo%20App%20Client%20Side%20-%20Updated%20Version.png)

---

## Quick Start

### Simulation Mode (no LD account needed)

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). The app runs with an in-memory flag simulation that mirrors LaunchDarkly prerequisite behavior.

### Live Mode (connected to LaunchDarkly)

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Fill in your `.env`:
   ```
   LD_API_KEY=api-xxxx          # REST API access token (for setup script + live sync)
   LD_PROJECT_KEY=default        # Your project key
   LD_ENVIRONMENT_KEY=production # Target environment
   LD_SDK_KEY=sdk-xxxx           # Server-side SDK key
   LD_CLIENT_SIDE_ID=xxxx        # Client-side ID (for shop observability)
   ```

3. Create all flags with prerequisites:
   ```bash
   npm run setup-flags
   ```

4. Start the server:
   ```bash
   npm start
   ```

The server syncs bidirectionally with LaunchDarkly — toggle flags in the LD dashboard or in the demo UI and both stay in sync.

### Code References

Code references update automatically on push to `main` via GitHub Actions. To set up:

1. Add `LD_ACCESS_TOKEN` (your `LD_API_KEY` value) as a repository secret in GitHub
2. Push to `main` — the workflow at `.github/workflows/ld-code-refs.yml` runs automatically

To run manually:
```bash
LD_ACCESS_TOKEN=api-xxxx ld-find-code-refs --dir=. --repoName="Orchestration"
```

---

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Release Dashboard — team cards, flag toggles, staged rollout, activity log |
| `/viz.html` | Dependency Graph — interactive D3.js visualization with animated rollout walkthrough |
| `/demo.html` | Technical Demo — mock checkout components showing flag-gated behavior |
| `/shop.html` | VERDE+ Storefront — realistic shopping app with flag-driven UI, user targeting, observability |

---

## How Prerequisite Flags Work

In LaunchDarkly, a **prerequisite** is a flag that must be ON and serving a specific variation before a dependent flag evaluates its own targeting rules. If the prerequisite isn't met, the dependent flag returns its off-variation regardless of its own targeting.

This demo mirrors that behavior:

1. Each flag tracks `enabled` (toggled on) and `effective` (enabled AND all prerequisites met)
2. Toggling a flag ON is blocked if any prerequisite is still OFF
3. Toggling a flag OFF **cascades** — all downstream dependents are automatically turned off
4. The master `release-checkout-v2` flag only becomes effective when checkout redesign and one-click purchase are both live

---

## Tech Stack

- **Node.js + Express** — API server with optional LaunchDarkly SDK integration
- **LaunchDarkly Node Server SDK** — server-side flag evaluation with streaming
- **LaunchDarkly JS Client SDK** — client-side evaluation, observability, and session replay
- **D3.js v7** — dependency graph visualization
- **Vanilla HTML/CSS/JS** — no framework overhead, easy to understand and modify
- **ld-find-code-refs** — automatic code reference scanning via CLI and GitHub Actions
