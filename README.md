# LaunchDarkly Feature Flag Orchestration Demo

A demo application showing how to coordinate multi-team software releases using **LaunchDarkly prerequisite feature flags**. Five engineering teams independently develop features for a "Unified Checkout 2.0" release, with flags wired together via prerequisites so nothing ships until its dependencies are ready.

## The Scenario

A major e-commerce company is shipping a checkout overhaul. Five teams must coordinate:

| Team | Flags | What They Own |
|------|-------|---------------|
| **Platform Infrastructure** | 3 | Payment gateway, DB migrations, CDN edge caching |
| **Core API** | 3 | Payment service v2, order management, real-time inventory |
| **Web Experience** | 2 | Checkout redesign, one-click purchase |
| **Mobile Engineering** | 2 | Mobile checkout flow, Apple Pay v2 |
| **Data & Analytics** | 2 | Event tracking v2, real-time analytics dashboard |

Plus a **master release gate** flag that depends on web, mobile, and data readiness.

### Dependency Chain

```
Infrastructure ──► Core API ──► Web Experience ──┐
                            ──► Mobile Engineering ├──► 🚀 Release Gate
                            ──► Data & Analytics ──┘
```

Each downstream flag has **LaunchDarkly prerequisites** pointing to its upstream dependencies. If you try to enable a flag before its prerequisites are met, the system blocks it — just like LD's prerequisite flag feature does in production.

## Quick Start

```bash
# Install dependencies
npm install

# Run the server (simulation mode — no LD account needed)
npm start
```

Open [http://localhost:3000](http://localhost:3000) for the **Release Dashboard** and [http://localhost:3000/viz.html](http://localhost:3000/viz.html) for the **Dependency Graph**.

## Connecting to LaunchDarkly

To use a real LaunchDarkly project instead of the built-in simulation:

1. Copy the env example:
   ```bash
   cp .env.example .env
   ```

2. Add your **server-side SDK key** to `.env`:
   ```
   LD_SDK_KEY=sdk-your-key-here
   ```

3. Create the following flags in your LD project (all boolean, default `false`):

   | Flag Key | Prerequisites |
   |----------|---------------|
   | `infra-payment-gateway` | — |
   | `infra-database-migration` | — |
   | `infra-cdn-optimization` | — |
   | `api-payment-service-v2` | `infra-payment-gateway` = true, `infra-database-migration` = true |
   | `api-order-management-v2` | `infra-database-migration` = true |
   | `api-inventory-realtime` | `infra-database-migration` = true |
   | `web-checkout-redesign` | `api-payment-service-v2` = true, `api-order-management-v2` = true |
   | `web-one-click-purchase` | `web-checkout-redesign` = true, `api-payment-service-v2` = true |
   | `mobile-checkout-flow` | `api-payment-service-v2` = true, `api-order-management-v2` = true |
   | `mobile-apple-pay-v2` | `mobile-checkout-flow` = true, `api-payment-service-v2` = true |
   | `data-event-tracking-v2` | `api-payment-service-v2` = true, `api-order-management-v2` = true |
   | `data-realtime-dashboard` | `data-event-tracking-v2` = true, `api-inventory-realtime` = true |
   | `release-checkout-v2` | `web-checkout-redesign` = true, `mobile-checkout-flow` = true, `data-event-tracking-v2` = true |

4. Restart the server. It will use the LD SDK for flag evaluation while still managing toggle state locally.

## Pages

### Release Dashboard (`/`)
- Team cards with per-flag toggle switches
- Prerequisite badges (green ✓ / red ✗) on every flag
- Overall release progress bar
- **Staged Rollout** button: enables flags one-by-one in topological order with a delay
- **Activity Log** tracking every toggle, cascade, and block event
- Toast notifications for cascading disables

### Dependency Graph (`/viz.html`)
- Interactive D3.js directed acyclic graph
- Nodes colored by team, sized uniformly, with status icons
- Animated particles flow along met prerequisite edges
- Click any node to inspect its prerequisites and dependents
- Sidebar legend, controls, and node detail panel
- **Animate Rollout** steps through the enable sequence with node flash effects
- Zoom & pan support

## How Prerequisite Flags Work

In LaunchDarkly, a **prerequisite** is a flag that must be `On` and serving a specific variation before a dependent flag evaluates its own targeting rules. If the prerequisite isn't met, the dependent flag returns its off-variation regardless of its own targeting.

This demo mirrors that behavior:

1. Each flag tracks `enabled` (toggled on) and `effective` (enabled AND all prerequisites met).
2. Toggling a flag ON is blocked if any prerequisite is still OFF.
3. Toggling a flag OFF **cascades**: all downstream dependents are automatically turned off too.
4. The master `release-checkout-v2` flag only becomes effective when web, mobile, and data flags are all live.

## Tech Stack

- **Node.js** + **Express** — API server
- **LaunchDarkly Node Server SDK** — optional real flag evaluation
- **D3.js v7** — dependency graph visualization
- **Vanilla HTML/CSS/JS** — no framework overhead
