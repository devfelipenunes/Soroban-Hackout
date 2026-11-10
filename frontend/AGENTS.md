# Frontend

> **Estado:** instruções locais de desenvolvimento e validação.

- Leia `package.json` para comandos e dependências; `src/App.tsx` para rotas.
- Use a versão de Node em `.node-version`. Instalação reproduzível: `npm ci`.
- Desenvolvimento: `npm run dev`. Verificação: `npm test` e `npm run build`, neste diretório.
- TypeScript estrito, sem `any`; preserve os tipos existentes e o conteúdo PT-BR/EN/espanhol neutro latino-americano.
- `src/contracts/` contém bindings gerados. Corrija a origem e regenere pelo fluxo de deploy autorizado, em vez de editar o resultado manualmente.
- `src/levels/manifest.test.ts` verifica consistência entre catálogo, contratos e conteúdo.
- `src/styles/base.css` mantém a ordem dos imports de estilo. Edite o arquivo temático correspondente, não o agregador.
- `LevelHero.tsx` renderiza os slides e controla carregamento, navegação e gestos do carrossel.
- `BreakerDevice.tsx` mantém o shell, o estado e os apps do dispositivo.
- `src/levels/story/` e `src/levels/book/` são conteúdo ativo do jogo; não confunda com pastas de referência na raiz.
- Login mockado não é autenticação. `localStorage` não prova conclusão de caso.
- Para alterações de interface, confira estados de carregamento, erro e ausência de carteira, teclado, mobile e movimento reduzido. Só declare conferência visual se tiver aberto o app.
