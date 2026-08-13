-- Corrige o HTTP 500 ("server-side exception") no dashboard e no runner.
--
-- CAUSA: os campos abaixo foram adicionados ao prisma/schema.prisma nos commits
-- 0813749 (distribution), 678398c (envVars) e 16967a8 (repoUsername/repoPassword),
-- mas NUNCA foram aplicados ao banco no Supabase. O projeto nao possui pasta
-- prisma/migrations, entao nada aplica o schema automaticamente no deploy.
--
-- `prisma generate` (adicionado ao build no commit e641fe9) apenas regenera o
-- CLIENT em JavaScript a partir do schema. Ele NAO altera o banco de dados.
-- Por isso o Prisma Client passou a pedir colunas que nao existem em Postgres,
-- resultando no erro P2022 e no 500 em Server Components.
--
-- COMO APLICAR: Supabase -> SQL Editor -> cole e execute.
-- E idempotente: pode ser executado mais de uma vez com seguranca.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "distribution" TEXT NOT NULL DEFAULT 'testflight';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "envVars"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "repoUsername" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "repoPassword" TEXT;

-- Verificacao: deve retornar as 4 linhas acima.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Project'
  AND column_name IN ('distribution', 'envVars', 'repoUsername', 'repoPassword')
ORDER BY column_name;
