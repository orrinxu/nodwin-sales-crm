# Nodwin CRM — Local LAN Preview

> **LAN-only preview deployment** on the AMD GPU server (`192.168.88.51`).
>
> This is **not production**. It is **not public**. It is **not for sales reps**.
> It is a convenience preview for the board and developers to test builds before production deploy.

---

## First-time setup (one-time steps)

Run these steps once on the AMD GPU server to get the preview running:

### 1. Clone the repo

```bash
git clone <repo-url> /path/to/nodwin-sales-crm
cd /path/to/nodwin-sales-crm
```

### 2. Configure the environment

```bash
cp infra/local-preview/.env.local-preview.example infra/local-preview/.env.local-preview
```

Edit `infra/local-preview/.env.local-preview` and fill in:

- `SUPABASE_ANON_KEY` — find this in Supabase Studio > Settings > API
- `SUPABASE_SERVICE_ROLE_KEY` — keep this secret, never commit it

### 3. Update the PM2 ecosystem config path

Open `infra/local-preview/ecosystem.config.js` and change `cwd` to the absolute path of the repo on the server.

Example:

```js
cwd: "/home/ubuntu/nodwin-sales-crm",
```

### 4. Install dependencies and build

```bash
pnpm install
pnpm build
```

### 5. Start the app with PM2

```bash
pm2 start infra/local-preview/ecosystem.config.js
```

### 6. (Optional) Enable auto-restart on server reboot

```bash
sudo pm2 startup systemd
pm2 save
```

### 7. Verify

Open a browser and visit **http://192.168.88.51:3030**.

- The login page should load.
- After logging in, the dashboard should appear (may be empty).

---

## Deploy a new build

After merging changes to `main`, SSH into the server and run:

```bash
./infra/local-preview/deploy.sh
```

This pulls the latest code, installs dependencies, builds, and restarts the app.

---

## Common commands

| Action | Command |
|---|---|
| View logs | `pm2 logs nodwin-crm-local-preview` |
| Restart app | `pm2 restart nodwin-crm-local-preview` |
| Stop app | `pm2 stop nodwin-crm-local-preview` |
| Check status | `pm2 status` |

---

## Notes

- The app binds to `0.0.0.0:3030` so it is accessible to other machines on the LAN.
- No SSL — this is LAN HTTP only.
- No auto-deploy on git push. Use `deploy.sh` manually.
- No port forwarding, no DNS, no reverse proxy to the public internet.
