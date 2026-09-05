import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './generated/prisma/enums';

export interface CreateDatabaseClientOptions {
  readonly connectionString: string;
  readonly queryObserver?: (event: { readonly durationMs: number }) => void;
}

export function createDatabaseClient({
  connectionString,
  queryObserver,
}: CreateDatabaseClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  if (!queryObserver) return new PrismaClient({ adapter });

  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });
  client.$on('query', (event) => queryObserver({ durationMs: event.duration }));
  return client;
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
