// Runs the pgTAP tests in supabase/tests against the linked (hosted) project
// without Docker. `supabase test db` needs Docker for pg_prove, so instead each
// file is sent with `supabase db query --linked`, with its runtests(...) call
// wrapped in a block that always raises at the end. That error carries the TAP
// output back and guarantees the whole transaction is rolled back, so tests
// never leave anything behind in the real database.
//
// --prelude <file.sql> runs that SQL first inside the same transaction, e.g. a
// migration that hasn't been applied yet, so it can be tested before pushing.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testsDir = 'supabase/tests'
const preludeIndex = process.argv.indexOf('--prelude')
const prelude = preludeIndex > -1 ? readFileSync(process.argv[preludeIndex + 1], 'utf8') : ''
const files = readdirSync(testsDir).filter((f) => f.endsWith('.test.sql'))
const workDir = mkdtempSync(join(tmpdir(), 'kura-test-db-'))
let failed = false

for (const file of files) {
  const sql = readFileSync(join(testsDir, file), 'utf8')
  const runtests = /select \* from runtests\((.+?)\);/
  if (!runtests.test(sql)) {
    console.error(`${file}: expected a "select * from runtests(...);" line`)
    failed = true
    continue
  }

  const wrapped = sql
    .replace(
      runtests,
      (_, args) => `do $kura_runner$
declare
  line text;
  output text := '';
begin
  for line in select * from runtests(${args}) loop
    output := output || line || chr(10);
  end loop;
  -- Sequences ignore rollbacks: put the SKU counter back where it was.
  perform setval('public.item_sku_seq', s.last_value, s.is_called) from pg_temp.kura_sku_seq s;
  raise exception 'KURA_TAP_BEGIN%KURA_TAP_END', output;
end
$kura_runner$;`,
    )
    .replace(/^\s*rollback;\s*$/m, '')
    .replace(
      /^begin;/m,
      () =>
        `begin;\ncreate temp table kura_sku_seq as select last_value, is_called from public.item_sku_seq;\n${prelude}\n`,
    )

  const tmpFile = join(workDir, file)
  writeFileSync(tmpFile, wrapped)
  const result = spawnSync(`npx supabase db query --linked -f "${tmpFile}"`, {
    encoding: 'utf8',
    shell: true,
  })
  const raw = `${result.stdout}\n${result.stderr}`
  const match = raw.match(/KURA_TAP_BEGIN([\s\S]*?)KURA_TAP_END/)
  if (!match) {
    console.error(`${file}: no test output. Raw response:\n${raw}`)
    failed = true
    continue
  }

  // The error text arrives JSON-escaped (sometimes twice).
  const tap = match[1]
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
  console.log(`# ${file}\n${tap}`)
  if (/^\s*not ok/m.test(tap) || /Looks like you failed/i.test(tap)) failed = true
}

rmSync(workDir, { recursive: true, force: true })
if (failed) {
  console.error('Database tests FAILED')
  process.exit(1)
}
console.log('Database tests passed')
