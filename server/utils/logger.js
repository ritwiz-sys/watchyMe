const c = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
}

const ts = () => new Date().toLocaleTimeString('en', { hour12: false })

export const log = {
  info:  (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.cyan}info${c.reset} `, ...a),
  ok:    (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.green} ok ${c.reset} `, ...a),
  warn:  (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.yellow}warn${c.reset} `, ...a),
  error: (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.red}err ${c.reset} `, ...a),
  room:  (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.bold}room${c.reset} `, ...a),
  game:  (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.bold}game${c.reset} `, ...a),
  sock:  (...a) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.gray}sock${c.reset} `, ...a),
}
