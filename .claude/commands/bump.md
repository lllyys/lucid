---
description: Bump the app version in package.json, commit, tag, and push
argument-hint: "[patch | minor | major]"
---

# Bump Version

Bump lucid's version following `.claude/rules/40-version-bump.md`:
`package.json` is the single source of truth, validated as semver,
committed with a conventional message, tagged `v<version>`, and pushed.

## Input

```text
$ARGUMENTS
```

Parse `$ARGUMENTS` for the semver level. Default to `patch` if empty.

| Input | Level |
|-------|-------|
| `patch` (or empty) | bug fixes — bump PATCH |
| `minor` | backwards-compatible features — bump MINOR |
| `major` | breaking changes — bump MAJOR |

If the argument is anything else: report the valid levels and STOP.

## Step 1: Verify clean working tree

```bash
git status --porcelain
```

If the output is non-empty: report "Working tree is not clean — commit or
stash changes before bumping" and STOP. Never bump on top of unrelated
edits.

## Step 2: Read current version

```bash
node -p "require('./package.json').version"
```

This is the single source of truth. There are no other version files to
read or update (no `tauri.conf.json`, no `Cargo.toml`, no Xcode project).

## Step 3: Compute and write the new version

Use npm to bump `package.json` per the requested level **without** creating
its own commit or tag (we do those explicitly below):

```bash
npm version <level> --no-git-tag-version
```

Confirm the result is valid semver (`MAJOR.MINOR.PATCH`) and capture it:

```bash
NEW_VERSION=$(node -p "require('./package.json').version")
echo "$NEW_VERSION"
```

If the version is not valid semver: revert the change and STOP.

## Step 4: Commit

Commit the bump alone with a conventional message:

```bash
git add package.json
git commit -m "chore(release): bump version to ${NEW_VERSION}"
```

## Step 5: Tag

Create an annotated tag `v<version>`:

```bash
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"
```

If the tag already exists: report the collision and STOP (do not overwrite).

## Step 6: Push

Push the commit and tag together:

```bash
git push --follow-tags
```

## Summary

Report:
- Old version → new version
- Bump level applied
- Commit SHA and tag name
- Confirmation the tag was pushed

## Safety Rules

1. **package.json only** — it is the single source of truth. Never touch
   `tauri.conf.json`, `Cargo.toml`, or any Xcode project file (lucid has
   none).
2. **Clean tree required** — refuse to bump with uncommitted changes.
3. **Valid semver** — abort if the computed version is malformed.
4. **One commit** — the bump stands alone; no unrelated changes.
5. **Never overwrite a tag** — abort if `v<version>` already exists.
6. **Push with `--follow-tags`** — commit and tag travel together.
