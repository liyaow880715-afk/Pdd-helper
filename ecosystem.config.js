module.exports = {
  apps: [
    {
      name: 'pdd-proxy',
      script: './pdd-proxy/run.bat',
      cwd: './pdd-proxy',
      interpreter: 'cmd.exe',
      interpreter_args: '/c',
      env: {
        PDD_PROXY_PORT: '8081',
      },
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
    },
    {
      name: 'pdd-manager',
      script: './src/app.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PDD_PROXY_URL: 'http://localhost:8081',
      },
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
    },
  ],
};
