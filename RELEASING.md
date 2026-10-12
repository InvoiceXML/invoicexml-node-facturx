# Releasing

Versions are published to npm by `.github/workflows/release.yml` when a `v*` tag is pushed. It uses npm trusted publishing, so no npm token is stored in GitHub.

## Every release

1. Bump `version` in `package.json` and `src/version.ts` (a test keeps them in sync).
2. Commit, then tag and push: `git tag v1.0.1 && git push origin main v1.0.1`.
3. The workflow checks that the tag matches `package.json`, runs the type check, tests, build and smoke tests, and publishes with provenance.

## One-time setup

npm configures trusted publishing per package, so the package must exist first.

1. Publish the first version by hand from a clean checkout of its tag, signed in to the npm account that owns the `@invoicexml` scope: `npm ci && npm publish`. The `prepublishOnly` script runs the type check, tests and build first.
2. Right before the next release, open the package on npmjs.com, go to Settings, Trusted publishing, and add a GitHub Actions publisher: organization `InvoiceXML`, repository `invoicexml-node-facturx`, workflow `release.yml`, environment `npm`, and allow `npm publish`. A new configuration expires if it does not complete a publish within 2 days, so push the release tag soon after.
3. Once that release is out, set Publishing access to "Require two-factor authentication and disallow tokens".
