// PM2 ecosystem config for Nodwin CRM local LAN preview deployment.
//
// IMPORTANT: Update `cwd` below to the absolute path of the repo on the AMD GPU server
// before running `pm2 start`.
//   Example: cwd: '/home/ubuntu/nodwin-sales-crm'
//
// This is a LAN-only preview deployment — NOT production, NOT public.
// See README.md for first-time setup instructions.

module.exports = {
  apps: [
    {
      name: "nodwin-crm-local-preview",
      script: "pnpm",
      args: "--filter web start",
      cwd: "/home/orrin/nodwin-sales-crm",
      env: {
        PORT: 3030,
        HOSTNAME: "0.0.0.0",
        NODE_ENV: "production",
        NEXT_PUBLIC_ENV: "local-preview",
      },
      max_restarts: 10,
      min_uptime: "10s",
      watch: false,
    },
  ],
};
