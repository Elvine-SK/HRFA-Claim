import { runPlatformCli } from '@elvine-sk/platform-server'
import { buildApp } from './app.ts'

process.exitCode = await runPlatformCli(buildApp)
