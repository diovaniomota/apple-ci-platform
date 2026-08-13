"use client";

// Error boundary do App Router.
//
// Sem este arquivo, qualquer excecao nao tratada em um Server Component vira a
// tela generica da Vercel ("Application error: a server-side exception has
// occurred"), que esconde a causa e mostra apenas um digest. Aqui pelo menos
// exibimos o digest (usado para achar o stack trace em Vercel -> Logs) e damos
// um caminho de recuperacao sem precisar recarregar tudo na mao.

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[app] Erro nao tratado:', error);
  }, [error]);

  return (
    <div style={{ padding: '48px 20px', maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '12px', color: '#f8fafc' }}>
        Algo deu errado neste painel
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '20px' }}>
        A pagina falhou ao renderizar no servidor. Se isso comecou logo apos um deploy,
        normalmente significa que o banco esta desatualizado em relacao ao{' '}
        <code>prisma/schema.prisma</code>.
      </p>

      {error?.digest && (
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b', marginBottom: '24px' }}>
          Digest: {error.digest} (procure por este id em Vercel &rarr; Logs)
        </p>
      )}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={() => reset()} className="btn-primary">
          Tentar novamente
        </button>
        <Link href="/login">
          <button
            className="btn-primary"
            style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Ir para o login
          </button>
        </Link>
      </div>
    </div>
  );
}
