# GitHub releases

Pushing to `develop` in `null01024/mainsail-multitool` starts the Release workflow. Each push builds its exact commit and publishes a full GitHub Release containing `mainsail.zip`. The existing CI workflow still runs its build, Vitest, and Cypress jobs independently; their results do not gate Release.

The workflow keeps the upstream build and publishing tools: Node 20, `npm ci`, `npm run build`, git-cliff, and `softprops/action-gh-release`. FTP deployment and synchronization to `master` are omitted. It uses the built-in `GITHUB_TOKEN` with `contents: write`; no PAT is required.

## Versions and retries

Automatic versions increment the final number in the source package's `X.Y.Z-multitool.N` series, considering all remote tags and releases, including drafts. With the current source version, the first available version is `v2.19.0-multitool.3`.

An annotated version tag reserves the version and records its workflow run and source SHA before building. A failed build can leave this tag, but cannot create a public Release. Another push takes the next available number; rerunning the failed run recovers its original reservation. Do not delete or move these tags to retry a build.

After building, the workflow verifies the ZIP's version, repository identity, and entry point. It uploads the ZIP to a draft, checks the uploaded size and SHA-256 digest, then publishes. Retrying a completed run does not replace its public asset. An older run cannot take Latest from a newer successful run, even if queue scheduling or retries finish out of order. A lower manual version also leaves Latest unchanged.

Version changes happen only in the runner. The release tag points to the original pushed commit; the source package version is not committed back. CHANGELOG and release notes are generated with the upstream git-cliff configurations, using this fork's links, and saved with the ZIP as an Actions artifact.

## Manual releases

Open **Actions → Release → Run workflow**, select `develop`, and optionally provide a SemVer version. Leaving it empty uses automatic numbering. A manual version cannot overwrite another run's tag or release. Automatic and manual releases use the same queue; GitHub permits up to 100 pending runs with `queue: max`.

Docker keeps its existing workflow. Publishing with `GITHUB_TOKEN` does not trigger the Docker workflow's `release` event; Docker's `develop` push builds continue normally.

## Local checks

Run `npm run test:unit` for the release lifecycle tests and existing Vitest tests. After building with an allocated version, stage the ZIP under `$RUNNER_TEMP/mainsail-release/mainsail.zip` and run `RELEASE_TAG=vX.Y.Z-multitool.N node scripts/github-release.js verify` to check its contents without contacting GitHub.
