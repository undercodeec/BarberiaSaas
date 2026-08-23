import { ModuleDeck } from './components/ModuleDeck';
import { PlanMatrix } from './components/PlanMatrix';
import { PortalHero } from './components/PortalHero';

const roster = [
  ['01', 'Reservas 24/7', 'Tus clientes reservan desde su navegador.'],
  ['02', 'Agenda del equipo', 'Horarios, bloqueos y reprogramaciones.'],
  ['03', 'Clientes e historial', 'Información para atender mejor.'],
  ['04', 'Caja y ventas', 'El movimiento de tu negocio, claro.'],
  ['05', 'Comisiones', 'Cuentas transparentes para tu equipo.'],
  ['06', 'Inventario', 'Productos y alertas de stock.'],
  ['07', 'Reportes', 'Información para decidir mejor.'],
] as const;

function Brand() {
  return <a aria-label="Nava, inicio" className="label-brand" href="#inicio">NAVA<span>.</span></a>;
}

export default function HomePage() {
  return <main id="inicio">
    <header className="label-nav"><Brand /><nav aria-label="Navegación principal"><a href="#modulos">Funciones</a><a href="#operacion">Operación</a><a href="#planes">Planes</a><a href="#recursos">Recursos</a></nav><div><a href="/checkout">Iniciar sesión</a><a className="label-pill" href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">Probar Nava</a></div></header>
    <PortalHero />
    <section className="statement-fold" id="operacion"><p>Todo lo que tu barbería necesita</p><h2>Menos herramientas separadas. <em>Más control</em> desde un solo lugar.</h2><span>01</span><div className="statement-disc">N</div></section>
    <section className="modules-section" id="modulos"><div><p className="section-label">Módulos Nava</p><h2>La operación de tu barbería, organizada como una sola experiencia.</h2><p>Reservas, agenda, clientes, caja, equipo, productos y reportes comparten el mismo ritmo.</p><div className="module-actions"><a className="label-pill" href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">Probar Nava gratis</a><a href="#planes">Ver planes →</a></div></div><ModuleDeck /></section>
    <section className="nava-roster"><p className="section-label">El sistema</p><h2>Todo conecta.<br />Nada sobra.</h2><div>{roster.map(([code, title, description]) => <article key={code}><span>{code}</span><h3>{title}</h3><p>{description}</p><b>→</b></article>)}</div></section>
    <section className="plans-table-section" id="planes"><div><p className="section-label">Planes Nava</p><h2>Un plan para el ritmo de tu negocio.</h2><p>Prueba Nava durante 10 días. Después, tu cuenta pasa a Nava Free si no eliges otro plan.</p></div><PlanMatrix /></section>
    <section className="nava-close" id="recursos"><div><p className="section-label">Nava para tu barbería</p><h2>Tu negocio merece trabajar con más orden.</h2><p>Organiza reservas, agenda, clientes, caja, equipo e inventario desde un solo lugar.</p><div><a className="label-pill" href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">Probar Nava gratis</a><a href="#modulos">Ver funciones →</a></div><small>10 días para conocer Nava.</small></div><footer><span>© {new Date().getFullYear()} Nava · Ecuador</span><a href="mailto:soporte@navacloud.app">soporte@navacloud.app</a></footer><strong aria-hidden="true">NAVA</strong></section>
  </main>;
}
