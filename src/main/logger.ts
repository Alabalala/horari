import { app, WebContents } from 'electron'
import { join } from 'path'
import { appendFileSync, existsSync, renameSync, statSync } from 'fs'
import { format } from 'util'

export const logPath = join(app.getPath('userData'), 'horari.log')
const MAX_SIZE = 5 * 1024 * 1024

function write(level: string, msg: string): void {
  try {
    // ponytail: one rotation (.old), keeps at most ~10MB on disk
    if (existsSync(logPath) && statSync(logPath).size > MAX_SIZE) {
      renameSync(logPath, logPath + '.old')
    }
    appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${msg}\n`)
  } catch {
    // logging must never crash the app
  }
}

// Mirror main-process console.error/warn to the log file
for (const level of ['error', 'warn'] as const) {
  const original = console[level]
  console[level] = (...args: unknown[]) => {
    original(...args)
    write(level.toUpperCase(), format(...args))
  }
}

process.on('uncaughtExceptionMonitor', (err) => write('CRASH', err.stack || String(err)))
process.on('unhandledRejection', (reason) =>
  write('UNHANDLED', reason instanceof Error ? reason.stack || reason.message : String(reason))
)

// Renderer console errors/warnings (includes uncaught errors in React code)
export function attachRendererLogging(webContents: WebContents): void {
  webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
    if (level === 'error' || level === 'warning') {
      write(`RENDERER ${level.toUpperCase()}`, `${message} (${sourceId}:${lineNumber})`)
    }
  })
  webContents.on('render-process-gone', (_, details) => write('CRASH', `Renderer gone: ${details.reason}`))
}

write('INFO', `App started v${app.getVersion()} on ${process.platform} ${process.arch}`)
