import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Políticas y condiciones | Nava',
  description:
    'Condiciones comerciales, privacidad, suscripciones y uso responsable de Nava.',
};

const policySections = [
  {
    id: 'condiciones',
    index: '01',
    title: 'Condiciones de uso',
    paragraphs: [
      'Nava es una plataforma para personas naturales y negocios que administran barberías y operaciones de cuidado personal en Ecuador y Latinoamérica. Para crear una cuenta o contratar un plan, la persona usuaria declara tener 18 años o capacidad legal suficiente.',
      'Nava provee infraestructura tecnológica. Cada negocio es responsable de sus servicios, reservas, precios, anticipos, cancelaciones, reprogramaciones y de la relación comercial directa con sus clientes.',
    ],
  },
  {
    id: 'suscripciones',
    index: '02',
    title: 'Planes, pagos y renovación',
    paragraphs: [
      'El periodo de prueba dura 10 días. Al finalizar, la cuenta pasa a Nava Free sin eliminar sus datos. Las suscripciones pagadas se renuevan manualmente; Nava avisa el vencimiento con 5 días de anticipación y ofrece 3 días de gracia antes de aplicar el plan Free.',
      'Los precios publicados son el valor final vigente al contratar. Nava puede actualizarlos con un aviso mínimo de 15 días, sin afectar períodos ya pagados. Los pagos procesados no son reembolsables, salvo un error atribuible a Nava o los derechos obligatorios aplicables.',
    ],
  },
  {
    id: 'privacidad',
    index: '03',
    title: 'Privacidad y datos',
    paragraphs: [
      'Nava trata los datos necesarios para operar cuentas, suscripciones, seguridad, soporte y facturación. Respecto de la información registrada por cada barbería sobre sus clientes, el negocio actúa como responsable y Nava como encargado tecnológico.',
      'No use Nava para guardar diagnósticos, historiales clínicos, datos de salud, biometría u otra información sensible. Puede solicitar acceso, rectificación o eliminación de sus datos mediante los canales de soporte.',
    ],
  },
  {
    id: 'cookies',
    index: '04',
    title: 'Cookies y comunicaciones',
    paragraphs: [
      'El sitio utiliza cookies necesarias para funcionar. Las cookies analíticas solo se activan con consentimiento explícito y la decisión puede modificarse desde el panel de preferencias.',
      'Las comunicaciones promocionales de Nava son opcionales. Cancelarlas no afecta mensajes esenciales como códigos de acceso, seguridad, facturas o avisos de vencimiento.',
    ],
  },
] as const;

export default function PoliciesPage() {
  return (
    <main className="policies-page">
      <header className="commercial-nav">
        <Link aria-label="Nava, inicio" className="commercial-logo" href="/">
          <img alt="Nava" src="/images/nava-logo.png" />
        </Link>
        <nav aria-label="Navegación principal">
          <Link href="/suscripciones">Suscripciones</Link>
          <a href="https://wa.me/593979046329">Soporte</a>
        </nav>
      </header>

      <section className="policies-hero">
        <p className="commercial-eyebrow">Nava / Legal</p>
        <h1>Reglas claras para una operación más tranquila.</h1>
        <p>
          Condiciones comerciales, privacidad y compromisos de uso de Nava.
          Última actualización: 23 de agosto de 2026.
        </p>
        <div className="policies-jump-links" aria-label="Ir a una sección">
          {policySections.map((section) => (
            <a href={`#${section.id}`} key={section.id}>
              {section.title}
            </a>
          ))}
        </div>
      </section>

      <div className="policies-layout">
        <aside className="policies-aside">
          <span>Resumen</span>
          <strong>Hecho para negocios que quieren trabajar con claridad.</strong>
          <p>
            Nava se opera desde Quito, Ecuador, para usuarios de Ecuador y
            Latinoamérica.
          </p>
        </aside>
        <article className="policies-content">
          {policySections.map((section) => (
            <section id={section.id} key={section.id}>
              <p className="policies-index">{section.index}</p>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.id === 'suscripciones' ? (
                <Link className="policies-inline-link" href="/suscripciones">
                  Ver planes y suscripciones <span>→</span>
                </Link>
              ) : null}
              {section.id === 'privacidad' ? (
                <Link className="policies-inline-link" href="/tratamiento-de-datos">
                  Consultar tratamiento de datos <span>→</span>
                </Link>
              ) : null}
            </section>
          ))}

          <section className="policies-contact" id="soporte">
            <p className="policies-index">05</p>
            <h2>Soporte y solicitudes</h2>
            <p>
              Para soporte, privacidad, suscripciones, reclamos o solicitudes
              legales, escríbenos por WhatsApp Business de lunes a viernes,
              días laborables de Ecuador, de 10:00 a 19:00.
            </p>
            <div>
              <a href="https://wa.me/593979046329">WhatsApp 0979046329</a>
              <a href="mailto:soporte@navacloud.app">soporte@navacloud.app</a>
            </div>
          </section>

        </article>
      </div>
    </main>
  );
}
