import type { GuideDefinition, GuideId } from './guide-types';

export const GUIDE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export const DASHBOARD_TOUR_IDS = [
  'dashboard-booking-link',
  'dashboard-banners',
  'dashboard-quick-actions',
  'dashboard-summary',
  'dashboard-notifications',
] as const satisfies readonly GuideId[];

export const GUIDE_CATALOG: Record<GuideId, GuideDefinition> = {
  'add-client': {
    body: 'Agrega un cliente para guardar sus datos y agilizar sus próximas citas.',
    id: 'add-client',
    targetId: 'clients-add-client',
    title: 'Registra tu primer cliente',
  },
  'add-service': {
    body: 'Completa los datos esenciales y crea el servicio para incluirlo en tu catálogo.',
    id: 'add-service',
    targetId: 'services-create-service',
    title: 'Crea un servicio',
  },
  'first-booking': {
    body: 'Aquí registras una cita. Después podrás elegir el cliente, servicio y horario.',
    id: 'first-booking',
    targetId: 'agenda-new-booking',
    title: 'Crea una cita',
  },
  'share-booking-link': {
    body: 'Abre tu enlace de reservas para compartirlo con tus clientes en redes o WhatsApp.',
    id: 'share-booking-link',
    targetId: 'dashboard-booking-link',
    title: 'Comparte tu enlace',
  },
  'dashboard-booking-link': {
    body: 'Abre este panel para compartir el enlace de reservas con tus clientes.',
    id: 'dashboard-booking-link',
    nextId: 'dashboard-banners',
    targetId: 'dashboard-booking-link',
    title: 'Abre tus reservas',
  },
  'dashboard-banners': {
    body: 'Este panel muestra el estado y los avisos importantes de tu plan.',
    id: 'dashboard-banners',
    nextId: 'dashboard-quick-actions',
    previousId: 'dashboard-booking-link',
    targetId: 'dashboard-banners',
    title: 'Revisa tus banners',
  },
  'dashboard-quick-actions': {
    body: 'Usa estos accesos para llegar rápido a las funciones principales.',
    id: 'dashboard-quick-actions',
    nextId: 'dashboard-summary',
    previousId: 'dashboard-banners',
    targetId: 'dashboard-quick-actions',
    title: 'Accesos rápidos',
  },
  'dashboard-summary': {
    body: 'Ve un resumen rápido de la actividad y resultados del negocio.',
    id: 'dashboard-summary',
    nextId: 'dashboard-notifications',
    previousId: 'dashboard-quick-actions',
    targetId: 'dashboard-summary',
    title: 'Consulta tu resumen',
  },
  'dashboard-notifications': {
    body: 'Aquí recibirás novedades sobre reservas, cambios y avisos importantes.',
    id: 'dashboard-notifications',
    previousId: 'dashboard-summary',
    targetId: 'dashboard-notifications',
    title: 'Mantente al tanto',
  },
  'booking-link-qr': {
    body: 'Muestra este código para que tus clientes abran tus reservas.',
    id: 'booking-link-qr',
    nextId: 'booking-link-copy',
    targetId: 'booking-link-qr',
    title: 'Comparte con código QR',
  },
  'booking-link-copy': {
    body: 'Copia el enlace para enviarlo por WhatsApp, redes o mensaje.',
    id: 'booking-link-copy',
    nextId: 'booking-link-website',
    previousId: 'booking-link-qr',
    targetId: 'booking-link-copy',
    title: 'Copia tu enlace',
  },
  'booking-link-website': {
    body: 'Abre tu página pública para comprobar cómo reservan tus clientes.',
    id: 'booking-link-website',
    previousId: 'booking-link-copy',
    targetId: 'booking-link-website',
    title: 'Ve tu website',
  },
};
