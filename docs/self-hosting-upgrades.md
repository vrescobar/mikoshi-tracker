# Self-hosting upgrades / 自托管升级

## English

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

`scripts/deploy.sh` performs the remaining steps in order — build, explicit `prisma migrate deploy`, unit restart, and a `/health` check:

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

## 中文

升级流程刻意保持保守：

1. 停掉整套服务
2. 先做备份
3. 更新代码
4. 显式执行 migrations
5. 再次启动服务
6. 重新跑健康检查

### 先备份再升级的流程

#### 1. 停止服务

```bash
systemctl --user stop mikoshi-tracker-proxy mikoshi-tracker-api
```

#### 2. 创建 SQLite 备份

请在整套服务停止后执行备份，这样 SQLite 文件不会在复制时继续变化。数据库位于 `DATABASE_URL` 配置的路径（默认 `~/.local/share/mikoshi-tracker/mikoshi-tracker.db`）：

```bash
DB=~/.local/share/mikoshi-tracker/mikoshi-tracker.db
cp "$DB" "$DB.backup.$(date +%Y%m%d%H%M%S)"
```

#### 3. 更新代码

拉取新版本，或者把工作树替换成你准备运行的那个版本，然后刷新依赖：

```bash
git pull
bun install
```

#### 4. 构建、迁移、重启并验证

`scripts/deploy.sh` 会按顺序完成剩余步骤——构建、显式 `prisma migrate deploy`、重启单元，以及 `/health` 检查：

```bash
./scripts/deploy.sh
./scripts/self-host/check.sh
```

如果健康检查失败，请先停在这里排查，不要继续恢复使用。

### 常见升级失败场景

#### 没有真正生成备份文件

请先重新执行备份步骤，再去执行 migration。官方升级路径默认你在任何 schema 变化之前都已经有可恢复的备份。

#### migration 成功了，但重启后应用仍然失败

运行 `./scripts/self-host/check.sh`，查看哪个单元没有恢复健康，然后检查它的日志：

```bash
journalctl --user -u mikoshi-tracker-api -n 50
```

#### operator 改了 env 文件，却忘了同步公网 URL

如果 `~/.config/mikoshi-tracker/env` 里的 `APP_BASE_URL` 发生变化，请用你期望用户真正访问的 URL 重新执行健康检查。

### 回滚

恢复备份并切回上一个已部署的版本：

```bash
systemctl --user stop mikoshi-tracker-proxy mikoshi-tracker-api
cp "$DB.backup.<timestamp>" "$DB"
git checkout <previous-revision>
bun install
./scripts/deploy.sh
```

安装流程和语言行为说明，请返回查看[安装指南](./self-hosting.md)。
