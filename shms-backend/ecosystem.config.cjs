module.exports = {
  apps: [
    {
      name: "shms-api",
      script: "./src/server.js",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};