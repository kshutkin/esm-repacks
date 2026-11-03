# Repository maintenance

## Dependency updates

Renovate retains `config:recommended` and applies these exceptions:

| Dependencies | Purpose | Automatic updates |
| --- | --- | --- |
| `dayjs` | Upstream source for the repack | Ignored by Renovate; the daily release workflow handles updates and records the upstream Changeset. |
| `@changesets/**` | Versioning and publication | Security fixes only. Upgrade deliberately and verify versioning and publication integration. |
| `vitest`, `@vitest/**` | Package and packed-consumer tests | Security fixes only. Keep the runner and any future coverage provider compatible. |
| `pkgprn` | Publish-time package flattening | Normal recommended updates, including releases outside the current range. |
| `ts-morph` | JavaScript and declaration transforms | Normal recommended updates; compare generated output before accepting an upgrade. |
| `typescript` | Public consumer type checks | Normal recommended updates. |

Other dependencies and GitHub Actions inherit recommended behavior. Automerge is
not enabled. There are no comparison-only dependencies, direct Node declaration
dependencies, or `dts-buddy` rules to configure here.

Security fixes use Renovate's `vulnerabilityAlerts` mechanism, which can override
ordinary update restrictions. GitHub Dependency graph and Dependabot alerts must
be enabled, and Renovate must have access to the alerts. These are external
prerequisites; this configuration does not enable them or experimental OSV
scanning.

Validate policy changes with Renovate's own validator on a supported Node runtime:

```sh
pnpm --allow-build=re2 --package=renovate@44.210.0 dlx renovate-config-validator --strict --no-global renovate.json
git diff --check
```

## Tool and release validation

The release workflow uses Node 24 and pnpm 10. The current packaging tool requires
Node `^22.22.2 || ^24.15.0 || >=26.0.0`; use a compatible stable runtime for local
builds and tests. Tool requirements do not establish a consumer Node support range
or require adding `@types/node` to the published package.

After tool upgrades, run the build, `pnpm test`, and both `typecheck` and
`typecheck:node16` in `packages/test-dayjs`. Compare all generated declarations,
maps when present, JavaScript, and final tarball contents with the previous tools.
Pack in a disposable copy: `prepack` flattens the package in place. Verify the
tarball in a separate consumer, including native Node imports and public types.

Changesets CLI 3 is used directly by the custom release workflow; this repository
does not call the shared pipeline or Changesets action. The publish wrapper
inherits its environment, including `CHANGESETS_OUTPUT`. See
[release automation](automation.md) for publication and tag recovery. npm
publication, pushing Git tags, and creating GitHub releases are separate outcomes;
the current workflow does not create GitHub releases.

Tooling-only changes with identical published contents need no package Changeset.
Do not add an empty Changeset just to satisfy a status check.

## Coverage

There is no coverage provider, uploaded coverage artifact, or coverage branch in
the current repository. Add coverage badges only after a pipeline produces them
and their real URLs have been verified.
