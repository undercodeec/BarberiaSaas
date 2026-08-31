import type { GuideDefinition, GuideId } from './guide-types';

export const GUIDE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

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
};
