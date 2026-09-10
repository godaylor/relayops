# RelayOps documentation

This directory contains the RelayOps product and API documentation powered by Mintlify.

RelayOps is derived from the MIT-licensed Kaneo project and is not officially endorsed by Kaneo. Internal package names and compatibility identifiers may continue to use the upstream `kaneo` name.

## Monorepo setup

- Product: `RelayOps`
- Docs root for Mintlify: `/apps/docs`
- Main config: `apps/docs/docs.json`
- OpenAPI source file: `apps/docs/openapi.json`

## Local preview

Use the repository's existing Docker workflow for local validation. The Mintlify CLI commands below remain an upstream-compatible option for documentation-only work:

```bash
npm i -g mint
mint dev
```

Run the preview from this directory and open `http://localhost:3000`.

## Content structure

- `index.mdx`: documentation landing page
- `core/**`: product and deployment guides
- `api-reference/**`: overview and authentication pages
- API endpoints are generated from the local OpenAPI file configured in `docs.json`
