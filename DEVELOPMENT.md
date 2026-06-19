# Development

## Local Development

Clone the repository, install dependencies, then run the development server:

```bash
npm install
npm run dev
```

Open the Vite URL printed by the command, usually `http://127.0.0.1:5173`.

You can also exercise the published CLI entrypoint from a repository checkout:

```bash
npm run build
npm run start
npm run collect:azure -- -SubscriptionIds "sub-id-1,sub-id-2"
npm run collect:entra -- -TenantId "<tenant-id>"
```

For a production build:

```bash
npm run build
```

## Configure Ownership Rules

Edit [src/core/config.ts](src/core/config.ts) to change ownership resolution defaults.

`ownerTags` is ordered by priority. The tag value is treated as the owner
identity and can be a group name, security group alias, or user email.

```ts
export const appConfig = {
  azure: {
    ownership: {
      ownerTags: [
        { name: "ownerGroup", confidence: "high" },
        { name: "costCenter", confidence: "high" },
        { name: "owner", confidence: "medium" }
      ]
    }
  }
};
```

## Test

```bash
npm test
```

Run only component tests:

```bash
npm run test:components
```

Track component-test coverage:

```bash
npm run test:components:coverage
```

The component coverage report is written to `coverage/components`. Jest also
enforces the current component coverage baseline so new UI changes do not
silently reduce coverage.

## Dependency Graph

Generate a folder-level dependency graph:

```bash
npm run deps:graph
```

The generated SVG is written to `output/dependency-folders.svg`.

Generate a file-level dependency graph:

```bash
npm run deps:graph:files
```

The generated SVG is written to `output/dependency-files.svg`.

## Project Structure

- `src/App.tsx` loads snapshot files and renders the report.
- `src/core/config.ts` contains ownership resolution configuration.
- `src/report` contains report UI, filtering, view helpers, and tests.
- `src/providers/azure` contains Azure and Entra domain models and ownership
  analysis logic.
- `powershell/OwnerLens` contains the PowerShell module and collector entrypoints for exporting local snapshot files.
- `tools` contains local development and test helper scripts.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local
development expectations.
