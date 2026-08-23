import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacidad y tratamiento de datos | Nava',
  description:
    'Información sobre privacidad, tratamiento de datos y solicitudes de titulares en Nava.',
};

export default function DataProcessingPage() {
  return (
    <main className="legal-page">
      <header className="legal-page__header">
        <Link aria-label="Volver al inicio de Nava" className="nava-brand" href="/">
          <span>N</span>NAVA
        </Link>
      </header>
      <article className="legal-page__content">
        <p className="legal-page__eyebrow">Privacidad y tratamiento de datos</p>
        <h1>Tu información merece un manejo claro.</h1>
        <p className="legal-page__updated">Última actualización: 23 de agosto de 2026.</p>

        <section>
          <h2>Quién trata los datos</h2>
          <p>
            Nava es operado desde Quito, Ecuador. Cuando crea una cuenta,
            gestiona su suscripción o solicita soporte, Nava trata esos datos
            para prestar el servicio, mantener su seguridad y cumplir sus
            obligaciones aplicables.
          </p>
        </section>

        <section>
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

        <section>
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

        <section>
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

        <section>
          <h2>Declaración al crear una cuenta</h2>
          <p>
            Al aceptar la Política de Privacidad durante el registro o la
            contratación, declara tener al menos 18 años o capacidad legal
            suficiente para contratar Nava.
          </p>
        </section>

        <p className="legal-page__notice">
          Esta página informa el tratamiento operativo actual. Los documentos
          legales definitivos deben pasar revisión profesional antes de su
          publicación comercial final.
        </p>
      </article>
    </main>
  );
}
