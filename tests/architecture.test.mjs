import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL('../'+file,import.meta.url), 'utf8')

test('se conserva el estilo y el frontend original se transforma a Vite', () => {
  const src=read('src/main.jsx')
  const pkg=JSON.parse(read('package.json'))
  assert.match(src, /from 'react-dom\/client'/)
  assert.match(src,/import '\.\/style\.css'/)
  for(const name of ['Dashboard','Members','Payments','Access','Classes','Reservations','Equipment','Reports'])
    assert.match(src,new RegExp('(function|class) '+name+'\\b'))
  assert.ok(pkg.dependencies.react && pkg.dependencies['@supabase/supabase-js'])
  assert.ok(pkg.devDependencies.vite)
})

test('roles y autorización no dependen del frontend', () => {
  const sql=read('supabase/02_pages.sql')+read('supabase/03_actions.sql')
  for(const role of ['admin','recepcion','socio']) assert.match(sql,new RegExp("v\\.role[<>!= ]+\\x27"+role+"\\x27"))
  assert.match(sql,/security definer set search_path = ''/i)
  assert.match(sql,/auth\.uid\(\)/)
  assert.match(sql,/for update/i)
  assert.match(sql,/grant execute .* to authenticated/i)
})

test('no hay clave secreta en JS del navegador', () => {
  const client=read('src/lib/supabase.js')
  assert.doesNotMatch(client,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(read('api/create-member-account.js'),/process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(read('supabase/01_schema.sql'),/enable row level security/)
})

test('Vercel redirige rutas SPA sin interceptar la API', () => {
  const c=JSON.parse(read('vercel.json'))
  assert.equal(c.framework,'vite')
  assert.equal(c.outputDirectory,'dist')
  assert.match(c.rewrites[0].source,/api/)
})
