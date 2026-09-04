// Remove segredos das respostas da API.
//
// A chave .p8 da App Store Connect (ascKeyContent), a passphrase do match e a
// senha do repositorio nunca sao necessarias no navegador: quem as usa e o
// runner, que le direto do banco. Manda-las para o cliente so aumenta a
// superficie de exposicao - e ate agora elas saiam em /api/apple-accounts e
// /api/projects, que respondiam sem autenticacao alguma.
//
// No lugar do valor vai um booleano `has*`, para a interface conseguir mostrar
// se o segredo esta configurado sem receber o conteudo.

export function redactAppleAccount(account) {
  if (!account) return account;
  const { ascKeyContent, matchPassword, ...resto } = account;
  return {
    ...resto,
    hasAscKeyContent: Boolean(ascKeyContent),
    hasMatchPassword: Boolean(matchPassword),
  };
}

export function redactProject(project) {
  if (!project) return project;
  const { repoPassword, ...resto } = project;
  const limpo = { ...resto, hasRepoPassword: Boolean(repoPassword) };
  // `appleAccount` so vem quando a query usa include; preservar o formato.
  if ('appleAccount' in resto) {
    limpo.appleAccount = redactAppleAccount(resto.appleAccount);
  }
  return limpo;
}

// Chaves de Setting cujo valor nunca deve trafegar para o cliente.
const SETTINGS_SENSIVEIS = new Set(['ASC_KEY_CONTENT', 'MATCH_PASSWORD']);

export function redactSettings(objeto) {
  const saida = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (SETTINGS_SENSIVEIS.has(chave)) {
      // Preserva a nocao de "esta configurado" sem revelar o conteudo.
      saida[chave] = valor ? '__CONFIGURADO__' : '';
    } else {
      saida[chave] = valor;
    }
  }
  return saida;
}
