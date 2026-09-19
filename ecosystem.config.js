// PM2 process file: `pm2 start ecosystem.config.js`
// Binds to localhost only; Nginx exposes it at https://gaane.revenuelyft.com
module.exports = {
  apps: [
    {
      name: "gaane",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 7005 -H 127.0.0.1",
      env: {
        NODE_ENV: "production",
        PORT: "7005",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      time: true,
    },
  ],
};
