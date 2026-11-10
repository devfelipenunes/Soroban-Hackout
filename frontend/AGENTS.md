# Frontend

> **State:** local development and validation instructions.

- Read `package.json` for commands and dependencies; `src/App.tsx` for routes.
- Use the Node version in `.node-version`. Reproducible install: `npm ci`.
- Development: `npm run dev`. Verification: `npm test` and `npm run build`, in this directory.
- Strict TypeScript, no `any`; preserve existing types and the PT-BR/EN/neutral Latin American Spanish content.
- `src/contracts/` contains generated bindings. Fix the source and regenerate through the authorized deploy flow; do not edit the result by hand.
- `src/levels/manifest.test.ts` verifies consistency between catalog, contracts and content.
- `src/styles/base.css` keeps the style import order. Edit the matching theme file, not the aggregator.
- `LevelHero.tsx` renders the slides and controls loading, navigation and carousel gestures.
- `BreakerDevice.tsx` keeps the device shell, state and apps.
- `src/levels/story/` and `src/levels/book/` are active game content; do not confuse them with reference folders in the root.
- A mocked login is not authentication. `localStorage` does not prove case completion.
- For UI changes, check loading, error and no-wallet states, keyboard, mobile and reduced motion. Only claim a visual check if you opened the app.
