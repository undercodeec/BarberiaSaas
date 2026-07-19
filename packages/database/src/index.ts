import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './generated/prisma/enums';

export interface CreateDatabaseClientOptions {
  readonly connectionString: string;
}

export function createDatabaseClient({
  connectionString,
}: CreateDatabaseClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
