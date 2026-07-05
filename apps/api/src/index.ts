import { app } from './app'

const port = Number(process.env['PORT'] ?? '3001')

Bun.serve({ port, fetch: app.fetch })

// eslint-disable-next-line no-console
console.log(`aas-api listening on http://127.0.0.1:${port}`)
