# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Local Production Memory

Scripty keeps local server and ClickHouse credentials in a gitignored `.env` file. Copy the safe template, replace only its placeholders, then run these in separate terminals:

```bash
cp .env.example .env
npm run mcp:local
npm run server:local
npm run dev
```

`mcp:local` expects the official `mcp-clickhouse` checkout and its `.venv` at `./mcp-clickhouse`. It defaults FastMCP to JSON responses so short-lived Production Assistant MCP calls do not open an SSE stream. The template binds unauthenticated MCP only to `127.0.0.1` for local development. Production continues to use its process environment and should configure MCP authentication rather than setting `CLICKHOUSE_MCP_AUTH_DISABLED=true`.
