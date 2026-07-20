# Database backups & restore (ORR-780)

The self-hosted Supabase stack runs on a single DigitalOcean droplet, so the
database has **no managed backup UI**. Without the mechanism below, a droplet
disk failure or a stray `docker compose down -v` permanently destroys the entire
CRM. This directory ships that mechanism: a daily off-box `pg_dump` plus a
tested restore path.

## What gets installed

| File | Role |
|---|---|
| `backup-database.sh` | Takes a compressed `pg_dump` (`-Fc`) from the `supabase-db` container, writes a timestamped dump to `BACKUP_DIR`, ships it off-box, prunes old local dumps. |
| `restore-database.sh` | Destructive restore of a chosen dump into the container (`pg_restore --clean`), gated behind an explicit `RESTORE` confirmation. |
| `nodwin-crm-backup.service` / `.timer` | systemd units that run the backup daily at 03:00 UTC. |

## Install (on the VPS, once)

```bash
sudo cp deploy/backup-database.sh  /usr/local/bin/nodwin-crm-backup
sudo cp deploy/restore-database.sh /usr/local/bin/nodwin-crm-restore
sudo chmod 755 /usr/local/bin/nodwin-crm-backup /usr/local/bin/nodwin-crm-restore

sudo cp deploy/nodwin-crm-backup.service /etc/systemd/system/
sudo cp deploy/nodwin-crm-backup.timer   /etc/systemd/system/

# Off-box config (root-only; keep any cloud creds out of git):
sudo install -m 600 /dev/null /etc/nodwin-crm-backup.env
sudoedit /etc/nodwin-crm-backup.env
#   BACKUP_S3_URL=s3://nodwin-crm-backups/db
#   AWS_ACCESS_KEY_ID=...        # DO Spaces key
#   AWS_SECRET_ACCESS_KEY=...
#   AWS_DEFAULT_REGION=blr1
#   AWS_ENDPOINT_URL=https://blr1.digitaloceanspaces.com   # for the aws CLI
#   RETENTION_DAYS=14

sudo systemctl daemon-reload
sudo systemctl enable --now nodwin-crm-backup.timer
```

> **Off-box is not optional.** If `BACKUP_S3_URL` is unset the script still runs
> but keeps the dump on the same droplet — which does not survive the disk-loss
> failure this exists to protect against. Configure DO Spaces (or another bucket)
> so at least one copy lives elsewhere. Pair it with periodic DO **volume
> snapshots** for defence in depth (snapshots protect the whole box; pg_dumps
> give you selective, portable, point-in-time restores).

## Verify it works (do this at install time — an untested backup is not a backup)

```bash
# 1. Force a run and watch it:
sudo systemctl start nodwin-crm-backup.service
journalctl -u nodwin-crm-backup --no-pager | tail -20
ls -lh /var/backups/nodwin-crm/            # a fresh *.dump should be present
aws s3 ls "$BACKUP_S3_URL/"                 # ...and off-box

# 2. Confirm the timer is scheduled:
systemctl list-timers nodwin-crm-backup.timer
```

## Restore

```bash
# List available dumps (local and/or pull one back from the bucket first):
ls -lh /var/backups/nodwin-crm/

# Restore a specific dump (DESTRUCTIVE — replaces current DB contents):
sudo nodwin-crm-restore /var/backups/nodwin-crm/nodwin-crm-postgres-YYYYMMDD-HHMMSSZ.dump
# type RESTORE at the prompt

# After restore, before serving traffic:
#   - docker compose exec db pg_isready
#   - re-run the app's pgTAP/RLS checks
#   - smoke-test /login and an authed route
```

## Restore drill (quarterly)

Restore the latest dump into a throwaway Postgres container (not the live one)
and diff row counts against production to prove the dump is loadable and complete.
A backup you have never restored is a guess, not a backup.
