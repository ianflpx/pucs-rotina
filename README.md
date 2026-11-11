# PUCS

App de rotina: tarefas (estilo Todoist), hábitos, dieta, treino, cardio, peso e financeiro.
Funciona no computador e no celular (dá para instalar na tela inicial). Os dados ficam salvos
numa conta sua no Supabase (banco de dados gratuito), então aparecem em qualquer aparelho.

Vite + React + TypeScript, offline-first (salva no aparelho e sincroniza com o Supabase).

## 1. O que precisa ter instalado

- [Node.js](https://nodejs.org) versão 20 ou mais nova (baixar o "LTS").
- [Git](https://git-scm.com/downloads).

## 2. Baixar e rodar no computador

```
git clone <link deste repositório>
cd pucs-rotina
npm install
```

## 3. Criar o banco (Supabase, grátis)

1. Criar conta em https://supabase.com e um projeto novo (região São Paulo).
2. Em **Project Settings > API**, copiar a **Project URL** e a **publishable key**.
3. Copiar o arquivo `.env.example` para `.env.local` e colar esses dois valores nele.
4. Abrir o arquivo `supabase/schema.sql`, trocar `SEU-PROJETO` e `SUA-CHAVE-PUBLICA` (perto do
   fim do arquivo) pelos seus, colar tudo no **SQL Editor** do Supabase e clicar em **Run**.
   Se aparecer um aviso sobre RLS, escolher **Run and enable RLS**.
5. Criar o seu login: **Authentication > Users > Add user > Create new user**, com e-mail e senha,
   marcando **Auto Confirm User**. O app não tem botão de cadastro, de propósito: só você entra.
6. Em **Authentication > Sign In / Providers**, desligar **Allow new users to sign up**
   (ninguém mais consegue criar conta no seu banco).

Depois disso:

```
npm run dev
```

e abrir http://localhost:5199 no navegador, entrando com o e-mail e a senha do passo 5.

## 4. Publicar para usar no celular (Vercel, grátis)

1. Subir este código para um repositório seu no GitHub.
2. Em https://vercel.com, **Add New > Project**, escolher o repositório.
3. Em **Environment Variables**, colocar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
   (os mesmos do `.env.local`) e clicar em **Deploy**.
4. No Supabase, em **Authentication > URL Configuration**, colocar o endereço que a Vercel deu
   (ex.: `https://meu-pucs.vercel.app`) em **Site URL**.
5. No celular, abrir esse endereço e usar "Adicionar à Tela de Início".

## 5. Notificações (opcional)

Os lembretes de tarefa, rotina e descanso do treino usam a função `notify`:

1. No Supabase, **Edge Functions > Deploy a new function > Via Editor**, nome `notify`, e colar o
   conteúdo de `supabase/functions/notify/index.ts`.
2. Antes de publicar, trocar `https://SEU-APP.vercel.app` (no começo do arquivo) pelo endereço da
   Vercel.
3. No app, em **Ajustes**, ativar as notificações. No iPhone só funciona com o app instalado na
   Tela de Início (iOS 16.4 ou mais novo).

## Personalizar

- **Seu nome:** em Ajustes, dentro do app.
- **Dieta, treino, rotina e hábitos iniciais:** em `src/data/seed.ts`. Tudo também dá para editar
  pelo próprio app depois de entrar.
- **Financeiro:** a tela importa o CSV da fatura do Nubank e o CSV da fatura Unicred. Para os
  extratos em PDF, usar o script:

  ```
  npx esbuild scripts/import-finance.ts --bundle --platform=node --outfile=scripts/import-finance.cjs
  node scripts/import-finance.cjs <arquivos csv e pdf...> > import/financas.json
  ```

  (precisa do `pdftotext`, que vem no pacote Poppler) e importar `import/financas.json` pelo botão
  "Importar extratos". A pasta `import/` fica fora do git: extrato é dado pessoal, nunca colocar
  em `public/`. Em `src/lib/finance.ts`, trocar `OWN_NAMES` pelo seu nome como aparece no extrato,
  para transferência entre as suas contas não contar como devolução.

## Testes

```
npm run test:workout
npm run build
```
