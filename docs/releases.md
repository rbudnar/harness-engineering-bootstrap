# HEB Versioning And Release Policy

HEB versions exist to make template updates safer for consuming repositories. They should help humans and agents decide what changed, what to accept, what to reject as bloat, and how to roll back. They should not become ceremony detached from update risk.

## Version And Tag Format

- `VERSION` contains the numeric SemVer value without a leading `v`, for example `0.1.0`.
- Git tags and GitHub releases use `v<VERSION>`, for example `v0.1.0`.
- Planner examples should use the release tag form, for example `--target-version v0.1.0`.
- Planner comparison may accept either `0.1.0` or `v0.1.0`, but docs and release notes should use the tag form when referring to a release.

## Pre-1.0 Semantics

HEB uses `0.MINOR.PATCH` while the template is pre-1.0:

- Patch: fixes typos, examples, tests, or planner bugs without changing the recommended harness contract, required metadata fields, update behavior, or fitness enforcement.
- Minor: adds or changes template guidance, planner output, metadata fields, or fitness checks in a way that may require consuming repositories to review and classify release changes.
- Breaking pre-1.0 change: removes or renames documented fields, changes required-core guidance, changes read/write policy, or makes an existing passing consuming repo fail a previously optional check. Breaking pre-1.0 changes still bump the minor version, and release notes must call out migration and rollback explicitly.

## Release Notes

`CHANGELOG.md` is the durable release-note index. Use `## Unreleased` for the next release candidate, and use this shape for both unreleased and released sections:

```markdown
## Unreleased

### Summary

### Template Changes

### Planner And Metadata

### Migration

### Validation

### Rollback

## vX.Y.Z - YYYY-MM-DD

### Summary

### Template Changes

### Planner And Metadata

### Migration

### Validation

### Rollback
```

Release notes should describe update-visible changes, not every internal edit. When a change affects update mode, metadata, or validation, the release note should say how a consuming repo can classify it as already satisfied, applicable, intentionally rejected as bloat, or blocked.

## Stable Release Automation

Merged PRs create stable releases only when they have exactly one stable release label:

- `release:current`: tag and publish the current `VERSION` without changing files. Use this for the first release, re-publishing a missing GitHub Release, or an administrative release where the version was already prepared.
- `release:patch`: bump `VERSION` by one patch version, promote `## Unreleased` to `## vX.Y.Z - YYYY-MM-DD`, commit those changes directly to `main`, tag `vX.Y.Z`, and create a GitHub Release.
- `release:minor`: bump `VERSION` by one minor version and reset patch to zero, then follow the same changelog, commit, tag, and GitHub Release flow.

No stable release label means no release. Multiple stable release labels should fail instead of guessing. Pre-1.0 breaking changes use `release:minor` and must spell out migration and rollback in the release notes.

The workflow is allowed to make a direct post-merge release commit to `main`. With the current repository ruleset, a repo-scoped write deploy key stored as `HEB_RELEASE_DEPLOY_KEY` is the bypass actor for release pushes. If the repository switches to a custom release app, add `HEB_RELEASE_APP_ID` and `HEB_RELEASE_APP_PRIVATE_KEY` secrets; the workflow will use that app token for checkout and GitHub Release API calls, while the deploy key remains the branch-push bypass unless the ruleset is updated to trust the custom app instead.

## Bootstrapped Repository Metadata

Newly bootstrapped or updated repositories should record accepted HEB metadata in `docs/harness-version.json` or `.harness/harness-version.json`. Existing minimal metadata remains readable, but new update PRs should prefer these fields:

- `templateVersion`: numeric HEB version from `VERSION`, without `v`.
- `sourceRelease`: tag or release URL, for example `v0.1.0`.
- `installedAt` or `updatedAt`: ISO date for the accepted bootstrap or update.
- `acceptedChanges`: release-note items applied because they have local trigger evidence.
- `rejectedChanges`: release-note items intentionally rejected as bloat, with a reason and revisit rule.
- `deferredChanges`: release-note items blocked by missing local evidence, ownership, or validation.
- `rollback`: previous version/tag plus the rollback note or PR-revert plan when updating an existing bootstrap.
- `validation`: commands or checks run before metadata was updated.

Update metadata only after the bootstrap or update PR passes validation. A consuming repo should not mark a release accepted just because the planner mentioned it.

## Release Checklist

1. Choose the release label from the pre-1.0 rules: `release:current`, `release:patch`, or `release:minor`.
2. Update `## Unreleased` in `CHANGELOG.md` with the required release-note headings before using `release:patch` or `release:minor`.
3. Keep release docs, README examples, template guidance, and planner output aligned with the chosen tag format.
4. Run `node --test scripts/harness-bootstrap-plan.test.mjs`.
5. Run `node --test scripts/prepare-stable-release.test.mjs`.
6. Run `node scripts/template-fitness.mjs`.
7. Run `node scripts/harness-bootstrap-plan.mjs --repo . --mode update --target-version v<VERSION>` as the template-repo update-mode smoke test.
8. For a bootstrapper/manual consumer smoke test, run the planner against a separate target repository before publishing release notes as final.
9. Merge the PR with exactly one stable release label and let `.github/workflows/stable-release.yml` create the release commit, tag, and GitHub Release.

## Consuming Repository Update Flow

For an already-bootstrapped repository:

1. Run `node scripts/harness-bootstrap-plan.mjs --repo <target-repo> --mode update --target-version vX.Y.Z`.
2. Read the `vX.Y.Z` release notes, template diff, and generated update plan before writing files.
3. Classify each release-note item as already satisfied, applicable, intentionally rejected as bloat, deferred, or blocked.
4. Apply only locally triggered changes that preserve the repository's existing adapters, validators, and deliberate omissions.
5. Record metadata after validation, including rejected or deferred release changes.
6. Roll back by reverting the update PR, restoring previous metadata, rerunning validation, and recording the rollback note.
