// Verificacao central do token de sessao.
//
// Antes, cada rota decidia por conta propria se validava o JWT, e 11 das 17 nao
// validavam nada - confiavam no middleware. So que o middleware apenas checava se
// o cookie EXISTIA, sem conferir a assinatura: qualquer `auth_token=x` passava.
// Rotas que devolviam ascKeyContent (a chave .p8 da App Store Connect) ficavam
// acessiveis a quem soubesse a URL. Este modulo existe para que a verificacao
// tenha um unico lugar, usado tanto pelo middleware quanto pelas rotas.
//
// Implementado com Web Crypto (crypto.subtle) em vez de node:crypto porque o
// middleware do Next 14 roda no runtime Edge, onde node:crypto nao existe. Web
// Crypto esta disponivel nos dois runtimes, entao a mesma funcao serve aos dois.

// TODO(seguranca): este fallback esta num repositorio publico, e a Vercel nunca
// definiu JWT_SECRET - ou seja, a producao assina com ele hoje. Trocar por
// `throw` assim que a variavel estiver configurada nos dois ambientes. Atencao:
// o hash de senha tambem deriva desta chave (sem salt), entao troca-la invalida
// TODAS as senhas do banco e exige reset coordenado.
const JWT_SECRET =
  process.env.JWT_SECRET || 'apple-ci-platform-super-secret-key-2026';

const encoder = new TextEncoder();

function base64UrlToBytes(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Comparacao em tempo constante: comparar assinaturas com === vaza, pelo tempo
// de resposta, quantos caracteres iniciais o atacante acertou.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Valida a assinatura e a expiracao do token.
 * @returns {Promise<object|null>} payload do usuario, ou null se invalido.
 */
export async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const assinatura = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${header}.${body}`)
    );

    if (!timingSafeEqual(signature, bytesToBase64Url(new Uint8Array(assinatura)))) {
      return null;
    }

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body))
    );

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extrai e valida o usuario de uma request.
 * @returns {Promise<object|null>}
 */
export async function getUserFromRequest(request) {
  return verifyToken(request.cookies.get('auth_token')?.value);
}
