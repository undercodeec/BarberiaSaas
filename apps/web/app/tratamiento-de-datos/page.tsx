import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacidad y tratamiento de datos | Nava',
  description:
    'Información sobre privacidad, tratamiento de datos y solicitudes de titulares en Nava.',
};

export default function DataProcessingPage() {
  return (
    <main className="policies-page">
      <header className="commercial-nav">
        <Link aria-label="Nava, inicio" className="commercial-logo" href="/">
          <img alt="Nava" src="/images/nava-logo.png" />
        </Link>
        <nav aria-label="Navegación principal">
          <Link href="/politicas">Políticas</Link>
          <Link href="/suscripciones">Suscripciones</Link>
          <a href="https://wa.me/593979046329">Soporte</a>
        </nav>
      </header>

      <section className="policies-hero">
        <p className="commercial-eyebrow">Nava / Privacidad</p>
        <h1>Tu información merece un manejo claro.</h1>
        <p>
          Cómo Nava trata la información de las cuentas, los negocios y sus
          solicitudes. Última actualización: 23 de agosto de 2026.
        </p>
        <div className="policies-jump-links" aria-label="Ir a una sección">
          <a href="#tratamiento">Tratamiento</a>
          <a href="#decisiones">Tus decisiones</a>
          <a href="#cookies">Cookies</a>
          <a href="#declaracion">Declaración</a>
        </div>
      </section>

      <div className="policies-layout">
        <aside className="policies-aside">
          <span>Resumen</span>
          <strong>Privacidad pensada para operar con transparencia.</strong>
          <p>
            Nava protege los datos necesarios para prestar el servicio y cada
            negocio conserva el control de la información de sus clientes.
          </p>
        </aside>

        <article className="policies-content">
          <section id="tratamiento">
            <p className="policies-index">01</p>
            <h2>Quién trata los datos</h2>
            <p>
              Nava es operado desde Quito, Ecuador. Cuando crea una cuenta,
              gestiona su suscripción o solicita soporte, Nava trata esos datos
              para prestar el servicio, mantener su seguridad y cumplir sus
              obligaciones aplicables.
            </p>
          </section>

          <section>
            <p className="policies-index">02</p>
            <h2>Datos de clientes de un negocio</h2>
            <p>
              Cada barbería o negocio es responsable de los datos de sus propios
              clientes. Nava actúa como encargado tecnológico para alojar y
              procesar esa información según las instrucciones del negocio y las
              funcionalidades contratadas.
            </p>
            <p>
              Nava no está diseñado para almacenar diagnósticos, historiales
              clínicos, información de salud ni datos biométricos. No incluya
              ese tipo de datos en notas o registros del servicio.
            </p>
          </section>

          <section id="decisiones">
            <p className="policies-index">03</p>
            <h2>Sus decisiones</h2>
            <p>
              Puede solicitar acceso, rectificación, eliminación u otra gestión
              sobre sus datos escribiendo a{' '}
              <a href="mailto:soporte@navacloud.app">soporte@navacloud.app</a>.
              También puede usar el canal de soporte por WhatsApp{' '}
              <a href="https://wa.me/593979046329" rel="noreferrer" target="_blank">
                0979046329
              </a>{' '}
              (operado por Undercodeec para Nava).
            </p>
            <p>
              Desde la app puede eliminar su cuenta en <strong>Ajustes → Borrar
              mi cuenta</strong>. Si cierra un negocio, su propietario puede
              exportar los datos disponibles durante 30 días desde Ajustes, en
              formato CSV o ZIP.
            </p>
          </section>

          <section id="cookies">
            <p className="policies-index">04</p>
            <h2>Comunicaciones y cookies</h2>
            <p>
              Los correos promocionales de Nava son opcionales y puede retirarlos
              desde su cuenta o desde el enlace de baja de cada correo. Esto no
              afecta mensajes operativos, como códigos de acceso, seguridad,
              facturación o vencimientos.
            </p>
            <p>
              El sitio utiliza cookies necesarias para funcionar. Las cookies de
              analítica se activan únicamente si las acepta desde el panel de
              preferencias, que puede reabrir cuando quiera.
            </p>
          </section>

          <section id="declaracion">
            <p className="policies-index">05</p>
            <h2>Declaración al crear una cuenta</h2>
            <p>
              Al aceptar la Política de Privacidad durante el registro o la
              contratación, declara tener al menos 18 años o capacidad legal
              suficiente para contratar Nava.
            </p>
          </section>

          <section className="policies-contact">
            <p className="policies-index">Soporte</p>
            <h2>Solicitudes de privacidad</h2>
            <p>
              Si necesita ayuda con sus datos o desea ejercer alguno de sus
              derechos, contáctenos por cualquiera de estos canales.
            </p>
            <div>
              <a href="mailto:soporte@navacloud.app">soporte@navacloud.app</a>
              <a href="https://wa.me/593979046329">WhatsApp 0979046329</a>
            </div>
          </section>

          <p className="policies-disclaimer">
            Esta página informa el tratamiento operativo actual. Los documentos
            legales definitivos deben pasar revisión profesional antes de su
            publicación comercial final.
          </p>
        </article>
      </div>
    </main>
  );
}
