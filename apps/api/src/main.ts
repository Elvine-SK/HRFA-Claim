import { buildApp } from './app.ts'

const platform = await buildApp()
await platform.start()
