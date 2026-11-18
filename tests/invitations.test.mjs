import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Dobles de Supabase: todas las pruebas de API son locales y no llaman al proyecto real.
function loadHandler(filename, createClient) {
  const source = fs.readFileSync(new URL('../api/' + filename, import.meta.url), 'utf8')
    .replace("import { createClient } from '@supabase/supabase-js'", '')
    .replace('export default async function handler', 'async function handler')
  return Function('createClient', source + '\nreturn handler')(createClient)
}
function makeFixture({role='recepcion',active=true,authenticated=true,exists=false,member=true,linked=false,
   profileFails=false,memberFails=false,auditFails=false,createFails=false}={}) {
  const calls = {users:[], profiles:[], members:[], audit:[], invites:[], authDeletes:[],memberDeletes:[]}
  const context = {
    auth: {
      getUser: async () => ({data:{user: authenticated?{id:'actor-uuid'}:null},error:authenticated?null:{message:'invalid'}}),
      admin: {
        createUser: async body => { calls.users.push(body);return createFails?
          {data:null,error:{message:'User already registered'}}:
          {data:{user:{id:'new-uuid'}},error:null} },
        inviteUserByEmail: async (email,options) => {calls.invites.push({email,options});return {data:{user:{id:'new-uuid'}},error:null}},
        deleteUser: async id => {calls.authDeletes.push(id);return {error:null}}
      }
    },
    from(table) {
      const b = {
        kind:'read', key:null, value:null, row:null,
        select() {this.kind=this.kind==='insert'?'insertSelect':'read';return this},
        eq(k,v) {this.key=k;this.value=v;return this},
        ilike(k,v) {this.key=k;this.value=v;return this},
        limit() {return this},
        insert(row) {this.row=row;this.kind='insert';return this},
        upsert(row) {this.row=row;this.kind='upsert';return this},
        delete() {this.kind='delete';return this},
        async maybeSingle(){
          if(table==='profiles' && this.key==='id') return {data:{id:'actor-uuid',role,is_active:active},error:null}
          if(table==='profiles' && this.key==='member_id') return {data:linked?{id:'linked'}:null,error:null}
          if(table==='members' && this.key==='id') return {data:member?{id:22,name:'Socio Existente',email:'existente@test.cl'}:null,error:null}
          return {data:null,error:null}
        },
        async single(){
          if(table==='members' && this.kind==='insertSelect') {
            if(memberFails) return {data:null,error:{code:'23502'}}
            return {data:{id:42,identifier:'GYM-0042',name:this.row.name,email:this.row.email},error:null}
          }
          return {data:null,error:null}
        },
        async run(){
          if (this.kind==='read' && table==='members' && this.key==='email') return {data:exists?[{id:2}]:[],error:null}
          if(this.kind==='delete'&&table==='members') {calls.memberDeletes.push(this.value);return {error:null}}
          if(this.kind==='insert' || this.kind==='upsert') {
            if(table==='profiles') {calls.profiles.push(this.row);return {error:profileFails?{message:'profile fail'}:null}}
            if(table==='audit_log') {calls.audit.push(this.row);return {error:auditFails?{message:'audit fail'}:null}}
          }
          return {data:null,error:null}
        },
        then(resolve,reject){return this.run().then(resolve,reject)}
      }
      return b
    }
  }
  return {calls, createClient:()=>context}
}
function request(body={}){return {method:'POST',headers:{authorization:'Bearer test-token'},body}}
function response(){return {statusCode:200,status(status){this.statusCode=status;return this},json(body){this.body=body;return this},setHeader(){}}}
async function run(filename,fixture,req){
  Object.assign(process.env,{
    VITE_SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-server-key',PUBLIC_APP_URL:'http://127.0.0.1:5173'
  })
  const res=response();await loadHandler(filename,fixture.createClient)(req,res);return res
}
const memberForm={name:'Socio Prueba',email:'socio.prueba@test.cl',phone:'912345678',password:'ClaveDemo123'}

