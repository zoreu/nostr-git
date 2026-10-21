# ngit

**Decentralized Git on Nostr + Blossom.**

`ngit` uses the Git you already know to version files locally. On `push`, it publishes the history (Git bundle), the files and a manifest to the Nostr/Blossom network. On `clone`, it discovers the repository through the relays, downloads the bundle from Blossom and rebuilds the full Git repository.

No central server, no platform account: your identity is a Nostr key pair.

```
npm install -g nostr-git
ngit login --generate
ngit init
ngit add .
ngit commit -m "first commit"
ngit push
ngit web
```

## Features

- Git-style commands: `init`, `add`, `commit`, `push` and `clone`.
- Nostr identity via `nsec` (or generate a new key).
- Files stored on Blossom servers with SHA-256 verification.
- Full history carried as a Git bundle.
- SemVer versions for commits: `ngit version create/list/switch` (annotated v tags).
- Web manifest with file tree, README and commits.
- GitHub-like local interface: `ngit web`.
- Automatic selection among multiple relays and Blossom servers.
- Installable straight from a GitHub repository.

## Requirements

- Node.js 20 or newer
- Git 2.28 or newer

## Installation

Via npm:

```bash
npm install -g nostr-git
```

Straight from GitHub:

```bash
npm install -g github:zoreu/nostr-git
```

For local development:

```bash
git clone https://github.com/zoreu/nostr-git.git
cd nostr-git
npm install
npm link
```

Then check:

```bash
ngit --version
ngit --help
```

## Quick start

### 1. Login

Create a new identity:

```bash
ngit login --generate
```

Store the displayed `nsec` in a safe place. It is the only way to control the repositories published with that identity.

To use an existing identity:

```bash
ngit login
# paste the nsec1... when prompted
```

You can also configure relays and Blossom servers:

```bash
ngit login \
  --relays wss://relay.damus.io,wss://nos.lol \
  --blossom https://blossom.primal.net,https://nostr.download
```

### 2. Publish a project

```bash
cd my-project
ngit init -d "My decentralized project"
ngit add .
ngit commit -m "first commit"
ngit push
```

Output looks like Git's:

```
Enumerating objects...
  3 file(s), 167 B
  Git bundle: 917 B
Sending content to Blossom...
  ✓ bundle 593 B https://nostr.download
  ✓ manifest 1.37 KiB https://blossom.primal.net
Publishing references on Nostr...
  ✓ wss://nos.lol accepted

To nostr://npub1vnd9.../my-project
   * [new branch]      main -> main
```

The final address has the format:

```
nostr://npub1.../project-name
```

### 3. Clone on another machine

```bash
ngit clone npub1.../my-project
```

Or choose the destination folder:

```bash
ngit clone npub1.../my-project other-folder
```

`clone` requires no login: anyone with the `npub` can download the public repository.

### 3.1 Repository description

There is no default description: if none is given, the announcement is published with an empty description. Set it at creation time:

```bash
ngit init -d "A command line tool for Nostr"
```

Update it at any time (this republishes the announcement on the relays instantly — no push needed):

```bash
ngit describe "A faster command line tool for Nostr"
ngit describe --clear
```

To change the description of a cloned repository you own, run `ngit describe` at its root.

### 4. Browse on the web

```bash
ngit web
```

Opens `http://127.0.0.1:3737` in your browser with:

- your repositories, with a filter box by name/description;
- a global search (name, description, npub or project), like GitHub's search;
- discovery of recent repositories on the relays;
- file tree;
- code and image viewing;
- rendered README;
- commit history;
- clone command ready to copy.

Open directly on a repository:

```bash
ngit web npub1.../my-project
```

Options:

```bash
ngit web --port 4000 --host 127.0.0.1 --no-open
```

## Commands

| Command | Description |
| --- | --- |
| `ngit init [project] [-d "desc"]` | Initializes Git and the `.ngit/` metadata |
| `ngit login [--generate]` | Saves or creates your Nostr identity |
| `ngit whoami` | Shows the logged-in identity |
| `ngit add <files...>` | Adds files to the Git index |
| `ngit commit [-m "msg"]` | Creates a commit using local Git |
| `ngit version [create/list/switch]` | Creates/lists versions and switches to a version or hash |
| `ngit branch [list/new/switch]` | List/create/switch branch |
| `ngit push` | Publishes commits, bundle, manifest and files |
| `ngit describe "text" [--clear]` | Updates the repository description and republishes it |
| `ngit clone <npub.../project> [folder]` | Clones a repository from Nostr |
| `ngit web [npub.../project]` | Opens the local web interface |
| `ngit help` | Shows help |

## Versions

Ngit uses annotated Git tags in the SemVer pattern (`vX.Y.Z`) to version commits.

Create a version:

