module.exports = {
  apps: [
    {
      name: 'hypnos-panel',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: 'C:\\Users\\Usuario\\Desktop\\Proyectos Codigo Antigravity\\hypnos-panel',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
}
