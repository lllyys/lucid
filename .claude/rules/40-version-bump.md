# 40 - Version Bump (Web)

lucid is a browser app. There is **one** source of truth for the app
version: the `version` field in `package.json`. There is no
`tauri.conf.json`, no `Cargo.toml`, and no Xcode project file to keep in
sync — bump `package.json` and nothing else.

## Rules

1. **Single source of truth.** Bump the `version` field in `package.json`
   only. Never edit a second file to mirror the version.
2. **Semver.** The new version must be valid [semver](https://semver.org/)
   (`MAJOR.MINOR.PATCH`). Choose the level by change type:
   - `patch` — bug fixes, no API/behavior change
   - `minor` — backwards-compatible features
   - `major` — breaking changes
3. **Clean tree first.** Refuse to bump unless `git status --porcelain` is
   empty. Stash or commit unrelated work before bumping.
4. **Conventional commit.** Commit the bump alone with a conventional
   message: `chore(release): bump version to X.Y.Z`.
5. **Tag.** Tag the bump commit `v<version>` (e.g. `v1.4.0`). One annotated
   tag per release.
6. **Push.** Push the commit and the tag together with
   `git push --follow-tags`.

## Sequencing

- In the feature workflow (`.claude/rules/47-feature-workflow.md`) the
  version bump is the **last commit before opening the PR** for each Work
  Item.
- In the fix-issue flow the bump is the mandatory tail commit before the
  PR (`patch` level for pure bug fixes).
- When multiple branches land in sequence, assign distinct, non-colliding
  versions in merge order so two PRs never claim the same `vX.Y.Z`.

## Anti-patterns

- Editing `tauri.conf.json`, `Cargo.toml`, `project.yml`, or any
  `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` field — none of these
  exist in lucid.
- Bumping with a dirty working tree.
- Tagging without pushing the tag (`git push` without `--follow-tags`).
- Mixing the version bump with unrelated changes in one commit.
