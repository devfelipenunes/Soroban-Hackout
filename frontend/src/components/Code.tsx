import { useEffect, useState, type ReactElement } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import rust from "shiki/langs/rust.mjs";
import darkTheme from "shiki/themes/github-dark.mjs";

const THEME = "github-dark";

let pending: Promise<HighlighterCore> | null = null;

function highlighter(): Promise<HighlighterCore> {
  pending ??= createHighlighterCore({
    themes: [darkTheme],
    langs: [rust],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  });

  return pending;
}

type HighlightState =
  | { phase: "loading" }
  | { phase: "ready"; html: string }
  | { phase: "unavailable" };

export function Code({ source, lang = "rust" }: { source: string; lang?: string }): ReactElement {
  const [state, setState] = useState<HighlightState>({ phase: "loading" });

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const highlight = await highlighter();
        const html = highlight.codeToHtml(source, { lang, theme: THEME });
        if (alive) setState({ phase: "ready", html });
      } catch {
        if (alive) setState({ phase: "unavailable" });
      }
    })();

    return () => {
      alive = false;
    };
  }, [source, lang]);

  if (state.phase === "ready") {
    return <div className="code-highlighted" dangerouslySetInnerHTML={{ __html: state.html }} />;
  }

  return (
    <pre className="code-raw" data-loading={state.phase === "loading"}>
      <code>{source}</code>
    </pre>
  );
}
