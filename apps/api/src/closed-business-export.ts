import { MembershipRole, type DatabaseClient } from '@barber-saas/database';

import { ApiError } from './errors';

const EXPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface ZipEntry {
  readonly contents: Buffer;
  readonly filename: string;
}

function csvCell(value: string) {
  const safeValue = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function createCsv(
  records: readonly {
    readonly data: unknown;
    readonly id: string;
    readonly type: string;
  }[],
) {
  return [
    'tipo,id,datos_json',
    ...records.map(({ data, id, type }) =>
      [type, id, JSON.stringify(data)].map(csvCell).join(','),
    ),
  ].join('\r\n');
}

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
  };
}

function createZip(entries: readonly ZipEntry[]) {
  const locals: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;
  const { date, time } = dosDateTime(new Date());
  for (const entry of entries) {
    const filename = Buffer.from(entry.filename, 'utf8');
    const checksum = crc32(entry.contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.contents.length, 18);
    local.writeUInt32LE(entry.contents.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, filename, entry.contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.contents.length, 20);
    central.writeUInt32LE(entry.contents.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralDirectory.push(central, filename);
    offset += local.length + filename.length + entry.contents.length;
  }
  const centralSize = centralDirectory.reduce(
    (total, part) => total + part.length,
    0,
  );
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centralDirectory, end]);
}

function dataUriImage(data: string | null, filename: string): ZipEntry | null {
  if (!data) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/u.exec(
    data,
  );
  if (!match) return null;
  const encoded = match[2];
  if (!encoded) return null;
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  return {
    contents: Buffer.from(encoded, 'base64'),
    filename: `${filename}.${extension}`,
  };
}

function safeFilename(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9_-]/gu, '-')
    .replace(/-+/gu, '-')
    .slice(0, 60);
}

export async function buildClosedBusinessExport(input: {
  readonly database: DatabaseClient;
  readonly format: 'csv' | 'zip';
  readonly organizationId: string;
  readonly userId: string;
}) {
  const now = new Date();
  const membership = await input.database.membership.findFirst({
    include: {
      organization: {
        select: { deletedAt: true, id: true, name: true, slug: true },
      },
    },
    where: {
      organizationId: input.organizationId,
      role: MembershipRole.OWNER,
      userId: input.userId,
    },
  });
  const organization = membership?.organization;
  if (!organization?.deletedAt)
    throw new ApiError(
      404,
      'CLOSED_BUSINESS_NOT_FOUND',
      'No encontramos ese negocio cerrado.',
    );
  const expiresAt = new Date(
    organization.deletedAt.getTime() + EXPORT_WINDOW_MS,
  );
  if (expiresAt <= now)
    throw new ApiError(
      410,
      'CLOSED_BUSINESS_EXPORT_EXPIRED',
      'El plazo de 30 días para exportar este negocio ya terminó.',
    );

  const [
    appointments,
    categories,
    clients,
    locations,
    notes,
    products,
    services,
    noteImages,
    productImages,
    serviceImages,
  ] = await Promise.all([
    input.database.appointment.findMany({
      where: { organizationId: organization.id },
    }),
    input.database.serviceCategory.findMany({
      where: { organizationId: organization.id },
    }),
    input.database.client.findMany({
      where: { organizationId: organization.id },
    }),
    input.database.location.findMany({
      where: { organizationId: organization.id },
    }),
    input.database.clientNote.findMany({
      select: { clientId: true, createdAt: true, description: true, id: true },
      where: { organizationId: organization.id },
    }),
    input.database.product.findMany({
      select: {
        barcode: true,
        costCents: true,
        createdAt: true,
        currencyCode: true,
        id: true,
        isActive: true,
        minimumStock: true,
        name: true,
        salePriceCents: true,
        sku: true,
        stockTrackingEnabled: true,
        updatedAt: true,
      },
      where: { organizationId: organization.id },
    }),
    input.database.service.findMany({
      select: {
        categoryId: true,
        createdAt: true,
        description: true,
        durationMinutes: true,
        id: true,
        isActive: true,
        name: true,
        onlineBooking: true,
        priceCents: true,
        updatedAt: true,
      },
      where: { organizationId: organization.id },
    }),
    input.database.clientNote.findMany({
      select: { id: true, photoData: true },
      where: { organizationId: organization.id, photoData: { not: null } },
    }),
    input.database.product.findMany({
      select: { id: true, imageData: true },
      where: { organizationId: organization.id, imageData: { not: null } },
    }),
    input.database.service.findMany({
      select: { id: true, imageData: true },
      where: { organizationId: organization.id, imageData: { not: null } },
    }),
  ]);
  const records = [
    { data: organization, id: organization.id, type: 'negocio' },
    ...locations.map((data) => ({ data, id: data.id, type: 'sede' })),
    ...categories.map((data) => ({
      data,
      id: data.id,
      type: 'categoria_servicio',
    })),
    ...services.map((data) => ({ data, id: data.id, type: 'servicio' })),
    ...products.map((data) => ({ data, id: data.id, type: 'producto' })),
    ...clients.map((data) => ({ data, id: data.id, type: 'cliente' })),
    ...notes.map((data) => ({ data, id: data.id, type: 'nota_cliente' })),
    ...appointments.map((data) => ({ data, id: data.id, type: 'cita' })),
  ];
  const csv = `\uFEFF${createCsv(records)}`;
  const baseName = `nava-${safeFilename(organization.slug || organization.name)}-${organization.deletedAt.toISOString().slice(0, 10)}`;
  if (input.format === 'csv') {
    return {
      contentsBase64: Buffer.from(csv, 'utf8').toString('base64'),
      expiresAt: expiresAt.toISOString(),
      filename: `${baseName}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    };
  }
  const images = [
    ...noteImages.map(({ id, photoData }) =>
      dataUriImage(photoData, `imagenes/notas/${id}`),
    ),
    ...productImages.map(({ id, imageData }) =>
      dataUriImage(imageData, `imagenes/productos/${id}`),
    ),
    ...serviceImages.map(({ id, imageData }) =>
      dataUriImage(imageData, `imagenes/servicios/${id}`),
    ),
  ].filter((entry): entry is ZipEntry => entry !== null);
  const archive = createZip([
    { contents: Buffer.from(csv, 'utf8'), filename: 'datos.csv' },
    {
      contents: Buffer.from(JSON.stringify(records, null, 2), 'utf8'),
      filename: 'datos.json',
    },
    ...images,
  ]);
  return {
    contentsBase64: archive.toString('base64'),
    expiresAt: expiresAt.toISOString(),
    filename: `${baseName}.zip`,
    mimeType: 'application/zip',
  };
}

export async function listClosedBusinessExports(
  database: DatabaseClient,
  userId: string,
) {
  const now = new Date();
  const memberships = await database.membership.findMany({
    include: {
      organization: { select: { deletedAt: true, id: true, name: true } },
    },
    where: { role: MembershipRole.OWNER, userId },
  });
  return memberships.flatMap(({ organization }) => {
    if (!organization.deletedAt) return [];
    const expiresAt = new Date(
      organization.deletedAt.getTime() + EXPORT_WINDOW_MS,
    );
    if (expiresAt <= now) return [];
    return [
      {
        expiresAt: expiresAt.toISOString(),
        id: organization.id,
        name: organization.name,
      },
    ];
  });
}
