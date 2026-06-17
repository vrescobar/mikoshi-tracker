# Self-hosting upgrades

Upgrades are intentionally conservative:

1. stop the stack
2. take a backup
3. update the code
4. run migrations explicitly
5. start the stack again
6. rerun the health check

### Backup-first upgrade flow

#### 1. Stop the stack

```bash
systemctl --user stop mikoshi-tracker-proxy mikoshi-tracker-api
```

#### 2. Create a SQLite backup

Run the backup while the stack is stopped so the SQLite file is not changing underneath you. The database lives at the path configured in `DATABASE_URL` (default `~/.local/share/mikoshi-tracker/mikoshi-tracker.db`):

```bash
DB=~/.local/share/mikoshi-tracker/mikoshi-tracker.db
cp "$DB" "$DB.backup.$(date +%Y%m%d%H%M%S)"
```

#### 3. Update the code

Pull the new revision or replace the working tree with the version you want to run, then refresh dependencies:

```bash
git pull
bun install
```

#### 4. Build, migrate, restart and verify

`scripts/deploy.sh` performs the remaining steps in order — build, `bun run db:migrate` (applies SQL migrations from `apps/api/migrations`), unit restart, and a `/health` check:

```bash
./scripts/deploy.sh
./scripts/self-host/check.sh
```

If the health check fails, stop here and inspect the stack before resuming use.

### Common upgrade failures

#### Backup file was never created

Re-run the backup step before migrating. The official path assumes you have a recoverable copy before any schema change.

#### Migrations succeed but the app still fails after restart

Run `./scripts/self-host/check.sh` and inspect which unit failed to come back healthy, then check its journal:

```bash
journalctl --user -u mikoshi-tracker-api -n 50
```

#### Operators changed the env file and forgot the public URL

If `APP_BASE_URL` changed in `~/.config/mikoshi-tracker/env`, re-run the health check against the actual URL you expect users to visit.

### Rollback

Restore the backup and check out the previously deployed revision:

```bash
systemctl --user stop mikoshi-tracker-proxy mikoshi-tracker-api
cp "$DB.backup.<timestamp>" "$DB"
git checkout <previous-revision>
bun install
./scripts/deploy.sh
```

For the base install flow and locale-behavior notes, return to [the install guide](./self-hosting.md).
