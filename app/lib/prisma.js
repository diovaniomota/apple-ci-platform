import { PrismaClient } from '@prisma/client';

// Cliente Prisma compartilhado.
//
// Antes, cada route handler fazia `new PrismaClient()` no escopo do modulo (14
// arquivos). Em serverless cada lambda da Vercel carrega varios modulos, e cada
// instancia abre seu proprio pool de conexoes contra o Postgres do Supabase.
// Sob concorrencia isso estoura o limite de conexoes e gera 500 intermitentes
// ("too many connections" / "Timed out fetching a new connection from the pool").
//
// Reaproveitar a instancia via globalThis tambem evita vazamento de conexoes no
// hot-reload do `next dev`, que reavalia os modulos a cada alteracao.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
