/**
 * GymControl en React 19 + Vite.
 * Se reutilizan las pantallas y el CSS original. Los datos y permisos se gestionan en Supabase.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, supabaseConfigured, getGymPage, gymAction } from './lib/supabase.js'
import './style.css'

const localToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Santiago', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
let page = 'landing'
let path = location.pathname
let user = null
let csrf = '' // Obsoleto: Supabase usa JWT y RPC autorizadas.
let flash = null
let today = localToday()
let P = {}
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL')
const readable = (s) => String(s || '').slice(0,16).replace('T', ' · ')
const dtInput = (s) => String(s || '').slice(0,16)
const timeToday = () => today
const arr = (a) => Array.isArray(a) ? a : []
const confirmSubmit = (message) => (event) => { if (!window.confirm(message)) event.preventDefault() }
const statusTag = (label, kind = '') => <span className={'tag ' + (kind ? 'tag-' + kind : '')}>{label}</span>
function CSRF(){ return null }
function Post({action, children, className, confirm, style}) {
  return <form method="post" action={action} className={className} style={style}
     onSubmit={async (e) => {
       e.preventDefault()
       if (confirm && !window.confirm(confirm)) return
       const form = Object.fromEntries(new FormData(e.currentTarget).entries())
       await submitForm(action, form)
     }}>{children}</form>
}
function Empty({ text, colSpan }){ return colSpan ? <tr><td colSpan={colSpan} className="empty">{text}</td></tr> : <div className="empty">{text}</div>; }
function Brand(){return <a className="brand" href="/"><span className="brand-mark">G<span>.</span></span><span>GYM<span className="brand-light">CONTROL</span><small>MANAGEMENT PLATFORM</small></span></a>;}
function Heading({kicker,title,description,actions}){return <div className="page-heading"><div><span className="kicker">{kicker}</span><h1>{title}</h1><p className="muted">{description}</p></div>{actions || null}</div>;}
function PanelTitle({ title, link, href, aside }){return <div className="panel-head"><h3>{title}</h3>{href ? <a href={href}>{link || 'Ver todo'} ↗</a> : aside || null}</div>;}
function Stat({label,value,sub,icon}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{sub}</small></div>;}
function BtnLink({href,children,kind='btn-primary'}){return <a className={'btn ' + kind} href={href}>{children}</a>;}
function MiniEvent({cl,reserved=false}){return <div className="mini-event"><div className="event-date"><strong>{String(cl.starts_at||'').slice(8,10)}</strong><small>{String(cl.starts_at||'').slice(5,7)}</small></div><div><strong>{cl.title}</strong><small>{cl.instructor} · {String(cl.starts_at||'').slice(11,16)}</small></div>{reserved ? statusTag('RESERVADA','green') : statusTag(cl.booked + '/' + cl.capacity)}</div>;}
function RoleLabel(){return ({admin:'Administrador',recepcion:'Recepcionista',socio:'Socio'})[user.role] || user.role;}
const NAV = {
  admin: [['/dashboard','▦','Resumen'],['/members','♙','Socios y membresías'],['/staff','♧','Gestión de personal'],['/payments','▤','Finanzas'],['/classes','▦','Clases y horarios'],['/equipment','◇','Equipamiento'],['/reports','▥','Reportes']],
  recepcion: [['/dashboard','▦','Resumen'],['/members/new','＋','Registrar socio'],['/payments/new','▤','Registrar pago'],['/access','⇥','Control de acceso'],['/classes','▦','Clases y horarios'],['/reservations','◉','Reservas de socios']],
  socio: [['/dashboard','▦','Resumen'],['/my/membership','♢','Mi membresía'],['/classes','▦','Calendario'],['/my/reservations','◉','Mis reservas'],['/my/payments','▤','Mis pagos'],['/my/attendance','↗','Mi asistencia']]
};
const CRUMBS = { dashboard:'PANEL PRINCIPAL',members:'SOCIOS / MEMBRESÍAS',member_detail:'SOCIOS / FICHA',payments:'FINANZAS / PAGOS',payment_form:'RECEPCIÓN / PAGOS',receipt:'PAGOS / COMPROBANTE',access:'RECEPCIÓN / ACCESO',classes:'ACTIVIDADES / CALENDARIO',class_form:'ACTIVIDADES / EDITAR',reservations:'ACTIVIDADES / RESERVAS',equipment:'OPERACIÓN / EQUIPOS',reports:'ANÁLISIS / REPORTES',staff:'ADMINISTRACIÓN / PERSONAL',member_account:'RECEPCIÓN / CUENTA DEL SOCIO',set_password:'ACCESO / CONTRASEÑA',my_membership:'MI ESPACIO / MEMBRESÍA',my_payments:'MI ESPACIO / PAGOS',my_attendance:'MI ESPACIO / ASISTENCIA',form:'REGISTRO',error:'ERROR'};
class Layout extends React.Component {
  constructor(props){super(props);this.state={menu:false,flashVisible:!!flash};}
  render(){
    const nav = NAV[user.role] || [];
    return <div className="app-layout">
      <aside className={'sidebar ' + (this.state.menu ? 'sidebar-open' : '')} id="sidebar">
        <Brand/><div className="sidebar-caption">ESPACIO DE TRABAJO</div>
        <nav className="nav" aria-label="Menú principal">{nav.map(([url,glyph,text]) => {
          const active = url==='/dashboard' ? path === url : path===url || (url!='/members/new' && url!='/payments/new' && path.startsWith(url+'/'));
          return <a key={url} href={url} className={'nav-link ' + (active?'active':'')}><span className="nav-glyph">{glyph}</span>{text}</a>;
        })}</nav>
        <div className="sidebar-spacer"></div><div className="sidebar-mini"><span className="live-dot"></span>Plataforma académica <small>Versión MVP · entorno de pruebas</small></div>
        <div className="sidebar-profile"><div className="avatar">{(user.full_name||'G')[0].toUpperCase()}</div><div className="profile-text"><strong>{user.full_name}</strong><small><RoleLabel/></small></div></div>
      </aside>
      <div className="page-shell"><header className="topbar"><div className="topbar-start"><button className="menu-toggle" type="button" aria-label="Abrir menú" aria-controls="sidebar" aria-expanded={this.state.menu} onClick={()=>this.setState({menu:!this.state.menu})}>☰</button><span className="breadcrumbs">GESTIÓN / <strong>{CRUMBS[page]||'RESUMEN'}</strong></span></div><div className="top-actions"><span className="top-date">{today.split('-').reverse().join(' / ')}</span><span className="role-chip">{({admin:'ADMIN',recepcion:'RECEPCIÓN',socio:'SOCIO'})[user.role]}</span><Post action="/logout"><button className="logout-btn" type="submit" title="Cerrar sesión">Salir ↗</button></Post></div></header>
      <main className="main-area" id="main">{this.state.flashVisible && flash && <div className={'alert alert-'+flash.kind} role="status">{flash.message}<button type="button" className="alert-dismiss" aria-label="Cerrar aviso" onClick={()=>this.setState({flashVisible:false})}>×</button></div>}<View/></main>
      <footer className="footer">GymControl · Prototipo académico basado en casos de uso CU01–CU16 <span>Diseñado para crecer contigo.</span></footer>
      </div>
    </div>;
  }
}
function Landing(){return <div className="public-layout"><div className="public-nav wrap"><Brand/><BtnLink href="/login" kind="btn-outline">Entrar a la plataforma <span>↗</span></BtnLink></div><main>
  <section className="hero wrap"><div className="hero-copy"><div className="eyebrow"><span className="live-dot"></span> SISTEMA DE GESTIÓN INTEGRAL</div><h1>MENOS ADMINISTRACIÓN.<br/><em>MÁS MOVIMIENTO.</em></h1><p>Una sola plataforma para organizar socios, membresías, pagos, clases, accesos y mantenimiento de equipos. Toda tu operación, bajo control.</p><div className="hero-actions"><BtnLink href="/login" kind="btn-lime btn-large">Explorar plataforma <span>↗</span></BtnLink><span className="hero-caption">Prototipo funcional · Ingeniería de Software</span></div><div className="hero-proof"><span>01 / CONTROL DE SOCIOS</span><span>02 / CLASES EN VIVO</span><span>03 / GESTIÓN CENTRALIZADA</span></div></div>
  <div className="hero-art" aria-hidden="true"><div className="art-orbit orb1"></div><div className="art-orbit orb2"></div><div className="art-triangle">G<span>.</span></div><div className="floating-metric"><small>VISIÓN OPERATIVA</small><strong>360°</strong><span>Información en un solo lugar</span></div><div className="floating-status"><span className="live-dot"></span> OPERACIÓN CONECTADA</div></div></section>
  <section className="features wrap"><div className="section-kicker">UNA PLATAFORMA. TODO EL GIMNASIO.</div><div className="feature-grid">{[['01','▦','Membresías y socios','Historial, vigencias y seguimiento de inscripciones desde una misma pantalla.'],['02','◉','Clases y reservas','Horarios, cupos disponibles y reservas sin duplicaciones.'],['03','⇥','Accesos y pagos','Control de entradas basado en vigencia y registro seguro de pagos recibidos.'],['04','◇','Mantenimiento','Equipos operativos, revisiones programadas y trazabilidad de intervenciones.']].map(([num,glyph,title,desc])=><article className="feature" key={num}><span className="feature-num">{num}</span><div className="feature-icon">{glyph}</div><h3>{title}</h3><p>{desc}</p></article>)}</div></section>
  <section className="bottom-cta wrap"><div><span className="section-kicker">EL SIGUIENTE PASO</span><h2>TU GIMNASIO.<br/>TU CONTROL.</h2></div><BtnLink href="/login" kind="btn-lime btn-large">Acceder al sistema ↗</BtnLink></section>
</main><footer className="public-footer wrap">GymControl · Proyecto académico · No representa un gimnasio comercial real.</footer></div>;}
class Login extends React.Component {
  constructor(props){super(props);this.state={username:'',password:''};}
  render(){return <div className="public-layout"><div className="login-grid"><div className="login-branding"><Brand/><div><span className="eyebrow"><span className="live-dot"></span> CONTROL, DESDE EL PRIMER INGRESO</span><h1>UN SOLO<br/>ACCESO.<br/><em>TODA LA<br/>OPERACIÓN.</em></h1><p>Una experiencia distinta para administración, recepción y socios. Cada función en el lugar correcto.</p></div><div className="public-footer">GymControl · Plataforma académica</div></div>
  <div className="login-area"><div className="login-card"><span className="kicker">BIENVENIDO/A</span><h2>Inicia sesión</h2><p className="muted">Accede con tu correo y contraseña de Supabase.</p>{P.error && <div className="alert alert-error">{P.error}</div>}
  <Post action="/login"><label>Correo de usuario<input type="email" name="username" placeholder="usuario@gym.local" autoComplete="username" required value={this.state.username} onChange={e=>this.setState({username:e.target.value})}/></label><label>Contraseña<input type="password" name="password" placeholder="Tu contraseña" autoComplete="current-password" required value={this.state.password} onChange={e=>this.setState({password:e.target.value})}/></label><button className="btn btn-lime btn-block" type="submit">Acceder a mi panel <span>↗</span></button></Post>
  <div className="demo-box"><strong>ACCESO A TU CUENTA</strong><p>Las cuentas se administran desde Supabase Auth. Contacta al administrador si todavía no tienes acceso.</p>{!supabaseConfigured && <p className="alert alert-error">Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.</p>}</div><a href="/" className="back-link">← Volver a inicio</a></div></div></div></div>;
  }
}
function Dashboard(){const member=!!P.member_mode;const s=P.stats||{};return <div>
  <Heading kicker={'CENTRO DE CONTROL / '+user.role.toUpperCase()} title={<span>Hola, {(user.full_name||'').split(' ')[0]} <span className="heading-accent">✳</span></span>} description={member?'Este es tu espacio personal. Revisa tu progreso y planifica tu próxima sesión.':'Aquí tienes una visión general de lo que ocurre en el gimnasio.'} actions={<span className="date-card">HOY <strong>{today}</strong></span>}/>
  {member ? <div><div className="grid-two main-top"><div className="big-promo"><span className="kicker">TU MEMBRESÍA</span><h2>{P.member_membership ? P.member_membership.plan_name : 'Sin plan asignado'}</h2><p>{P.membership_reason || 'Membresía activa para seguir entrenando.'}</p><div className="promo-footer"><span>{P.member_membership ? "VENCE EL " : ""}{P.member_membership && <b>{P.member_membership.ends_on}</b>}</span><BtnLink kind="btn-dark" href="/my/membership">Ver detalles ↗</BtnLink></div></div><div className="panel"><PanelTitle title="Próximas clases" href="/classes" link="Ver calendario"/>{arr(P.bookings).map(cl=><MiniEvent key={cl.id} cl={cl} reserved/>)}{!arr(P.bookings).length&&<Empty text="Aún no hay clases reservadas. Explora las actividades."/>}</div></div>
    <div className="grid-two"><div className="panel"><PanelTitle title="Últimos pagos" href="/my/payments"/><div className="table-scroll"><table><thead><tr><th>Concepto</th><th>Fecha</th><th>Importe</th></tr></thead><tbody>{arr(P.payments).map(p=><tr key={p.id}><td>{p.concept}</td><td>{p.paid_on}</td><td>{money(p.amount)}</td></tr>)}{!arr(P.payments).length&&<Empty colSpan={3} text="Sin pagos registrados."/>}</tbody></table></div></div><div className="panel"><PanelTitle title="Asistencia reciente" href="/my/attendance" link="Mi historial"/>{arr(P.last_att).map(a=><div className="list-row" key={a.id}><span className="round-icon">↗</span><div><strong>Entrada al gimnasio</strong><small>{readable(a.entered_at)}</small></div>{statusTag('REGISTRADA','green')}</div>)}{!arr(P.last_att).length&&<Empty text="Todavía no hay asistencias registradas."/>}</div></div></div>
  : <div><div className="stats-grid"><Stat label="SOCIOS REGISTRADOS" value={s.members||0} sub="Base total de socios" icon="♙"/><Stat label="MEMBRESÍAS VIGENTES" value={s.active||0} sub="Planes habilitados actualmente" icon="✓"/><Stat label="CLASES PRÓXIMAS" value={s.classes||0} sub="Actividades programadas" icon="▦"/><Stat label="ENTRADAS DE HOY" value={s.today_att||0} sub="Accesos registrados" icon="⇥"/></div><div className="grid-two main-top"><div className="big-promo"><span className="kicker">VISIÓN DEL NEGOCIO</span><h2>GESTIONA.<br/>CRECE. <span>MEJORA.</span></h2><p>Centraliza la información del gimnasio y gana tiempo para enfocarte en tus socios.</p><div className="promo-footer"><span>INGRESOS CONFIRMADOS <b>{money(s.revenue)}</b></span><BtnLink kind="btn-dark" href={user.role==='admin'?'/reports':'/access'}>{user.role==='admin'?'Ver reportes':'Control de acceso'} ↗</BtnLink></div></div><div className="panel"><PanelTitle title="Próximas actividades" href="/classes" link="Ver clases"/>{arr(P.upcoming).map(cl=><MiniEvent key={cl.id} cl={cl}/>)}{!arr(P.upcoming).length&&<Empty text="No hay actividades próximas."/>}</div></div>
    {user.role==='admin'&&<div className="panel"><PanelTitle title="Membresías por vencer (próximos 7 días)"/><div className="table-scroll"><table><thead><tr><th>SOCIO</th><th>CÓDIGO</th><th>VENCIMIENTO</th></tr></thead><tbody>{arr(P.expiring).map(m=><tr key={m.identifier}><td><strong>{m.name}</strong></td><td className="mono">{m.identifier}</td><td>{statusTag(m.ends_on,'amber')}</td></tr>)}{!arr(P.expiring).length&&<Empty colSpan={3} text="No hay membresías por vencer en los próximos siete días."/>}</tbody></table></div></div>}
    <div className="panel"><PanelTitle title="Movimientos recientes" href={user.role==='admin'?'/payments':'/payments/new'} link={user.role==='admin'?'Ver finanzas':'Registrar un pago'}/><div className="table-scroll"><table><thead><tr><th>SOCIO</th><th>CONCEPTO</th><th>FECHA</th><th>ESTADO</th><th>IMPORTE</th></tr></thead><tbody>{arr(P.recent).map(p=><tr key={p.id}><td><strong>{p.member_name}</strong></td><td>{p.concept}</td><td>{p.paid_on}</td><td>{statusTag(p.status.toUpperCase(),'green')}</td><td><strong>{money(p.amount)}</strong></td></tr>)}{!arr(P.recent).length&&<Empty colSpan={5} text="No existen pagos registrados."/>}</tbody></table></div></div></div>}
</div>;}
function Members(){return <div><Heading kicker="CU01 · ADMINISTRACIÓN" title={<span>Socios <span className="heading-accent">&</span> membresías</span>} description="Consulta las fichas, asigna planes y revisa vencimientos." actions={<span className="chip-muted">{arr(P.rows).length} resultados</span>}/><div className="panel"><form className="filters" method="get"><label className="search-field"><span>⌕</span><input name="q" defaultValue={P.q||''} placeholder="Buscar por nombre, código o correo"/></label><button className="btn btn-primary" type="submit">Buscar</button><BtnLink kind="btn-subtle" href="/members">Limpiar</BtnLink></form><div className="table-scroll"><table><thead><tr><th>IDENTIFICADOR</th><th>SOCIO</th><th>PLAN</th><th>VENCIMIENTO</th><th>ESTADO</th><th></th></tr></thead><tbody>{arr(P.rows).map(m=><tr key={m.id}><td><span className="mono">{m.identifier}</span></td><td><strong>{m.name}</strong><span className="sub-cell">{m.email}</span></td><td>{m.plan_name||'Sin plan'}</td><td>{m.ends_on||'—'}</td><td>{!m.ends_on?statusTag('SIN MEMBRESÍA'):m.m_status==='suspended'?statusTag('SUSPENDIDA','amber'):m.starts_on>today?statusTag('AÚN NO INICIA','amber'):m.m_status==='active'&&m.ends_on>=today?statusTag('VIGENTE','green'):statusTag('VENCIDA / INACTIVA','red')}</td><td><a className="table-link" href={'/members/'+m.id}>Abrir ficha ↗</a></td></tr>)}{!arr(P.rows).length&&<Empty colSpan={6} text="No hay socios coincidentes."/>}</tbody></table></div></div></div>;}
function MembershipInfo({mb, reason, hasHead=false}){return <div className="membership-card">{hasHead?<div className="membership-head"><span className="kicker">GYMCONTROL / MEMBER PASS</span><span className="brand-mark small">G<span>.</span></span></div>:<span className="kicker">PLAN {mb.plan_name.toUpperCase()}</span>}<h2>{mb.plan_name}</h2>{hasHead&&statusTag(reason||'VIGENTE',reason?'amber':'green')}<div className="detail-grid"><div><small>INICIO</small><strong>{mb.starts_on}</strong></div><div><small>VENCIMIENTO</small><strong>{mb.ends_on}</strong></div><div><small>COBERTURA</small><strong>{mb.coverage}</strong></div><div><small>ESTADO</small><strong>{mb.status.toUpperCase()}</strong></div></div></div>;}
function MemberDetail(){const m=P.member||{};return <div><Heading kicker={'CU01 · FICHA '+m.identifier} title={m.name} description="Edita los datos personales y gestiona la membresía de forma independiente al pago." actions={<BtnLink kind="btn-outline" href="/members">← Volver</BtnLink>}/><div className="grid-two"><div className="panel"><PanelTitle title="Datos del socio"/><Post action={'/members/'+m.id+'/update'} className="stack-form"><label>Nombre<input required name="name" defaultValue={m.name}/></label><label>Correo electrónico<input type="email" required name="email" defaultValue={m.email}/></label><label>Teléfono<input name="phone" defaultValue={m.phone}/></label><button className="btn btn-primary" type="submit">Guardar cambios</button></Post></div><div className="panel"><PanelTitle title="Membresía actual"/>{P.mb?<MembershipInfo mb={P.mb}/>:<Empty text="Este socio todavía no tiene membresía."/>}<hr className="soft"/><h4>Asignar / renovar</h4><Post action={'/members/'+m.id+'/membership'} className="stack-form"><label>Plan<select name="plan_id" required>{arr(P.plans).map(p=><option key={p.id} value={p.id}>{p.name} — {p.coverage}</option>)}</select></label><div className="form-grid"><label>Fecha de inicio<input type="date" name="starts_on" defaultValue={today} required/></label><label>Fecha de término<input type="date" name="ends_on" required/></label></div><label>Estado<select name="status"><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="inactive">Inactiva</option></select></label><p className="hint">Crear o renovar un plan no implica registrar un pago (CU09).</p><button className="btn btn-primary" type="submit">Asignar membresía</button></Post></div></div><div className="panel narrow-panel" style={{marginLeft:0}}><PanelTitle title="Cuenta para el portal del socio"/>{P.account?<p className="muted">Este socio puede iniciar sesión como <strong>{P.account.username}</strong>.</p>:<div><p className="muted">Envía una invitación al correo registrado del socio. La persona establecerá su propia contraseña; nadie del personal necesita conocerla.</p><Post action={'/members/'+m.id+'/account'} className="stack-form" confirm={`¿Enviar invitación de acceso a ${m.email}?`}><button className="btn btn-primary" type="submit">Enviar invitación al socio ↗</button></Post></div>}</div><div className="panel"><PanelTitle title="Historial de cambios de membresía"/><div className="table-scroll"><table><thead><tr><th>FECHA</th><th>RESPONSABLE</th><th>CAMBIO REGISTRADO</th></tr></thead><tbody>{arr(P.history).map(x=><tr key={x.id}><td>{x.changed_at}</td><td>{x.actor}</td><td><span className="mono">{typeof x.after_data==='string'?x.after_data:JSON.stringify(x.after_data)}</span></td></tr>)}{!arr(P.history).length&&<Empty colSpan={3} text="No hay modificaciones registradas."/>}</tbody></table></div></div></div>;}
function RegisterMember(){
  return <div>
    <Heading kicker={P.subtitle} title={P.title} description="Registra la ficha y crea la cuenta del socio en un solo paso."/>
    <div className="panel narrow-panel">
      <Post action="/members/new" className="stack-form" confirm="¿Registrar este socio y crear su cuenta de acceso?">
        <label>Identificador del socio
          <input type="text" value="Se genera automáticamente al guardar" readOnly aria-label="Identificador generado automáticamente"/>
        </label>
        <label>Nombre completo<span className="required"> *</span>
          <input type="text" name="name" placeholder="Nombre y apellido" minLength="2" maxLength="200" autoComplete="name" required/>
        </label>
        <label>Correo electrónico<span className="required"> *</span>
          <input type="email" name="email" placeholder="socio@ejemplo.cl" maxLength="180" autoComplete="off" required/>
        </label>
        <label>Teléfono
          <input type="tel" name="phone" placeholder="+56 9 1234 5678" maxLength="40" autoComplete="tel"/>
        </label>
        <label>Contraseña inicial<span className="required"> *</span>
          <input type="password" name="password" placeholder="Mínimo 8 caracteres, con mayúscula, minúscula y número"
            minLength="8" maxLength="128" autoComplete="new-password" required/>
        </label>
        <p className="hint">El código GYM- se asignará automáticamente. El socio podrá ingresar con su correo y contraseña inicial. Entrégasela de forma privada y recomiéndale cambiarla. La membresía y el pago se registran aparte.</p>
        <button className="btn btn-lime" type="submit">Registrar socio y crear cuenta ↗</button>
      </Post>
    </div>
  </div>
}
function MemberAccount(){const m=P.member||{};return <div><Heading kicker="CU08 + CU11 · ACCESO DEL SOCIO" title="Cuenta del socio" description="Consulta el código generado y la cuenta de acceso de este socio." actions={<BtnLink kind="btn-outline" href="/members/new">← Registrar otro socio</BtnLink>}/><div className="panel narrow-panel"><PanelTitle title={m.name||'Socio registrado'}/><p className="muted"><strong>{m.identifier}</strong> · {m.email}</p>{P.account?<div><p>{statusTag('CUENTA CREADA','green')}</p><p className="muted">Correo de acceso: <strong>{P.account.username}</strong>. Si necesita recuperar la contraseña, deberá utilizar el proceso de recuperación de Supabase.</p></div>:<div><p className="muted">Este socio fue registrado antes de que se habilitara la creación directa de cuentas. Puedes enviar una invitación para activar su acceso. La membresía la asigna el administrador por separado.</p><Post action={'/members/'+m.id+'/account'} confirm={`¿Enviar invitación a ${m.email}?`}><button className="btn btn-lime" type="submit">Enviar invitación de acceso ↗</button></Post></div>}</div></div>}

function Staff() {
  return (
    <div>
      <Heading
        kicker="ADMINISTRACIÓN · PERSONAL"
        title={
          <span>
            Gestión de <span className="heading-accent">personal</span>
          </span>
        }
        description="Crea y administra cuentas de recepción."
        actions={
          <span className="chip-muted">
            {arr(P.rows).length} RECEPCIONISTAS
          </span>
        }
      />

      <div className="grid-two">
        <div className="panel">
          <PanelTitle title="Registrar recepcionista" />

          <Post
            action="/staff/invite"
            className="stack-form"
            confirm="¿Crear esta cuenta de recepcionista?"
          >
            <label>
              Nombre completo <span className="required">*</span>
              <input
                name="full_name"
                placeholder="Nombre y apellido"
                minLength="2"
                maxLength="150"
                autoComplete="name"
                required
              />
            </label>

            <label>
              Correo electrónico <span className="required">*</span>
              <input
                name="email"
                type="email"
                placeholder="recepcionista@ejemplo.cl"
                maxLength="180"
                autoComplete="off"
                required
              />
            </label>

            <label>
              Contraseña inicial <span className="required">*</span>
              <input
                name="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                minLength="8"
                maxLength="128"
                autoComplete="new-password"
                required
              />
            </label>

            <p className="hint">
              El recepcionista podrá iniciar sesión inmediatamente.
              Su rol será recepción y no tendrá permisos de administrador.
              Utiliza una contraseña temporal y entrégala de forma privada.
            </p>

            <button className="btn btn-lime" type="submit">
              Crear recepcionista ↗
            </button>
          </Post>
        </div>

        <div className="panel">
          <PanelTitle title="Cuentas de recepción" />

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PERSONAL</th>
                  <th>ESTADO</th>
                  <th>ACCIÓN</th>
                </tr>
              </thead>

              <tbody>
                {arr(P.rows).map(r => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.full_name}</strong>
                      <span className="sub-cell">{r.email}</span>
                    </td>

                    <td>
                      {statusTag(
                        r.is_active ? 'ACTIVA' : 'DESACTIVADA',
                        r.is_active ? 'green' : 'amber'
                      )}
                    </td>

                    <td>
                      <Post
                        action={'/staff/' + r.id + '/status'}
                        confirm={
                          `¿${r.is_active ? 'Desactivar' : 'Activar'} ` +
                          `la cuenta de ${r.full_name}?`
                        }
                      >
                        <input
                          type="hidden"
                          name="enabled"
                          value={r.is_active ? 'false' : 'true'}
                        />

                        <button
                          className={
                            r.is_active ? 'btn-link-danger' : 'btn-link'
                          }
                          type="submit"
                        >
                          {r.is_active ? 'Desactivar' : 'Activar'} ↗
                        </button>
                      </Post>
                    </td>
                  </tr>
                ))}

                {!arr(P.rows).length && (
                  <Empty
                    colSpan={3}
                    text="Todavía no hay recepcionistas registrados."
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function SetPassword(){return <div className="public-layout"><div className="login-grid"><div className="login-branding"><Brand/><div><span className="eyebrow">ACTIVACIÓN DE CUENTA</span><h1>EMPIEZA<br/><em>AQUÍ.</em></h1><p>Establece tu contraseña personal para acceder a GymControl.</p></div></div><div className="login-area"><div className="login-card"><span className="kicker">INVITACIÓN DE ACCESO</span><h2>Crear contraseña</h2><p className="muted">Abre este enlace desde el correo de invitación. Debes tener una sesión de invitación válida.</p>{P.error&&<div className="alert alert-error">{P.error}</div>}<Post action="/set-password" className="stack-form"><label>Nueva contraseña<input name="password" type="password" minLength="10" maxLength="128" autoComplete="new-password" required/></label><label>Confirmar contraseña<input name="confirm_password" type="password" minLength="10" maxLength="128" autoComplete="new-password" required/></label><button className="btn btn-lime btn-block" type="submit">Guardar contraseña y continuar ↗</button></Post><a href="/login" className="back-link">← Ir al inicio de sesión</a></div></div></div></div>}
function Payments(){const t=P.totals||{};return <div><Heading kicker="CU02 · CONTROL FINANCIERO" title="Registro de pagos" description="Consulta pagos confirmados, pendientes y rechazados por período."/><div className="stats-grid stats-three"><Stat label="INGRESOS CONFIRMADOS" value={money(t.confirmed)} sub="No incluye pagos no confirmados" icon="✓"/><Stat label="PAGOS PENDIENTES" value={money(t.pending)} sub="Saldo pendiente del filtro" icon="···"/><Stat label="PAGOS RECHAZADOS" value={money(t.rejected)} sub="Excluidos de ingresos reales" icon="×"/></div><div className="panel"><form className="filters" method="get"><label>Desde<input type="date" name="from_date" defaultValue={P.from_date||''}/></label><label>Hasta<input type="date" name="to_date" defaultValue={P.to_date||''}/></label><label>Estado<select name="status" defaultValue={P.status_filter||''}><option value="">Todos</option><option value="confirmed">Confirmado</option><option value="pending">Pendiente</option><option value="rejected">Rechazado</option></select></label><label className="search-field"><input name="q" defaultValue={P.q||''} placeholder="Socio o concepto"/></label><button className="btn btn-primary" type="submit">Filtrar</button></form><div className="table-scroll"><table><thead><tr><th>REFERENCIA</th><th>SOCIO</th><th>CONCEPTO</th><th>FECHA</th><th>ESTADO</th><th>IMPORTE</th><th></th></tr></thead><tbody>{arr(P.rows).map(p=><tr key={p.id}><td className="mono">#{p.public_id}</td><td><strong>{p.member_name}</strong></td><td>{p.concept}</td><td>{p.paid_on}</td><td>{statusTag(p.status.toUpperCase(),p.status==='confirmed'?'green':p.status==='rejected'?'red':'amber')}</td><td><strong>{money(p.amount)}</strong></td><td><a className="table-link" href={'/receipts/'+p.id}>Detalle ↗</a></td></tr>)}{!arr(P.rows).length&&<Empty colSpan={7} text="No hay pagos para este período."/>}</tbody></table></div></div></div>;}
function PaymentForm(){return <div><Heading kicker="CU09 · OPERACIÓN DE CAJA" title="Registrar pago recibido" description="Verifica el importe y la referencia antes de confirmar. Esta función es para pagos ya recibidos."/><div className="panel narrow-panel"><Post action="/payments/new" className="stack-form"><label>Socio <span className="required">*</span><select name="member_id" required defaultValue=""><option value="">Selecciona socio</option>{arr(P.members).map(m=><option key={m.id} value={m.id}>{m.identifier} · {m.name}</option>)}</select></label><label>Concepto <span className="required">*</span><input name="concept" placeholder="Ej. Mensualidad" required/></label><div className="form-grid"><label>Monto (CLP) <span className="required">*</span><input type="number" min="1" name="amount" required/></label><label>Fecha de pago <span className="required">*</span><input name="paid_on" type="date" defaultValue={today} required/></label></div><label>Medio de pago <span className="required">*</span><select name="method" required><option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option><option value="Tarjeta presencial">Tarjeta presencial</option></select></label><label>Referencia única <small>(opcional)</small><input name="reference" placeholder="Código de operación o transferencia"/></label><label className="checkline"><input type="checkbox" value="yes" name="confirmed" required/>Confirmo que el pago fue recibido efectivamente</label><button type="submit" className="btn btn-lime">Confirmar pago y emitir comprobante ↗</button></Post><p className="hint">No se realizan cargos a tarjetas ni se almacena información bancaria en el sistema.</p></div></div>;}
function Receipt(){const p=P.p||{};return <div><Heading kicker="CU09 · COMPROBANTE DE REGISTRO" title="Comprobante de pago" description="Constancia del pago recibido y registrado en el sistema." actions={<button type="button" className="btn btn-primary" onClick={()=>window.print()}>Imprimir ↗</button>}/><div className="panel receipt-panel"><div className="receipt-top"><span className="brand-mark">G<span>.</span></span><div><strong>GYMCONTROL</strong><small>COMPROBANTE DE OPERACIÓN</small></div>{statusTag((p.status||'').toUpperCase(),'green')}</div><h2>{money(p.amount)}</h2><p className="muted">Pago registrado · Folio <span className="mono">{p.public_id}</span></p><div className="receipt-details">{[['SOCIO',p.member_name],['IDENTIFICADOR',p.member_code],['CONCEPTO',p.concept],['FECHA',p.paid_on],['MÉTODO',p.method],['REGISTRADO POR',p.cashier],...(p.reference?[['REFERENCIA',p.reference]]:[])].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="hint">Documento interno del sistema. No constituye una boleta tributaria electrónica.</p></div></div>;}
function Access(){const c=P.checked;return <div><Heading kicker="CU06 + CU07 · CONTROL DE INGRESO" title="Control de acceso" description="Verifica vigencia y cobertura de la membresía antes de registrar el ingreso." actions={<span className="chip-muted">VERIFICACIÓN EN DOS PASOS</span>}/><div className="grid-two"><div className="panel"><PanelTitle title="Buscar socio"/><Post action="/access" className="stack-form"><input type="hidden" name="action" value="check"/><label>Identificador del socio<input autoFocus name="identifier" placeholder="GYM-001" defaultValue={P.entered||''} required/></label><button className="btn btn-primary" type="submit">Verificar membresía ↗</button></Post><p className="hint">Se evitan entradas duplicadas en un intervalo de cinco minutos; cada acceso confirmado queda en el historial.</p></div><div className="panel access-result"><PanelTitle title="Resultado de verificación"/>{P.error?<div className="access-status denied"><span>×</span><h3>Socio no encontrado</h3><p>{P.error}</p></div>:c?<div><div className={'access-status '+(P.allowed?'granted':'denied')}><span>{P.allowed?'✓':'×'}</span><h3>{c.name}</h3><p><strong>{c.identifier}</strong> · {P.result}</p></div>{P.allowed&&!P.confirmed&&<Post action="/access"><input type="hidden" name="action" value="confirm"/><input type="hidden" name="identifier" value={c.identifier}/><button type="submit" className="btn btn-lime btn-block">Confirmar entrada ahora ↗</button></Post>}{P.confirmed&&<p className="success-msg">✓ Entrada almacenada con fecha, hora y recepcionista.</p>}</div>:<div className="access-placeholder"><span>⇥</span><h3>Esperando validación</h3><p>Busca el código del socio para comprobar si puede ingresar.</p></div>}</div></div></div>;}
function Classes(){return <div><Heading kicker="CU03 · CU13 · CU14" title={<span>Clases <span className="heading-accent">&</span> horarios</span>} description="Explora las actividades, consulta cupos y gestiona tus sesiones." actions={user.role==='admin'?<BtnLink kind="btn-lime" href="/classes/new">+ Crear clase</BtnLink>:user.role==='socio'?<BtnLink kind="btn-outline" href="/my/reservations">Mis reservas ↗</BtnLink>:null}/><div className="panel"><form className="filters" method="get"><label>Fecha<input type="date" name="from_date" defaultValue={P.from_date||''}/></label><label>Actividad<input name="activity" placeholder="Funcional, Yoga..." defaultValue={P.activity||''}/></label><label>Instructor<input name="instructor" placeholder="Buscar instructor" defaultValue={P.instructor||''}/></label><button className="btn btn-primary" type="submit">Filtrar</button><BtnLink kind="btn-subtle" href="/classes">Limpiar</BtnLink></form></div><div className="classes-grid">{arr(P.rows).map(cl=><article className="class-card" key={cl.id}><div className="class-card-top"><span className="kicker">ACTIVIDAD / {String(cl.id).padStart(2,'0')}</span>{statusTag(cl.status==='cancelled'?'CANCELADA':cl.booked>=cl.capacity?'COMPLETA':'DISPONIBLE',cl.status==='cancelled'?'red':cl.booked>=cl.capacity?'amber':'green')}</div><div className="class-symbol">{cl.title.slice(0,1).toUpperCase()}<span>✳</span></div><h2>{cl.title}</h2><p className="muted">{cl.instructor}</p><div className="class-metadata"><div><span>FECHA / HORA</span><strong>{readable(cl.starts_at)}</strong></div><div><span>ESPACIO</span><strong>{cl.room}</strong></div></div><div className="capacity-line"><div><small>OCUPACIÓN</small><strong>{cl.booked} / {cl.capacity} cupos</strong></div><div className="progress"><i style={{width:(100*cl.booked/cl.capacity)+'%'}}></i></div></div><div className="class-actions">{user.role==='socio'?(arr(P.my_reserved).includes(cl.id)?statusTag('✓ YA RESERVADA','green'):cl.status==='published'&&cl.booked<cl.capacity&&cl.starts_at>P.now?<Post action={'/classes/'+cl.id+'/reserve'}><button className="btn btn-lime btn-block" type="submit">Reservar cupo ↗</button></Post>:<span className="muted">No disponible para reservar</span>):user.role==='admin'?[<BtnLink key={'edit'+cl.id} href={'/classes/'+cl.id+'/edit'}>Editar</BtnLink>, cl.status==='published'&&<Post key={'cancel'+cl.id} action={'/classes/'+cl.id+'/cancel'} confirm="¿Cancelar esta clase y todas sus reservas?"><input type="hidden" name="confirm" value="yes"/><button type="submit" className="btn btn-outline-danger">Cancelar clase</button></Post>]:<BtnLink href="/reservations">Gestionar reservas ↗</BtnLink>}</div></article>)}{!arr(P.rows).length&&<div className="panel empty full-width">No encontramos actividades para los filtros seleccionados.</div>}</div></div>;}
function ClassForm(){const c=P.cl||{};return <div><Heading kicker="CU03 · GESTIÓN DE CLASES" title={P.cl?'Editar clase':'Nueva clase'} description="No se admiten cruces de sala o instructor ni cupos menores que las reservas vigentes." actions={<BtnLink kind="btn-outline" href="/classes">← Volver a clases</BtnLink>}/><div className="panel narrow-panel"><Post action={P.cl?'/classes/'+c.id+'/edit':'/classes/new'} className="stack-form"><label>Nombre de la actividad<input required name="title" defaultValue={c.title||''} placeholder="Ej. Funcional"/></label><div className="form-grid"><label>Instructor<input required name="instructor" defaultValue={c.instructor||''}/></label><label>Sala o espacio<input required name="room" defaultValue={c.room||''}/></label></div><div className="form-grid"><label>Inicio<input type="datetime-local" required name="starts_at" defaultValue={dtInput(c.starts_at)}/></label><label>Término<input type="datetime-local" required name="ends_at" defaultValue={dtInput(c.ends_at)}/></label></div><label>Cupo máximo<input type="number" min="1" required name="capacity" defaultValue={c.capacity||12}/></label><button className="btn btn-lime" type="submit">{P.cl?'Guardar cambios':'Publicar clase'} ↗</button></Post></div></div>;}
function Reservations(){return <div><Heading kicker={P.owner?'CU15 · MIS ACTIVIDADES':'CU10 · RECEPCIÓN'} title={P.owner?'Mis reservas':'Gestión de reservas'} description="Control de cupos en tiempo real y cancelaciones antes del inicio de cada clase." actions={P.owner?<BtnLink kind="btn-lime" href="/classes">+ Reservar clase</BtnLink>:null}/>{!P.owner&&<div className="panel"><PanelTitle title="Reservar para un socio"/><Post action="/reservations" className="filters"><label>Socio<select name="member_id" required defaultValue=""><option value="">Seleccionar</option>{arr(P.members).map(m=><option value={m.id} key={m.id}>{m.identifier} · {m.name}</option>)}</select></label><label>Clase disponible<select name="class_id" required defaultValue=""><option value="">Seleccionar</option>{arr(P.classes).map(c=><option key={c.id} value={c.id} disabled={c.booked>=c.capacity}>{c.title} · {readable(c.starts_at)} ({c.capacity-c.booked} cupos)</option>)}</select></label><button className="btn btn-lime" type="submit">Confirmar reserva ↗</button></Post></div>}<div className="panel"><PanelTitle title={P.owner?'Tu historial de reservas':'Reservas registradas'}/><div className="table-scroll"><table><thead><tr>{!P.owner&&<th>SOCIO</th>}<th>CLASE</th><th>HORARIO</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{arr(P.rows).map(r=><tr key={r.id}>{!P.owner&&<td><strong>{r.member_name}</strong></td>}<td><strong>{r.title}</strong>{P.owner&&<span className="sub-cell">{r.instructor} · {r.room}</span>}</td><td>{readable(r.starts_at)}</td><td>{statusTag(r.status==='active'?'CONFIRMADA':'CANCELADA',r.status==='active'?'green':'amber')}</td><td>{r.status==='active'&&r.starts_at>P.now&&r.class_status==='published'?<Post action={P.owner?'/my/reservations/'+r.id+'/cancel':'/reservations/'+r.id+'/cancel'} confirm={`¿Cancelar ${r.title} del ${readable(r.starts_at)}? La reserva dejará libre el cupo.`}><input type="hidden" name="confirm" value="yes"/><button className="btn-link-danger" type="submit">Cancelar ↗</button></Post>:<span className="muted">—</span>}</td></tr>)}{!arr(P.rows).length&&<Empty colSpan={P.owner?4:5} text="No existen reservas registradas."/>}</tbody></table></div></div></div>;}
function MyMembership(){return <div><Heading kicker="CU11 · INFORMACIÓN PERSONAL" title="Mi membresía" description="Consulta tu plan y su período de cobertura."/>{P.mb?<div className="panel narrow-panel"><MembershipInfo mb={P.mb} reason={P.reason} hasHead/></div>:<div className="panel narrow-panel empty">No tienes una membresía asociada a tu cuenta.</div>}<div className="panel narrow-panel"><p className="muted">¿Necesitas renovar tu plan? Solicítalo en recepción. Tu membresía no se renueva al registrar un pago automáticamente.</p></div></div>;}
function MyPayments(){return <div><Heading kicker="CU12 · MIS MOVIMIENTOS" title="Historial de pagos" description="Aquí se muestran exclusivamente los pagos vinculados a tu cuenta."/><div className="panel"><PanelTitle title="Mis comprobantes" aside={<span className="chip-muted">{arr(P.rows).length} movimientos</span>}/><div className="table-scroll"><table><thead><tr><th>FOLIO</th><th>CONCEPTO</th><th>FECHA</th><th>ESTADO</th><th>MONTO</th><th></th></tr></thead><tbody>{arr(P.rows).map(p=><tr key={p.id}><td className="mono">{p.public_id}</td><td>{p.concept}</td><td>{p.paid_on}</td><td>{statusTag(p.status.toUpperCase(),p.status==='confirmed'?'green':'amber')}</td><td><strong>{money(p.amount)}</strong></td><td><a className="table-link" href={'/receipts/'+p.id}>Ver recibo ↗</a></td></tr>)}{!arr(P.rows).length&&<Empty colSpan={6} text="Todavía no hay pagos registrados."/>}</tbody></table></div></div><p className="hint">El pago en línea indicado en CU12 no está habilitado en esta versión: requiere una integración segura con una pasarela de pagos.</p></div>;}
function MyAttendance(){return <div><Heading kicker="CU16 · HISTORIAL PERSONAL" title="Mis asistencias" description="Registro de ingresos confirmados desde recepción." actions={<span className="date-card">ENTRADAS CONSULTADAS<strong>{arr(P.rows).length}</strong></span>}/><div className="panel"><form className="filters" method="get"><label>Desde<input type="date" name="from_date" defaultValue={P.from_date||''}/></label><label>Hasta<input type="date" name="to_date" defaultValue={P.to_date||''}/></label><button className="btn btn-primary" type="submit">Filtrar</button></form><div className="table-scroll"><table><thead><tr><th>#</th><th>FECHA</th><th>HORA</th><th>TIPO</th></tr></thead><tbody>{arr(P.rows).map(a=><tr key={a.id}><td className="mono">{String(a.id).padStart(3,'0')}</td><td>{a.access_date}</td><td>{a.entered_at.slice(11,19)}</td><td>{statusTag('ENTRADA CONFIRMADA','green')}</td></tr>)}{!arr(P.rows).length&&<Empty colSpan={4} text="No se registraron ingresos en este período."/>}</tbody></table></div></div></div>;}
class Equipment extends React.Component {
  constructor(props){super(props);this.state={expanded:{}};}
  toggle(id){this.setState({expanded:{...this.state.expanded,[id]:!this.state.expanded[id]}});}
  render(){return <div><Heading kicker="CU05 · MANTENIMIENTO PREVENTIVO Y CORRECTIVO" title="Equipamiento" description="Inventario, estados operativos e historial de intervenciones." actions={<span className="chip-muted">{arr(P.rows).length} EQUIPOS</span>}/><div className="panel"><PanelTitle title="Inventario del gimnasio" aside={<button type="button" className="btn btn-primary" onClick={()=>this.toggle('new')}>+ Añadir equipo</button>}/>{this.state.expanded.new&&<Post action="/equipment" className="filters"><label>Código<input name="code" placeholder="EQ-105" required/></label><label>Nombre<input name="name" required/></label><label>Ubicación<input name="location" required/></label><button className="btn btn-lime" type="submit">Guardar</button></Post>}<div className="table-scroll"><table><thead><tr><th>CÓDIGO</th><th>EQUIPO</th><th>UBICACIÓN</th><th>ESTADO</th><th>ÚLTIMA / PRÓXIMA REVISIÓN</th><th></th></tr></thead><tbody>{arr(P.rows).map(e=>[<tr key={'equip'+e.id}><td className="mono">{e.code}</td><td><strong>{e.name}</strong></td><td>{e.location}</td><td>{statusTag(({operational:'OPERATIVO',maintenance:'EN MANTENCIÓN',out_of_service:'FUERA DE SERVICIO'})[e.status],e.status==='operational'?'green':'amber')}</td><td>{e.last_check||'Sin historial'}</td><td><button type="button" className="btn-link" onClick={()=>this.toggle('maint'+e.id)}>+ Programar mantención</button></td></tr>,this.state.expanded['maint'+e.id]&&<tr className="subform-row" key={'maint'+e.id}><td colSpan="6"><Post action={'/equipment/'+e.id+'/maintenance'} className="filters"><label>Tipo<select name="kind"><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo</option></select></label><label>Fecha<input type="date" name="scheduled_on" defaultValue={today} required/></label><label>Responsable<input name="responsible" required placeholder="Nombre del técnico"/></label><label>Observaciones<input name="notes" placeholder="Trabajo a realizar"/></label><button type="submit" className="btn btn-primary">Programar</button></Post></td></tr>]).reduce((a,v)=>a.concat(v),[])}{!arr(P.rows).length&&<Empty colSpan={6} text="Sin equipos registrados."/>}</tbody></table></div></div>
    <div className="panel"><PanelTitle title="Historial y tareas de mantenimiento"/><div className="table-scroll"><table><thead><tr><th>EQUIPO</th><th>TIPO</th><th>PROGRAMADO</th><th>RESPONSABLE</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{arr(P.maint).map(m=>[<tr key={'m'+m.id}><td><strong>{m.equipment_name}</strong><span className="sub-cell mono">{m.code}</span></td><td>{m.kind.charAt(0).toUpperCase()+m.kind.slice(1)}</td><td>{m.scheduled_on}</td><td>{m.responsible}</td><td>{statusTag(m.status==='completed'?'COMPLETADO':'PENDIENTE',m.status==='completed'?'green':'amber')}</td><td>{m.status==='pending'?<div className="staff-actions"><button type="button" className="btn-link" onClick={()=>this.toggle('editmt'+m.id)}>Editar</button><Post action={'/maintenance/'+m.id+'/complete'} confirm="¿Confirmas que se resolvieron todas las fallas de este equipo?"><input type="hidden" name="resolved" value="yes"/><button type="submit" className="btn-link">Marcar completado ↗</button></Post></div>:<span className="muted">{m.completed_at||'—'}</span>}</td></tr>,m.notes&&<tr className="notes-row" key={'n'+m.id}><td colSpan="6"><small>OBSERVACIONES:</small> {m.notes}</td></tr>,this.state.expanded['editmt'+m.id]&&m.status==='pending'&&<tr className="subform-row" key={'editmt'+m.id}><td colSpan="6"><Post action={'/maintenance/'+m.id+'/update'} className="filters"><label>Fecha<input type="date" name="scheduled_on" defaultValue={m.scheduled_on} required/></label><label>Responsable<input name="responsible" defaultValue={m.responsible} required/></label><label>Observaciones<input name="notes" defaultValue={m.notes||''} /></label><button className="btn btn-primary" type="submit">Guardar cambios</button></Post></td></tr>]).reduce((a,v)=>a.concat(v),[])}{!arr(P.maint).length&&<Empty colSpan={6} text="Sin mantenimiento registrado."/>}</tbody></table></div></div></div>;}
}
function Reports(){const pm=P.payments||{}, confirmed=pm.confirmed||{},pending=pm.pending||{},rejected=pm.rejected||{};return <div><Heading kicker="CU04 · PANEL DE INDICADORES" title={<span>Reportes <span className="heading-accent">&</span> métricas</span>} description="Estadísticas a partir de los registros reales almacenados en esta instancia." actions={<button className="btn btn-outline" type="button" onClick={()=>window.print()}>Imprimir reporte ↗</button>}/><div className="panel"><form className="filters" method="get"><label>Desde<input type="date" name="from_date" defaultValue={P.from_date||''}/></label><label>Hasta<input type="date" name="to_date" defaultValue={P.to_date||''}/></label><button className="btn btn-primary" type="submit">Aplicar período</button><BtnLink kind="btn-subtle" href="/reports">Restablecer</BtnLink></form></div><div className="stats-grid"><Stat label="INGRESOS CONFIRMADOS" value={money(confirmed.total)} sub="En el período solicitado" icon="↗"/><Stat label="SOCIOS REGISTRADOS" value={P.members_count} sub="Total histórico" icon="♙"/><Stat label="PLANES VIGENTES" value={P.active_count} sub="Al día de hoy" icon="✓"/><Stat label="ASISTENCIAS" value={P.attends} sub="En el período solicitado" icon="⇥"/></div><div className="grid-two main-top"><div className="panel"><PanelTitle title="Ingresos por día" aside={<span className="chip-muted">CLP / CONFIRMADOS</span>}/>{arr(P.daily).map(d=><div className="chart-row" key={d.day}><small>{d.day}</small><div className="chart-track"><span style={{width:(100*d.total/(P.max_total||1))+'%'}}></span></div><strong>{money(d.total)}</strong></div>)}{!arr(P.daily).length&&<p className="empty">No hay registros de ingresos para graficar.</p>}</div><div className="panel"><PanelTitle title="Estados de operación"/>{[['Pagos confirmados',confirmed.count||0],['Pagos pendientes',pending.count||0],['Pagos rechazados',rejected.count||0],...arr(P.reservations).map(r=>['Reservas '+r.status,r.n])].map(([label,count])=><div className="insight" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div></div><p className="hint">Criterios: {P.from_date||P.to_date?`desde ${P.from_date||'inicio'} hasta ${P.to_date||'hoy'}`:'sin filtro de período'}. Las métricas de socios y vigencia son totales actuales, no históricos por período. No se han realizado pruebas de rendimiento/carga.</p></div>;}
function ErrorPage(){return <div className="error-page"><div className="error-num">{P.status}</div><h1>No es posible continuar</h1><p>{P.message}</p><BtnLink kind="btn-lime" href={user?'/dashboard':'/login'}>{user?'Volver al panel':'Iniciar sesión'} ↗</BtnLink></div>;}
function View(){switch(page){
  case 'dashboard': return <Dashboard/>;
  case 'members': return <Members/>;
  case 'staff': return <Staff/>;
  case 'member_account': return <MemberAccount/>;
  case 'set_password': return <SetPassword/>;
  case 'member_detail': return <MemberDetail/>;
  case 'form': return <RegisterMember/>;
  case 'payments': return <Payments/>;
  case 'payment_form': return <PaymentForm/>;
  case 'receipt': return <Receipt/>;
  case 'access': return <Access/>;
  case 'classes': return <Classes/>;
  case 'class_form': return <ClassForm/>;
  case 'reservations': return <Reservations/>;
  case 'my_membership': return <MyMembership/>;
  case 'my_payments': return <MyPayments/>;
  case 'my_attendance': return <MyAttendance/>;
  case 'equipment': return <Equipment/>;
  case 'reports': return <Reports/>;
  case 'error': return <ErrorPage/>;
  default: return <ErrorPage/>;
}}
function App(){if(page==='landing')return <Landing/>;if(page==='login')return <Login/>;if(page==='set_password')return <SetPassword/>;if(!user)return <ErrorPage/>;return <Layout/>;}

const root = createRoot(document.getElementById('root'))
let navigationSerial = 0
function renderApp(){
  document.body.className = user ? 'app-layout' : 'public-layout'
  root.render(<App key={`${path}:${navigationSerial}:${flash?.message||''}`} />)
}
async function navigate(url, {replace=false, message=null}={}) {
  const urlObject = new URL(url, window.location.href)
  if (urlObject.origin!==location.origin) { location.href=urlObject.href; return }
  if (replace) history.replaceState(null,'',urlObject.pathname+urlObject.search)
  else if (location.pathname+location.search!==urlObject.pathname+urlObject.search) history.pushState(null,'',urlObject.pathname+urlObject.search)
  const version = ++navigationSerial
  path = urlObject.pathname
  today = localToday()
  flash = message ? {kind:'success',message} : null
  P={}
  if (path==='/set-password') {
    page='set_password';user=null;renderApp();return
  }
  if (path==='/' || path==='/login') {
    if (supabase) {
      const {data:{session}} = await supabase.auth.getSession()
      if (version!==navigationSerial) return
      if (session) return navigate('/dashboard',{replace:true,message})
    }
    user=null
    page=path==='/'?'landing':'login'
    renderApp()
    return
  }
  if (!supabase) { user=null;page='error';P={status:503,message:'Configura Supabase para acceder a las funciones.'};renderApp();return }
  try {
    const {data:{session}}=await supabase.auth.getSession()
    if (version!==navigationSerial) return
    if (!session) return navigate('/login',{replace:true})
    const data=await getGymPage(path, Object.fromEntries(urlObject.searchParams.entries()))
    if (version!==navigationSerial) return
    page=data.page
    path=data.path
    user=data.user
    today=data.today||today
    P=data.props||{}
    renderApp()
  } catch(e){
    if (version!==navigationSerial) return
    page='error';P={status:403,message:e.message};renderApp()
  }
}
async function submitForm(action, form){
  try {
    if (action==='/set-password') {
      if (!supabase) throw new Error('Supabase no está configurado.')
      const {data:{session}}=await supabase.auth.getSession()
      if (!session) throw new Error('Enlace de invitación inválido o vencido. Solicita una nueva invitación a administración.')
      const password=String(form.password||'')
      if (password.length<10 || password.length>128 || password!==String(form.confirm_password||'')) throw new Error('Las contraseñas deben coincidir y tener entre 10 y 128 caracteres.')
      const {error}=await supabase.auth.updateUser({password})
      if(error) throw new Error(error.message)
      await navigate('/dashboard',{replace:true,message:'Contraseña creada correctamente'})
      return
    }
    if (action==='/login') {
      if (!supabase) throw new Error('Falta configurar Supabase en el archivo .env.local.')
      const { error }=await supabase.auth.signInWithPassword({email:String(form.username||'').trim(), password:String(form.password||'')})
      if (error) throw new Error('No se pudo iniciar sesión: verifica el correo, contraseña y confirmación de cuenta.')
      await navigate('/dashboard',{replace:true,message:'Bienvenido/a a GymControl'})
      return
    }
    if (action==='/logout'){
      if(supabase) await supabase.auth.signOut()
      user=null
      await navigate('/',{replace:true})
      return
    }
    const result=await gymAction(action,form)
    if (result?.access){ P=result.props||{};flash=null; renderApp();return }
    await navigate(result?.redirect||path,{message:result?.message||'Operación realizada'})
  } catch(e){
    if(action==='/login'||action==='/set-password'){ P={error:e.message};renderApp() }
    else {flash={kind:'error',message:e.message}; renderApp();window.scrollTo({top:0,behavior:'smooth'})}
  }
}
// Conserva los href originales de todas las pantallas sin recargar el navegador.
document.addEventListener('click',e=>{
  const anchor=e.target.closest('a[href]')
  if(!anchor || e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || anchor.target==='_blank')return
  const url=new URL(anchor.href,location.href)
  if(url.origin!==location.origin)return
  e.preventDefault()
  navigate(url.pathname+url.search)
})
document.addEventListener('submit',e=>{
  const form=e.target
  if((form.getAttribute('method')||'get').toLowerCase()!=='get')return
  e.preventDefault()
  const params=new URLSearchParams(new FormData(form))
  navigate(location.pathname+(params.size?'?'+params.toString():''))
})
window.addEventListener('popstate',()=>navigate(location.pathname+location.search,{replace:true}))
renderApp()
navigate(location.pathname+location.search,{replace:true})