test('recepción crea cuenta Auth, ficha con ID automático, perfil socio y auditoría',async()=>{
  const f=makeFixture();const r=await run('register-member.js',f,request({...memberForm,role:'admin',identifier:'CODIGO-FALSO'}))
  assert.equal(r.statusCode,201);assert.equal(r.body.identifier,'GYM-0042')
  assert.equal(r.body.redirect,'/members/42/account');assert.equal(f.calls.users.length,1)
  assert.equal(f.calls.users[0].email,'socio.prueba@test.cl')
  assert.equal(f.calls.profiles[0].role,'socio');assert.equal(f.calls.profiles[0].member_id,42)
  assert.equal(f.calls.audit[0].action,'REGISTRAR_SOCIO_Y_CUENTA')
  assert.equal(f.calls.authDeletes.length,0)
  assert.doesNotMatch(JSON.stringify(r.body), /ClaveDemo123/)
})
test('administrador no registra socios desde la función reservada a recepción',async()=>{
  const f=makeFixture({role:'admin'});const r=await run('register-member.js',f,request(memberForm))
  assert.equal(r.statusCode,403);assert.equal(f.calls.users.length,0)
})
test('socio y usuarios desactivados no crean cuentas',async()=>{
  for (const options of [{role:'socio'},{role:'recepcion',active:false}]){
    const f=makeFixture(options);const r=await run('register-member.js',f,request(memberForm))
    assert.equal(r.statusCode,403);assert.equal(f.calls.users.length,0)
  }
})
test('sin token o token caducado rechaza registro',async()=>{
  const f=makeFixture();const noToken=request(memberForm);noToken.headers={}
  assert.equal((await run('register-member.js',f,noToken)).statusCode,401)
  const f2=makeFixture({authenticated:false})
  assert.equal((await run('register-member.js',f2,request(memberForm))).statusCode,401)
})
test('formulario inválido o contraseña sin requisitos rechazan registro',async()=>{
  for (const input of [{...memberForm,email:'invalido'}, {...memberForm,password:'corta'}, {...memberForm,password:'solominusculas123'}]) {
    const f=makeFixture();const r=await run('register-member.js',f,request(input))
    assert.equal(r.statusCode,400);assert.equal(f.calls.users.length,0)
  }
})
test('correo ya presente en ficha impide crear usuario Auth',async()=>{
  const f=makeFixture({exists:true});const r=await run('register-member.js',f,request(memberForm))
  assert.equal(r.statusCode,409);assert.equal(f.calls.users.length,0)
})
test('fallo de registro de ficha revierte el usuario Auth',async()=>{
  const f=makeFixture({memberFails:true});const r=await run('register-member.js',f,request(memberForm))
  assert.equal(r.statusCode,500);assert.deepEqual(f.calls.authDeletes,['new-uuid'])
  assert.equal(f.calls.memberDeletes.length,0)
})
test('fallo de perfil revierte la cuenta Auth y ficha',async()=>{
  const f=makeFixture({profileFails:true});const r=await run('register-member.js',f,request(memberForm))
  assert.equal(r.statusCode,500);assert.deepEqual(f.calls.authDeletes,['new-uuid'])
  assert.deepEqual(f.calls.memberDeletes,[42])
})
test('fallo de auditoría revierte la cuenta Auth y ficha',async()=>{
  const f=makeFixture({auditFails:true});const r=await run('register-member.js',f,request(memberForm))
  assert.equal(r.statusCode,500);assert.deepEqual(f.calls.authDeletes,['new-uuid'])
  assert.deepEqual(f.calls.memberDeletes,[42])
})
test('puede invitar cuenta de socio ANTIGUO sin rol inyectable',async()=>{
  const f=makeFixture();const r=await run('create-member-account.js',f,request({member_id:22,role:'admin'}))
  assert.equal(r.statusCode,201);assert.equal(f.calls.invites[0].email,'existente@test.cl')
  assert.equal(f.calls.profiles[0].role,'socio');assert.equal(f.calls.profiles[0].member_id,22)
})
test('admin crea recepcionista con contraseña sin roles inyectados',async()=>{
  const f=makeFixture({role:'admin'});const r=await run('invite-receptionist.js',f,request({full_name:'Recepcionista Demo',email:'recepcion@test.cl',password:'ClaveDemo123',role:'admin'}))
  assert.equal(r.statusCode,201);assert.equal(f.calls.users[0].email,'recepcion@test.cl')
  assert.equal(f.calls.profiles[0].role,'recepcion')
})
test('recepción no puede crear otras cuentas de recepción',async()=>{
  const f=makeFixture({role:'recepcion'});const r=await run('invite-receptionist.js',f,request({full_name:'Otro Personal',email:'otra@test.cl',password:'ClaveDemo123'}))
  assert.equal(r.statusCode,403);assert.equal(f.calls.users.length,0)
})
