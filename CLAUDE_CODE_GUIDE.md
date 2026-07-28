# 🍎 Apple CI Platform - Guia Completo & Arquitetura do Projeto
> **Documento de Handover para Claude Code / Desenvolvedores**  
> **Data de Atualização:** 27 de Julho de 2026

---

## 🎯 1. Visão Geral do Projeto

O **Apple CI Platform** é uma plataforma privada de CI/CD (Continous Integration & Continuous Delivery) desenvolvida para compilar, assinar e publicar aplicativos **iOS (Nativos e Flutter)** na App Store / TestFlight de forma **100% automatizada e headless**, utilizando como servidor de build um **Mac mini 2014** acessado remotamente por SSH/Tailscale.

O sistema foi desenhado para substituir serviços pagos como o Codemagic, oferecendo uma interface web moderna, gerenciamento multi-contas de desenvolvedor Apple, logs em tempo real, auto-incremento de builds, gatilhos automáticos via GitHub Webhooks e otimizações agressivas de consumo de memória RAM e CPU.

---

## 🏗️ 2. Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────┐
│              Apple CI Platform (Web App)                │
│       Next.js 14 (App Router) + SQLite + Prisma         │
│  - Dashboard de Projetos & Histórico de Builds          │
│  - Multi-Contas Apple Developer & API Keys (.p8)        │
│  - Webhook Receiver GitHub (HMAC SHA-256)               │
│  - Painel de Analytics & Botão de Limpeza Inteligente   │
└────────────────────────────┬────────────────────────────┘
                             │ (Fila no SQLite / API REST)
                             ▼
┌─────────────────────────────────────────────────────────┐
│            Mac Mini 2014 (Build Runner Headless)        │
│  - macOS Sequoia (OpenCore Legacy Patcher)              │
│  - IP Tailscale: 100.70.144.46 (User: diovaniomota)    │
│  - Daemon: com.dartsoft.apple-ci-worker (LaunchAgent)   │
│  - Ferramentas: Fastlane (gym/sigh/pilot), Xcode, Pods  │
└────────────────────────────┴────────────────────────────┘
```

---

## 💻 3. Credenciais & Acesso ao Mac Mini Runner

- **Host (IP Tailscale):** `100.70.144.46`
- **Usuário SSH:** `diovaniomota`
- **Senha SSH:** `8588`
- **Diretório do Projeto no Mac:** `/Users/diovaniomota/Documents/apple-ci-platform`
- **Daemon de Execução (LaunchAgent):** `~/Library/LaunchAgents/com.dartsoft.apple-ci-worker.plist`
- **Status do Daemon no Mac:** `launchctl list | grep apple-ci`
- **Script de Diagnóstico Rápido:** `~/Scripts/apple-ci-status.sh`

---

## 🛠️ 4. Tecnologias Utilizadas

- **Frontend / Backend Web:** Next.js 14, React 18, Tailwind CSS / Vanilla CSS, Lucide React Icons.
- **Banco de Dados & ORM:** SQLite com Prisma ORM (`prisma/schema.prisma`).
- **Autenticação:** Sessões personalizadas com hash HMAC SHA-256 e persistência no `localStorage`.
- **Worker de Compilação:** Node.js Worker (`runner/worker.js`) rodando em background no Mac mini.
- **Ferramentas de Build iOS:** Xcode Command Line Tools, Fastlane (`gym`, `sigh`, `pilot`), CocoaPods, Flutter SDK.

---

## ✨ 5. Recursos Implementados & Funcionando

1. **Multi-Contas Apple Developer (`/settings`)**:
   - Cadastro e edição de contas Apple com API Key (`.p8`), Team ID, Key ID, Issuer ID, Match Git URL e Match Password.
   - Associação dinâmica de cada projeto à sua respectiva Conta Apple de desenvolvimento.

2. **Interface Estilo Codemagic & Logs ao Vivo (`/builds/[id]`)**:
   - Timeline sequencial de 12 etapas de compilação.
   - **Regra de Etapa Única Girando**: Apenas 1 etapa fica ativa com animação de spinner (`Loader2` com CSS `@keyframes spin`), enquanto etapas anteriores recebem o check verde (`CheckCircle2`).
   - Botão **`Start new build →`**: Cria instantaneamente um novo build na fila e redireciona o usuário para a página de logs em tempo real.

3. **Gráfico Dinâmico de Performance (`Performance & Duração por Etapa`)**:
   - Progresso percentual e duração calculada em tempo real com base no streaming de logs.

4. **Gatilho Automático via GitHub Webhooks (`/api/webhooks/github`)**:
   - Início automático de compilação ao dar `git push` na branch `main`.
   - Validação de segurança por assinatura HMAC SHA-256 (`X-Hub-Signature-256`).

5. **Auto-Incremento de Build Number**:
   - Injeção automática da versão da compilação no Xcode (`CURRENT_PROJECT_VERSION` e `FLUTTER_BUILD_NUMBER`).

6. **Limpeza Inteligente de Disco SSD (`/analytics`)**:
   - Botão de liberação de espaço no dashboard para remover archives antigos, caches temporários do Xcode e builds de espaço de trabalho.

7. **Tela de Login com "Lembrar Credenciais" (`/login`)**:
   - Persistência de e-mail e senha no `localStorage` com autopreenchimento e suporte a gerenciador de senhas nativo do navegador.

---

## 📁 6. Estrutura de Arquivos Principais

```
d:\apple-ci-platform\
├── app\
│   ├── api\
│   │   ├── analytics\ (Métricas de uso de CPU, RAM e Limpeza de Disco)
│   │   ├── apple-accounts\ (CRUD de Contas Apple)
│   │   ├── auth\ (APIs de Login, Logout e verificação me)
│   │   ├── builds\ (Listagem, criação e download de artefatos)
│   │   ├── projects\ (Gerenciamento de projetos iOS/Flutter)
│   │   └── webhooks\github\ (Receptor de Webhooks do GitHub)
│   ├── builds\[id]\page.js (Tela principal de Logs ao Vivo e Timeline)
│   ├── login\page.js (Tela de Autenticação)
│   ├── settings\page.js (Configurações do Usuário e Contas Apple)
│   └── globals.css (Animações CSS e sistema de temas)
├── prisma\
│   └── schema.prisma (Modelos User, Project, Build, AppleAccount, Setting)
├── runner\
│   ├── worker.js (Daemon principal de execução de builds no Mac)
│   └── fastlane\Fastfile (Template das lanes Fastlane: build_app e upload_app)
└── CLAUDE_CODE_GUIDE.md (Este guia)
```

---

## 📋 7. Próximos Passos Sugeridos para o Claude Code

1. **Ajuste Fino na Assinatura Automática sem Perfil Prévio**:
   - Garantir que o `Fastfile` continue fazendo fallback transparente entre `sigh` (API Key) e assinatura automática quando o perfil App Store ainda não tiver sido criado no portal Apple Connect.
2. **Notificações em Canais Externa**:
   - Adicionar webhooks de notificação no Discord, Telegram ou Slack para enviar alertas de build com sucesso (link da `.ipa`) ou falha.
3. **Download Direto de Arquivos `.ipa`**:
   - Validar se o link de download direto da `.ipa` na seção `Artifacts` da página do build baixa o arquivo compilado com sucesso.

---
*Documento gerado automaticamente para continuidade do projeto.*
