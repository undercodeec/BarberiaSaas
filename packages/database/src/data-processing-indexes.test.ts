import { afterAll, describe, expect, it } from 'vitest';

import { createDatabaseClient } from './index';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('índices para procesamiento escalable', () => {
  const database = createDatabaseClient({ connectionString: testDatabaseUrl! });

  afterAll(async () => database.$disconnect());

  it('instala pg_trgm y los índices de los contratos v2', async () => {
    const indexes = await database.$queryRaw<
      readonly { readonly indexname: string }[]
    >`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const extensions = await database.$queryRaw<
      readonly { readonly extname: string }[]
    >`SELECT extname FROM pg_extension`;

    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'clients_active_name_cursor_idx',
        'clients_full_name_trgm_idx',
        'clients_phone_trgm_idx',
        'clients_phone_digits_idx',
        'clients_email_trgm_idx',
        'clients_organization_full_name_trgm_idx',
        'appointments_location_starts_cursor_idx',
        'products_status_name_cursor_idx',
        'products_name_trgm_idx',
        'stock_movements_location_created_cursor_idx',
      ]),
    );
    expect(extensions.map(({ extname }) => extname)).toContain('pg_trgm');
  });
});
