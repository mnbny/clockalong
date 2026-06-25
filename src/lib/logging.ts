import { isTauri } from '@tauri-apps/api/core'
import { debug, error, info, warn } from '@tauri-apps/plugin-log'

type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn'
type LogFunction = (message: string) => Promise<void>

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
} satisfies Record<ConsoleMethod, (...args: unknown[]) => void>

let initialized = false

export function registerConsoleLogging() {
  if (initialized || !isTauri()) {
    return
  }

  initialized = true

  forwardConsole('debug', debug)
  forwardConsole('error', error)
  forwardConsole('info', info)
  forwardConsole('log', info)
  forwardConsole('warn', warn)
}

function forwardConsole(method: ConsoleMethod, logger: LogFunction) {
  console[method] = (...args: unknown[]) => {
    originalConsole[method](...args)

    void logger(formatConsoleArgs(args)).catch(logError => {
      originalConsole.warn('[console logging] failed to write log message:', logError)
    })
  }
}

function formatConsoleArgs(args: unknown[]) {
  return args.map(formatConsoleArg).join(' ')
}

function formatConsoleArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || arg.message
  }

  if (typeof arg === 'string') {
    return arg
  }

  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}