```bash
ngit version create v1.0.0
ngit version create --patch              # bumps the patch automatically (v1.0.0 -> v1.0.1)
ngit version create --minor -m "new feature"
ngit version create v1.1.0 a1b2c3d       # versions a specific commit by hash
```

List the versions:

```bash
ngit version list
→ v1.0.1       a9b886d  2026-10-20  version v1.0.1
  v1.0.0       80f0ec4  2026-10-20  version v1.0.0
```

Switch to a version or commit (the bundle carries the full history, so it works even on a clone):

```bash
ngit version switch v1.0.0        # by version (accepts "1.0.0" without the v)
ngit version switch a1b2c3d       # by hash (short or full)
ngit version switch latest        # back to the latest version
```

On a detached HEAD the push is blocked; to publish that state, create a branch:

```bash
ngit version switch v1.0.0 --branch fix-1.0.0
```

Versions are sent in the manifest on every `ngit push`, so a clone on another machine sees the same tags.

## Branches

```bash
ngit branch list                    # lists local branches (marked with →)
ngit branch new hotfix              # creates "hotfix" on the current commit and switches to it
ngit branch switch main             # switches to an existing branch
ngit branch checkout newthing       # switches if it exists; otherwise creates it
```

To publish a branch on Nostr, just be on it and run `ngit push` — the state governs the current branch (`HEAD` on publish), and the state event records which one it was. **Local** branches always travel inside the full Git bundle; therefore `ngit clone` receives all of them, and `ngit branch list`/`ngit branch switch` work right on the clone.

## How it works

Each repository is identified by:

```
author (Nostr pubkey) + project name ("d" tag)
```

On `push`, ngit:

1. Runs `git bundle create --all` to package the full history.
2. Lists the files tracked in the current commit.
3. Sends each file to Blossom, addressed by the SHA-256 of the content.
4. Generates a JSON manifest with the file tree, commits and MIME types.
5. Publishes a Nostr state event with the bundle and manifest references.
6. Publishes/updates the public repository announcement.

Events used:

| Kind | Use |
| --- | --- |
| `30617` | Repository announcement (NIP-34 compatible) |
| `30618` | Repository state: branch, commit, bundle and manifest |

Blossom is used to store:

- the Git bundle;
- individual files;
- the JSON manifest.

All downloaded content is verified by SHA-256. Nostr events have their signature verified before being used.

## Configuration

Default file:

```
~/.ngit/config.json
```

Simplified structure:

```json
{
  "secretKeyHex": "...",
  "pubkeyHex": "...",
  "npub": "npub1...",
  "relays": ["wss://relay.damus.io", "wss://nos.lol"],
  "blossomServers": ["https://blossom.primal.net", "https://nostr.download"]
}
```

Environment variables:

| Variable | Effect |
| --- | --- |
| `NGIT_NSEC` | Uses a key from the environment (overrides the saved key) |
| `NGIT_RELAYS` | Comma-separated relays |
| `NGIT_BLOSSOM_SERVERS` | Comma-separated Blossom servers |
| `NGIT_HOME` | Alternative directory for the config |
| `NGIT_CONFIG` | Alternative path for the config file |
| `NGIT_ALLOW_LOCAL_BLOSSOM` | `1` allows local/HTTP Blossom |
| `NGIT_DEBUG` | Shows stack traces on errors |

## Security

- The private key lives in `~/.ngit/config.json` with restricted permissions (`0600` on POSIX systems).
- It is not encrypted. Use a dedicated identity for testing or a trusted machine.
- Back up your `nsec`. Without it you cannot update the repositories.
- Never publish your `nsec`. It is different from the `npub`.
- `clone` and the web interface are read-only and do not need the private key.
- The web interface runs locally on `127.0.0.1` by default.

## Current limitations

- `push` publishes the state of the current branch; the web interface shows the main branch.
- There is no `pull`, `merge`, issues or pull requests.
- Public relays and Blossom servers may go unavailable; configure alternatives.
- Public Blossom servers may enforce per-file size limits.
- Push loads files and bundle into memory; very large repositories may use a lot of RAM.
- The full bundle is generated on every push and re-sent when the history changes; files already on Blossom are reused by hash.
- Private/encrypted repositories are not supported yet.

## Publishing your own ngit on GitHub

```bash
git init -b main
git add .
git commit -m "feat: ngit client"
git remote add origin https://github.com/YOUR-USERNAME/nostr-git.git
git push -u origin main
```

Then the global install can be done with:

```bash
npm install -g github:YOUR-USERNAME/nostr-git
```

To publish on npm:

```bash
npm publish
```

## Development

```bash
npm install
npm test
node bin/ngit.js --help
npm link
```

Structure:

```
bin/            CLI entry point
src/commands/   init, login, add, commit, push, describe, clone, version, web
src/lib/        Git, Nostr, Blossom, protocol, manifest, semver and web server
web/            HTML/CSS/JS interface
test/           unit tests
```

## License

MIT
