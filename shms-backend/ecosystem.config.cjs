module.exports = {
  apps: [
    {
      name: "shms-api",
      script: "./src/server.js",
      // Rate-limit counters (login brute-force protection included) live in
      // each process's memory, so N cluster workers would allow N times the
      // configured limits. Run one instance unless a shared rate-limit store
      // is added; PM2_INSTANCES can still raise it deliberately.
      instances: process.env.PM2_INSTANCES || 1,
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        // Scheduling, check-in and "today" use the server's local time as the
        // clinic's wall-clock time; a UTC host would shift every rule by an hour.
        TZ: process.env.TZ || "Africa/Lagos",
      },
    },
  ],
};
