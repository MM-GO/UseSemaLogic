#!/usr/bin/env node
/**
 * Cross-platform Obsidian CLI test runner. Requires Node 18+; no shell or
 * PowerShell dependency. It runs on Windows, Linux and macOS.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const option = (name, fallback) => {
  const entry = process.argv.find(value => value.startsWith(`${name}=`))
  return entry ? entry.slice(name.length + 1) : fallback
}
const mode = option('--mode', 'integration')
const serverCleanup = option('--server-cleanup', 'process')
const noBuild = args.has('--no-build')
const preflightOnly = args.has('--preflight')
if (!['smoke', 'integration'].includes(mode) || !['keep', 'process'].includes(serverCleanup)) {
  throw new Error('Usage: node scripts/test-obsidian.mjs [--mode=smoke|integration] [--server-cleanup=keep|process] [--no-build]')
}

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
const artifactPath = join(root, 'tests', 'obsidian', 'artifacts', timestamp)
const configPath = join(root, 'tests', 'obsidian', '.env')
const steps = []
let config, vaultPath, cli, serverState, settingsBackup

function addStep(name, status, detail = '') { steps.push({ name, status, detail, timestamp: new Date().toISOString() }) }
function sleep(ms) { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)) }
function isLoopback(url) { return ['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname) }
function commandExists(command) {
  const check = process.platform === 'win32' ? ['where', [command]] : ['sh', ['-lc', `command -v ${command}`]]
  return spawnSync(check[0], check[1], { stdio: 'ignore' }).status === 0
}
function parseEnv(text) {
  const values = {}
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) throw new Error(`Invalid configuration line: ${sourceLine}`)
    values[match[1]] = match[2].trim()
  }
  return values
}
async function readJson(path) {
  // PowerShell 5.1 writes UTF-8 files with a BOM. Strip it so existing Golden
  // files remain usable by Node on every platform.
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}
async function exists(path) { try { await stat(path); return true } catch { return false } }
async function run(command, commandArgs, label, options = {}) {
  return await new Promise((resolveRun, rejectRun) => {
    // Windows command shims such as npm.cmd must be invoked by cmd.exe. On
    // Unix, npm is a normal executable and remains shell-free.
    const needsWindowsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
    const child = spawn(command, commandArgs, { cwd: root, shell: needsWindowsShell, ...options })
    let output = ''
    child.stdout?.on('data', data => { output += data })
    child.stderr?.on('data', data => { output += data })
    child.on('error', error => rejectRun(new Error(`${label}: ${error.message}`)))
    child.on('close', code => code === 0 ? resolveRun(output.trim()) : rejectRun(new Error(`${label} failed (${code}): ${output.trim()} `)))
  })
}
async function obsidian(commandArgs, label) { return run(cli, commandArgs, label) }
async function evalObsidian(code, label) { return obsidian(['eval', `code=${code}`], label) }
async function dom(selector, kind = 'total') { return obsidian(['dev:dom', `selector=${selector}`, kind], `query DOM ${selector}`) }
async function waitFor(predicate, description, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await predicate()) return; await sleep(250) }
  throw new Error(`Timed out waiting for ${description}`)
}
async function waitForDom(selector) { return waitFor(async () => /(^|\D)[1-9]\d*(\D|$)/.test(await dom(selector)), selector) }
async function resultText() { return (await dom('[data-sl-test="result"]', 'text')).trim() }
function hasErrors(text) { return text.trim() && !/^(No errors captured\.?|No JavaScript errors\.?|\[\])$/i.test(text.trim()) }
function js(value) { return JSON.stringify(value) }
async function writeReport(result, error = '') {
  await mkdir(artifactPath, { recursive: true })
  await writeFile(join(artifactPath, 'report.json'), JSON.stringify({ runId: timestamp, mode, serverCleanup, result, startedAt: timestamp, finishedAt: new Date().toISOString(), error, steps }, null, 2))
}
async function checked(name, callback) {
  try { await callback(); addStep(name, 'passed') } catch (error) { addStep(name, 'failed', error.message); throw error }
}
async function preflight() {
  if (!await exists(configPath)) throw new Error('Missing tests/obsidian/.env. Copy .env.example and adapt it.')
  config = { ...parseEnv(await readFile(configPath, 'utf8')), ...process.env }
  cli = config.OBSIDIAN_CLI || 'obsidian'
  if (!commandExists(cli)) throw new Error(`Obsidian CLI '${cli}' was not found.`)
  vaultPath = resolve(config.SL_TEST_VAULT || '')
  if (!vaultPath.split(/[\\/]/).some(segment => /test/i.test(segment))) throw new Error(`Refusing vault without a 'test' path segment: ${vaultPath}`)
  if (!await exists(join(vaultPath, '.obsidian', 'plugins', 'semalogic', 'manifest.json'))) throw new Error('SemaLogic plugin is not installed in the configured test vault.')
  if (mode === 'integration' && (!config.SL_SERVICE_URL || !isLoopback(config.SL_SERVICE_URL))) throw new Error('SL_SERVICE_URL must be a loopback URL.')
}
async function serviceVersion() {
  try { const response = await fetch(`${config.SL_SERVICE_URL.replace(/\/$/, '')}/api-version`, { signal: AbortSignal.timeout(2000) }); return response.ok ? await response.text() : '' } catch { return '' }
}
async function startService() {
  const present = await serviceVersion()
  if (present) { serverState = { startedByRunner: false, version: present }; return }
  const workdir = config.SL_SERVER_WORKDIR, command = config.SL_SERVER_START_CMD
  if (!workdir || !command || !await exists(workdir)) throw new Error('SL_SERVER_WORKDIR or SL_SERVER_START_CMD is missing or invalid.')
  await mkdir(artifactPath, { recursive: true })
  const out = createWriteStream(join(artifactPath, 'semalogic-server.log'))
  const err = createWriteStream(join(artifactPath, 'semalogic-server-error.log'))
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/c', command], { cwd: workdir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEMALOGIC_TRACE: '1' } })
    : spawn('sh', ['-lc', command], { cwd: workdir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEMALOGIC_TRACE: '1' } })
  child.stdout.pipe(out); child.stderr.pipe(err); child.unref()
  await waitFor(async () => Boolean(await serviceVersion()), 'local SemaLogic service', Number(config.SL_TEST_TIMEOUT_MS || 30000))
  serverState = { startedByRunner: true, processId: child.pid, version: await serviceVersion() }
  await writeFile(join(artifactPath, 'semalogic-server-state.json'), JSON.stringify(serverState, null, 2))
}
async function stopService() {
  if (serverCleanup !== 'process' || !serverState?.startedByRunner || !serverState.processId) return
  if (process.platform === 'win32') await run('taskkill.exe', ['/PID', String(serverState.processId), '/T', '/F'], 'stop SemaLogic process tree')
  else { try { process.kill(-serverState.processId, 'SIGTERM') } catch { /* process has already exited */ } }
}
async function configureProfile(sid) {
  const path = join(vaultPath, '.obsidian', 'plugins', 'semalogic', 'data.json')
  settingsBackup = join(artifactPath, 'plugin-data.before-integration.json')
  await copyFile(path, settingsBackup)
  const settings = await readJson(path), profile = settings.mySLSettings?.[0]
  if (!profile) throw new Error('Plugin settings have no SemaLogic profile.')
  const url = new URL(config.SL_SERVICE_URL)
  Object.assign(profile, { myBaseURL: url.hostname, myPort: url.port, myUseHttpsSL: false, myUserSL: '', myPasswordSL: '', mySID: sid, myOutputFormat: 'SemaLogic' })
  settings.mySetting = 0
  await writeFile(path, JSON.stringify(settings, null, 2))
}
async function captureDiagnostics() {
  const files = [['javascript-errors.txt', ['dev:errors']], ['console.txt', ['dev:console', 'limit=100']], ['semalogic-view-dom.txt', ['dev:dom', 'selector=[data-sl-test="semalogic-view"]', 'inner']]]
  for (const [name, parameters] of files) try { await writeFile(join(artifactPath, name), await obsidian(parameters, name)) } catch { /* retain primary error */ }
  try { await obsidian(['dev:screenshot', `path=${join(artifactPath, 'failure.png')}`], 'screenshot') } catch { /* retain primary error */ }
}
async function smoke() {
  await obsidian(['dev:errors', 'clear'], 'clear JavaScript errors'); await obsidian(['dev:console', 'clear'], 'clear console')
  const commands = await obsidian(['commands', 'filter=semalogic:sl_create_'], 'list fixture commands')
  for (const id of ['sl_create_test_canvas', 'sl_create_template_canvas']) if (!commands.includes(`semalogic:${id}`)) throw new Error(`Plugin command is not registered: semalogic:${id}`)
  await obsidian(['command', 'id=semalogic:sl_create_test_canvas'], 'create Canvas fixture')
  for (const fixture of ['SemaLogic/TestCanvas.canvas', '.SemaLogic/test_nodeinfos/test-node.md']) if (!await exists(join(vaultPath, fixture))) throw new Error(`Fixture was not created: ${fixture}`)
  const errors = await obsidian(['dev:errors'], 'read JavaScript errors'); if (hasErrors(errors)) throw new Error(`Obsidian captured JavaScript errors: ${errors}`)
  await writeFile(join(artifactPath, 'smoke.txt'), 'Smoke assertions passed.\n')
}
async function integration(sid) {
  const base = config.SL_SERVICE_URL.replace(/\/$/, ''), parseUrl = `${base}/rules/parse?sid=${encodeURIComponent(sid)}`
  const rules = 'OR-Rule 1|2 { Choice A, Choice B}\nChoice A [AND-Rule D,E]\nAND-Rule D[Choice A,F]'
  await fetch(`${base}/reset?sid=${encodeURIComponent(sid)}`, { method: 'POST' })
  await evalObsidian(`const v=app.workspace.getLeavesOfType('SemaLogicService')[0]?.view;if(!v)throw Error('SemaLogic view is not open');v.apiURL=${js(parseUrl)};v.dialectID='default';v.bodytext=${js(rules)};const s=v.dropdownButton.selectEl;s.value='SVG';s.dispatchEvent(new Event('change',{bubbles:true}));'SVG selected'`, 'request SVG')
  await waitForDom('[data-sl-test="result"] svg')
  await fetch(`${base}/reset?sid=${encodeURIComponent(sid)}`, { method: 'POST' })
}
function withoutLayout(value) {
  if (Array.isArray(value)) return value.map(withoutLayout)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['x', 'y', 'width', 'height', 'color'].includes(key))
      .map(([key, child]) => [key, withoutLayout(child)]))
  }
  return value
}
function goldenTokens(format, text) {
  let content = text
  if (['ASP.json', 'KnowledgeGraph'].includes(format)) content = JSON.stringify(withoutLayout(JSON.parse(text)))
  // DOM text differs across Electron/OS versions (SVG node order, whitespace,
  // NBSP encoding). The Golden contract is the semantic token set, not layout.
  return new Set(content
    .replace(/\\n/g, ' ')
    // The Windows CLI transport can render a non-breaking space as `┬á`,
    // while Electron may emit `Â `. Both are separators, not semantic text.
    .replace(/[Â┬á]/g, ' ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [])
}
async function viewSuite(sid) {
  const fixturePath = 'TestCases/SemaLogicView/basic-semalogic.md', fixture = await readFile(join(root, 'tests', 'obsidian', 'fixtures', 'semalogic-view-basic.md'), 'utf8')
  const base = config.SL_SERVICE_URL.replace(/\/$/, ''), parseUrl = `${base}/rules/parse?sid=${encodeURIComponent(sid)}`, responses = {}
  const protocol = []
  const note = async (step, status, detail = '') => { protocol.push({ timestamp: new Date().toISOString(), step, status, detail }); await writeFile(join(artifactPath, 'semalogic-view-protocol.json'), JSON.stringify(protocol, null, 2)) }
  const select = async format => {
    await note(`dropdown:${format}`, 'started')
    await evalObsidian(`const v=app.workspace.getLeavesOfType('SemaLogicService')[0]?.view,s=v?.dropdownButton.selectEl;if(!v||!s)throw Error('SemaLogic view is not open');v.contentEl.removeAttribute('data-sl-test-last-request');v.resultEl.empty();s.value=${js(format)};s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));'selected'`, `select ${format}`)
    await waitFor(async () => (await evalObsidian(`app.workspace.getLeavesOfType('SemaLogicService')[0]?.view?.contentEl?.getAttribute('data-sl-test-last-request')??''`, `wait ${format}`)).includes(format), `${format} request`)
    await waitForDom('[data-sl-test="result"] *'); responses[format] = { resultText: await resultText() }; await note(`dropdown:${format}`, 'passed')
  }
  try {
    await mkdir(artifactPath, { recursive: true }); await note('workspace:reset', 'started')
    await obsidian(['create', `path=${fixturePath}`, `content=${fixture}`, 'overwrite'], 'create fixture')
    await evalObsidian(`for(const t of ['markdown','canvas','SemaLogicService','TransferService'])app.workspace.detachLeavesOfType(t);'reset'`, 'close views')
    await obsidian(['open', `path=${fixturePath}`], 'open Markdown fixture')
    await obsidian(['command', 'id=semalogic:sl_open_view'], 'open SemaLogicView')
    await waitForDom('[data-sl-test="semalogic-view"]'); await note('workspace:reset', 'passed')
    await evalObsidian(`const v=app.workspace.getLeavesOfType('SemaLogicService')[0].view;v.apiURL=${js(parseUrl)};v.dialectID='default';v.bodytext=${js(fixture)};v.dropdownButton.setValue('SVG');const s=v.dropdownButton.selectEl;s.value='SemaLogic';s.dispatchEvent(new Event('change',{bubbles:true}));'SemaLogic selected'`, 'initial SemaLogic request')
    await waitFor(async () => (await evalObsidian(`app.workspace.getLeavesOfType('SemaLogicService')[0]?.view?.contentEl?.getAttribute('data-sl-test-last-request')??''`, 'wait SemaLogic')).includes('SemaLogic'), 'SemaLogic request')
    responses.SemaLogic = { resultText: await resultText() }
    for (const format of ['ASP.json', 'SVG', 'SemanticTree', 'KnowledgeGraph', 'AnnotatedHTML', 'AnnotatedHTML_backlinks']) await select(format)
    await evalObsidian(`const v=app.workspace.getLeavesOfType('SemaLogicService')[0].view,s=v.dropdownButton.selectEl;s.value='DialectEngine';s.dispatchEvent(new Event('change',{bubbles:true}));'DialectEngine selected'`, 'select DialectEngine')
    await waitForDom('[data-sl-test="result"] p'); await select('SemaLogic')
    await writeFile(join(artifactPath, 'semalogic-view-responses.json'), JSON.stringify({ fixture: fixturePath, responses }, null, 2))
    const goldenPath = join(root, 'tests', 'obsidian', 'golden', 'semalogic-view-responses.json')
    if (!await exists(goldenPath)) {
      const answer = (await readline.createInterface({ input: process.stdin, output: process.stdout }).question('Accept captured dropdown responses as GOLDEN? [y/N] ')).trim()
      if (!/^(y|yes|j|ja)$/i.test(answer)) throw new Error('Golden baselines were not accepted.')
      await mkdir(dirname(goldenPath), { recursive: true }); await writeFile(goldenPath, JSON.stringify({ fixture: fixturePath, responses }, null, 2))
    } else {
      const golden = (await readJson(goldenPath)).responses
      for (const [format, response] of Object.entries(golden)) {
        const actual = responses[format]?.resultText, expected = response.resultText
        const actualTokens = goldenTokens(format, actual)
        const missing = [...goldenTokens(format, expected)].filter(token => !actualTokens.has(token))
        if (missing.length > 0) throw new Error(`Dropdown response differs from its approved Golden baseline: ${format}; missing ${missing.slice(0, 5).join(', ')}.`)
      }
    }
    await note('golden:compare', 'passed')
  } finally { await evalObsidian(`for(const t of ['markdown','canvas','SemaLogicService','TransferService'])app.workspace.detachLeavesOfType(t);'cleanup'`, 'close test views').catch(() => {}) }
}

try {
  await checked('configuration preflight', preflight)
  await mkdir(artifactPath, { recursive: true })
  if (preflightOnly) {
    await writeReport('passed')
    console.log('Obsidian CLI preflight passed.')
    process.exit(0)
  }
  await checked('active test vault check', async () => { if (resolve((await obsidian(['vault', 'info=path'], 'read active vault')).trim()) !== vaultPath) throw new Error('The active Obsidian vault is not the configured test vault.') })
  if (mode === 'integration') { await checked('start local SemaLogic service', startService); await checked('configure local SemaLogic test profile', () => configureProfile(`obsidian-cli-${timestamp}`)) }
  await checked('Jest unit tests', () => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], 'Jest'))
  if (!noBuild) await checked('plugin build', () => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], 'build'))
  await checked('copy plugin to test vault', async () => { const target = join(vaultPath, '.obsidian', 'plugins', 'semalogic'); await mkdir(target, { recursive: true }); for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(join(root, file), join(target, file)) })
  await checked('Obsidian plugin reload', () => obsidian(['plugin:reload', 'id=semalogic'], 'reload plugin'))
  await checked('Obsidian smoke assertions', smoke)
  if (mode === 'integration') { const sid = `obsidian-cli-${timestamp}`; await checked('Obsidian SemaLogic integration assertions', () => integration(sid)); await checked('SemaLogicView dropdown and Golden assertions', () => viewSuite(sid)) }
  await writeReport('passed'); console.log(`Obsidian test passed. Report: ${join(artifactPath, 'report.json')}`)
} catch (error) {
  await captureDiagnostics(); await writeReport('failed', error.message); console.error(`Obsidian test failed. Report: ${join(artifactPath, 'report.json')}\n${error.message}`); process.exitCode = 1
} finally {
  if (settingsBackup && await exists(settingsBackup)) await copyFile(settingsBackup, join(vaultPath, '.obsidian', 'plugins', 'semalogic', 'data.json'))
  await stopService()
}
