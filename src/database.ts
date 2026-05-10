import { PrismaClient } from '@prisma/client';

/**
 * Um único PrismaClient por processo + pool explícito evita timeouts ao montar vários gráficos em paralelo
 * (várias instâncias antigas multiplicavam connection_limit=5 cada).
 */
function getPooledDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  const url = raw.replace(/^["']|["']$/g, '');
  if (/[?&]connection_limit=/i.test(url)) {
    return url;
  }
  const limit = process.env.DATABASE_CONNECTION_LIMIT || '15';
  const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || '30';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${limit}&pool_timeout=${poolTimeout}`;
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getPooledDatabaseUrl(),
    },
  },
});

