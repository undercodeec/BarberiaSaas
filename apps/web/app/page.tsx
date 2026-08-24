const modules = [
  'Reservas 24/7',
  'Agenda del equipo',
  'Clientes e historial',
  'Caja y ventas',
  'Comisiones',
  'Inventario',
  'Reportes',
];

const plans = [
  ['Nava Free', 'Para conocer Nava'],
  ['Nava Esencial', 'Operación individual'],
  ['Nava Local', 'Barbería completa'],
  ['Nava Multi', 'Más de una sede'],
];

export default function HomePage() {
  return (
    <main>
      <header>
        <a href="#inicio">NAVA</a>
        <nav aria-label="Navegación principal">
          <a href="#funciones">Funciones</a>
          <a href="#operacion">Operación</a>
          <a href="#planes">Planes</a>
        </nav>
        <a href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">
          Probar Nava
        </a>
      </header>

      <section id="inicio">
        <p>Software para barberías</p>
        <h1>Haz crecer tu barbería con más orden y menos complicaciones.</h1>
        <p>
          Nava reúne reservas, agenda, clientes, caja, equipo e inventario en un
          solo lugar.
        </p>
        <p>
          <a href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">
            Probar Nava gratis
          </a>{' '}
          · <a href="#funciones">Conocer funciones</a>
        </p>
      </section>

      <section id="operacion">
        <h2>Todo lo que tu barbería necesita.</h2>
        <p>Menos herramientas separadas. Más control desde un solo lugar.</p>
      </section>

      <section id="funciones">
        <h2>Módulos Nava</h2>
        <p>
          La operación de tu barbería, organizada como una sola experiencia.
        </p>
        <ul>
          {modules.map((module) => (
            <li key={module}>{module}</li>
          ))}
        </ul>
      </section>

      <section id="planes">
        <h2>Planes Nava</h2>
        <p>Prueba Nava durante 10 días. Después, tu cuenta pasa a Nava Free.</p>
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Para quién</th>
            </tr>
          </thead>
          <tbody>
            {plans.map(([name, description]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Tu negocio merece trabajar con más orden.</h2>
        <p>10 días para conocer Nava.</p>
        <a href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava">
          Probar Nava gratis
        </a>
      </section>

      <footer>
        <span>© {new Date().getFullYear()} Nava · Ecuador</span>
        <a href="mailto:soporte@navacloud.app">soporte@navacloud.app</a>
      </footer>
    </main>
  );
}
