import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadLocalTestDatabaseEnvironment } from '../../../scripts/test-database-env.mjs';

const BATCH_SIZE = 1_000;
const FIXTURE_SLUG = 'perf-data-local';
const LARGE_ENTITY_COUNT = 100_000;
const LOCATION_COUNT = 5;
const PROFESSIONAL_COUNT = 20;
const PERFORMANCE_SESSION_PATH = new URL(
  '../.secrets/performance-session.json',
  import.meta.url,
);

export function distributeRows(total, partitions) {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new TypeError('El total debe ser un entero no negativo.');
  }
  if (!Number.isSafeInteger(partitions) || partitions < 1) {
    throw new TypeError('Las particiones deben ser un entero positivo.');
  }
  const base = Math.floor(total / partitions);
  const remainder = total % partitions;
  return Array.from(
    { length: partitions },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function batches(values) {
  return Array.from(
    { length: Math.ceil(values.length / BATCH_SIZE) },
    (_, index) => values.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );
}

function performanceToken() {
  return randomBytes(32).toString('base64url');
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function phoneFor(index) {
  return `+5939${String(index).padStart(8, '0')}`;
}

function isoDateAt(base, minutes) {
  return new Date(base.getTime() + minutes * 60_000);
}

async function removeFixture(database) {
  const organization = await database.organization.findUnique({
    select: {
      id: true,
      memberships: { select: { userId: true } },
      subscription: { select: { planId: true } },
    },
    where: { slug: FIXTURE_SLUG },
  });
  if (!organization) return false;

  const userIds = organization.memberships.map(({ userId }) => userId);
  await database.stockMovement.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.auditLog.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.appointment.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.client.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.product.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.service.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.businessWeeklySchedule.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.membership.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.location.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.subscription.deleteMany({
    where: { organizationId: organization.id },
  });
  await database.organization.delete({ where: { id: organization.id } });
  if (userIds.length > 0) {
    await database.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (organization.subscription) {
    await database.plan.deleteMany({
      where: { id: organization.subscription.planId, code: 'perf-data-multi' },
    });
  }
  return true;
}

async function createRowsInBatches(model, rows) {
  for (const batch of batches(rows)) {
    await model.createMany({ data: batch });
  }
}

async function writePerformanceSession(session) {
  await mkdir(new URL('../.secrets/', import.meta.url), { recursive: true });
  await writeFile(
    PERFORMANCE_SESSION_PATH,
    `${JSON.stringify(session, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
}

async function seedFixture(database) {
  const now = new Date();
  const ownerId = randomUUID();
  const organizationId = randomUUID();
  const locationIds = Array.from({ length: LOCATION_COUNT }, () =>
    randomUUID(),
  );
  const professionalUserIds = Array.from({ length: PROFESSIONAL_COUNT }, () =>
    randomUUID(),
  );
  const professionalMembershipIds = Array.from(
    { length: PROFESSIONAL_COUNT },
    () => randomUUID(),
  );
  const serviceIds = Array.from({ length: 5 }, () => randomUUID());
  const clientIds = Array.from({ length: LARGE_ENTITY_COUNT }, () =>
    randomUUID(),
  );
  const productIds = Array.from({ length: LARGE_ENTITY_COUNT }, () =>
    randomUUID(),
  );
  const token = performanceToken();
  const planData = {
    code: 'perf-data-multi',
    featureFlags: {
      commissions: true,
      fullReports: true,
      inventory: true,
      multiLocation: true,
      publicBooking: true,
      reports: true,
      team: true,
      wallet: true,
    },
    features: ['Fixture local de rendimiento'],
    isActive: true,
    isPublic: false,
    limits: {
      clients: null,
      locations: 6,
      rolling30DayBookings: null,
      teamMembers: 40,
    },
    monthlyPriceCents: 0,
    name: 'Fixture Nava Multi',
    sortOrder: 9_999,
  };
  const plan = await database.plan.upsert({
    create: planData,
    update: planData,
    where: { code: planData.code },
  });
  await database.user.deleteMany({
    where: {
      OR: [
        { email: 'perf-owner@local.test' },
        {
          AND: [
            { email: { startsWith: 'perf-professional-' } },
            { email: { endsWith: '@local.test' } },
          ],
        },
      ],
    },
  });
  await database.user.createMany({
    data: [
      {
        email: 'perf-owner@local.test',
        emailVerifiedAt: now,
        fullName: 'Propietario de rendimiento',
        id: ownerId,
      },
      ...professionalUserIds.map((id, index) => ({
        email: `perf-professional-${index}@local.test`,
        emailVerifiedAt: now,
        fullName: `Profesional ${index + 1}`,
        id,
      })),
    ],
  });
  await database.organization.create({
    data: {
      defaultTimezone: 'America/Guayaquil',
      id: organizationId,
      name: 'Fixture local de rendimiento',
      primaryLocationId: locationIds[0],
      slug: FIXTURE_SLUG,
      status: 'ACTIVE',
    },
  });
  await database.subscription.create({
    data: {
      currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000),
      currentPeriodStart: now,
      organizationId,
      planId: plan.id,
      status: 'ACTIVE',
    },
  });
  await database.location.createMany({
    data: locationIds.map((id, index) => ({
      id,
      name: `Sede ${index + 1}`,
      organizationId,
      phone: phoneFor(900_000 + index),
      slug: `sede-${index + 1}`,
      timezone: 'America/Guayaquil',
      whatsappPhone: phoneFor(900_000 + index),
    })),
  });
  const ownerMembershipId = randomUUID();
  await database.membership.createMany({
    data: [
      {
        id: ownerMembershipId,
        organizationId,
        role: 'OWNER',
        status: 'ACTIVE',
        userId: ownerId,
      },
      ...professionalMembershipIds.map((id, index) => ({
        id,
        organizationId,
        role: 'BARBER',
        status: 'ACTIVE',
        userId: professionalUserIds[index],
      })),
    ],
  });
  await database.memberLocation.createMany({
    data: [
      ...locationIds.map((locationId) => ({
        locationId,
        membershipId: ownerMembershipId,
      })),
      ...professionalMembershipIds.map((membershipId, index) => ({
        locationId: locationIds[index % LOCATION_COUNT],
        membershipId,
      })),
    ],
  });
  await database.service.createMany({
    data: serviceIds.map((id, index) => ({
      durationMinutes: 15,
      id,
      name: `Servicio de rendimiento ${index + 1}`,
      onlineBooking: true,
      organizationId,
      priceCents: 1_200 + index * 100,
    })),
  });
  await database.professionalService.createMany({
    data: professionalMembershipIds.flatMap((membershipId, professionalIndex) =>
      serviceIds.map((serviceId) => ({
        locationId: locationIds[professionalIndex % LOCATION_COUNT],
        membershipId,
        serviceId,
      })),
    ),
  });
  await database.businessWeeklySchedule.createMany({
    data: locationIds.flatMap((locationId) =>
      Array.from({ length: 7 }, (_, weekday) => ({
        endMinute: 1_080,
        isOpen: true,
        locationId,
        organizationId,
        startMinute: 540,
        weekday,
      })),
    ),
  });
  await database.weeklySchedule.createMany({
    data: professionalMembershipIds.flatMap((membershipId, professionalIndex) =>
      Array.from({ length: 7 }, (_, weekday) => ({
        endMinute: 1_080,
        locationId: locationIds[professionalIndex % LOCATION_COUNT],
        membershipId,
        startMinute: 540,
        weekday,
      })),
    ),
  });
  await database.session.create({
    data: {
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
      tokenHash: tokenHash(token),
      userId: ownerId,
    },
  });

  await createRowsInBatches(
    database.client,
    clientIds.map((id, index) => ({
      createdByUserId: ownerId,
      email: `client-${index}@perf.local.test`,
      fullName: `Cliente ${String(index % 1_000).padStart(4, '0')} ${index}`,
      id,
      organizationId,
      phone: phoneFor(index),
      updatedByUserId: ownerId,
    })),
  );
  const appointmentBase = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1_000);
  await createRowsInBatches(
    database.appointment,
    clientIds.map((clientId, index) => {
      const professionalIndex = index % PROFESSIONAL_COUNT;
      const startsAt = isoDateAt(
        appointmentBase,
        Math.floor(index / PROFESSIONAL_COUNT) * 15,
      );
      const cancelled = index % 11 === 0;
      return {
        clientEmail: `client-${index}@perf.local.test`,
        clientId,
        clientName: `Cliente ${String(index % 1_000).padStart(4, '0')} ${index}`,
        clientPhone: phoneFor(index),
        createdByUserId: ownerId,
        endsAt: isoDateAt(startsAt, 15),
        id: randomUUID(),
        locationId: locationIds[professionalIndex % LOCATION_COUNT],
        organizationId,
        professionalMembershipId: professionalMembershipIds[professionalIndex],
        reservesSlot: !cancelled,
        source: 'MANUAL',
        startsAt,
        status: cancelled ? 'CANCELLED' : 'SCHEDULED',
        updatedByUserId: ownerId,
      };
    }),
  );
  await createRowsInBatches(
    database.product,
    productIds.map((id, index) => ({
      costCents: 500,
      id,
      isActive: index % 10 !== 0,
      minimumStock: 5,
      name: `Producto ${String(index % 1_000).padStart(4, '0')} ${index}`,
      organizationId,
      salePriceCents: 1_000,
      sku: `PERF-${index}`,
      stockTrackingEnabled: true,
    })),
  );
  await createRowsInBatches(
    database.locationInventory,
    productIds.map((productId, index) => ({
      locationId: locationIds[0],
      productId,
      quantityOnHand: 20 + (index % 30),
    })),
  );
  await createRowsInBatches(
    database.stockMovement,
    productIds.map((productId, index) => ({
      createdAt: isoDateAt(appointmentBase, index),
      createdByUserId: ownerId,
      direction: index % 2 === 0 ? 'IN' : 'OUT',
      id: randomUUID(),
      locationId: locationIds[0],
      notes: 'Movimiento de fixture',
      organizationId,
      productId,
      quantity: 1,
      resultingQuantity: 20 + (index % 30),
      type: index % 2 === 0 ? 'PURCHASE' : 'SALE',
      unitCostCents: 500,
    })),
  );
  const imageData = `data:image/jpeg;base64,${Buffer.alloc(1_024 * 1_024).toString('base64')}`;
  await Promise.all(
    productIds
      .slice(0, 4)
      .map((id) =>
        database.product.update({ data: { imageData }, where: { id } }),
      ),
  );
  await writePerformanceSession({
    clientId: clientIds[0],
    locationIds,
    organizationId,
    productIds: productIds.slice(0, 50),
    professionalMembershipId: professionalMembershipIds[0],
    serviceId: serviceIds[0],
    token,
  });
  return {
    appointments: LARGE_ENTITY_COUNT,
    clients: LARGE_ENTITY_COUNT,
    products: LARGE_ENTITY_COUNT,
    stockMovements: LARGE_ENTITY_COUNT,
  };
}

async function main() {
  const environment = loadLocalTestDatabaseEnvironment();
  const { createDatabaseClient } = await import('@barber-saas/database');
  const database = createDatabaseClient({
    connectionString: environment.DATABASE_URL,
  });
  try {
    const reset = process.argv.includes('--reset');
    const exists = await database.organization.findUnique({
      select: { id: true },
      where: { slug: FIXTURE_SLUG },
    });
    if (process.argv.includes('--remove')) {
      const removed = await removeFixture(database);
      console.log(removed ? 'Fixture local eliminado.' : 'Fixture local ausente.');
      return;
    }
    if (exists && !reset) {
      console.log('Fixture local existente; usa --reset para regenerarlo.');
      return;
    }
    if (reset) await removeFixture(database);
    const counts = await seedFixture(database);
    console.log(`Fixture local creado: ${JSON.stringify(counts)}.`);
  } finally {
    await database.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error de fixture de rendimiento: ${error.message}`);
    process.exitCode = 1;
  });
}
