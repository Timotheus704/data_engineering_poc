# ADR 005 — Use Fastify + React + Vite + nginx for the web layer

**Status:** Accepted  
**Date:** Web app phase

---

## Context

The project needed a web interface layered on top of the existing Postgres database and TypeScript CLI. The choices were:

- What framework to use for the REST API
- What framework to use for the frontend
- How to serve the frontend in Docker

---

## Decision: Fastify for the API

**Chosen:** Fastify (TypeScript)  
**Alternatives considered:** Express.js, NestJS, Hono

### Why Fastify over Express

Express is the most widely used Node.js framework, but Fastify has several advantages for a typed, schema-first project:

- **Performance:** Fastify is consistently benchmarked as 2–3× faster than Express
- **Swagger integration:** `@fastify/swagger` generates OpenAPI docs from route definitions with minimal boilerplate — Express requires significantly more setup
- **Type safety:** Fastify's generic-based request typing (`fastify.get<{ Querystring: MyType }>`) integrates cleanly with TypeScript; Express types require more casting
- **Plugin system:** Fastify's plugin system with `fastify-plugin` handles lifecycle management cleanly

### Why not NestJS

NestJS is a full opinionated framework (controllers, decorators, dependency injection, modules). It is powerful but adds significant boilerplate and a steep learning curve for a PoC. Fastify gives the same functionality with far less ceremony.

---

## Decision: React + Vite for the frontend

**Chosen:** React 18 + Vite  
**Alternatives considered:** Next.js, Vue, Svelte, plain HTML

### Why React

React is the most widely adopted frontend framework. For a PoC intended to demonstrate skills and onboard other developers, React is the safest choice for familiarity. The component model (reusable `DataTable`, `Modal`, `StatCard`) maps naturally to the dashboard's needs.

### Why Vite over Create React App

Create React App (CRA) is officially deprecated. Vite is the current standard for new React projects:
- 10–100× faster dev server startup via native ES modules
- Fast hot module replacement (HMR) — changes appear in under 100ms
- Simple configuration — `vite.config.ts` is 15 lines vs CRA's hidden webpack config

### Why not Next.js

Next.js is excellent for server-rendered React apps but adds complexity (SSR, server components, file-based routing) that is unnecessary for a dashboard that talks to a separate API server. A plain React SPA with React Router is simpler and more transparent for learning purposes.

---

## Decision: nginx to serve the React app in Docker

**Chosen:** nginx:alpine  
**Alternatives considered:** serve (npm package), Node.js static server

### Why nginx

The React build produces static HTML, CSS, and JavaScript files. nginx serves static files extremely efficiently and adds two critical capabilities:

1. **Reverse proxy:** nginx forwards `/api/*` requests to the Fastify container, so the browser only talks to one origin — no CORS configuration needed in production
2. **SPA fallback:** `try_files $uri $uri/ /index.html` makes client-side routing work — refreshing `/titanic` returns the React app, not a 404

The nginx:alpine image is ~40MB — much smaller than running a Node.js process to serve static files.

### Why not a single container

Keeping the API and the static files in separate containers follows the single-responsibility principle and allows independent scaling and rebuilding. Changing a React component only triggers a rebuild of the client image, not the server image.

---

## Decision: inline styles for the React UI

**Chosen:** Inline styles with a consistent token set  
**Alternatives considered:** Tailwind CSS, CSS Modules, styled-components

### Why inline styles

For a PoC with a small component set, inline styles:
- Require zero build configuration
- Keep all styling co-located with the component
- Avoid class-name collisions
- Work without a CSS framework or preprocessor

A consistent set of design tokens (colors, border-radius, spacing) is defined by convention and applied consistently across all components. This produces a coherent dark-themed UI without a framework.

### Trade-offs

Inline styles do not support pseudo-selectors (`:hover`), media queries, or CSS animations without additional workarounds. For a larger project, Tailwind CSS or CSS Modules would be more maintainable. The inline approach is appropriate for the scale of this PoC.

---

## Summary

| Decision | Choice | Key reason |
|---|---|---|
| REST API framework | Fastify | Type safety + built-in Swagger + performance |
| Frontend framework | React 18 | Widest familiarity; component model fits the UI |
| Frontend build tool | Vite | Fastest dev server; CRA is deprecated |
| Docker serving | nginx:alpine | Tiny image; reverse proxy + SPA fallback in one |
| Styling | Inline styles | Zero config; PoC scale |
