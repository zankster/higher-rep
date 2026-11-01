// trainer-fork: a test copy of the app on this computer, for trying the coaching screens.
//
//   node scripts/trainer/test-copy.mjs           start it (keeps the accounts from last time)
//   node scripts/trainer/test-copy.mjs --fresh   start over with no accounts
//
// Then open http://localhost:5173. The first account you create is the owner. Password sign-in is
// on, so a second person (an Incognito window) can sign up without a passkey. Its data lives in
// the system temp folder, never in ./data. Ctrl+C stops both servers.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(os.tmpdir(), 'higher-rep-test-data')
if (process.argv.includes('--fresh')) fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 5 })
fs.mkdirSync(DATA, { recursive: true })

const kids = []
const run = (name, cmd, args, opts) => {
  const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
  p.on('exit', code => { console.log(`[${name}] stopped (${code})`); stop() })
  kids.push(p)
}
const stop = () => { for (const p of kids) if (p.exitCode === null) p.kill(); process.exit(0) }
process.on('SIGINT', stop)

run('api', process.execPath, ['server.js'], {
  cwd: path.join(ROOT, 'api'),
  env: {
    ...process.env, PORT: '3000', DATA_DIR: DATA, RP_ID: 'localhost', ORIGIN: 'http://localhost:5173',
    PASSWORD_LOGIN: '1', FIRST_USER_ADMIN: '1',
  },
})
run('web', 'npm run dev -- --port 5173 --strictPort', [], { cwd: path.join(ROOT, 'frontend'), shell: true })

console.log(`\nTest copy: http://localhost:5173  (data in ${DATA})\n`)
