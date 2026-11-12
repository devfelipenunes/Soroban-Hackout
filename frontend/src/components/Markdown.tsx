import { marked, Renderer } from "marked";
import { useCallback, useMemo, type MouseEvent, type ReactElement } from "react";

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;

  marked.use({
    gfm: true,
    breaks: false,
    walkTokens(token) {
      if (token.type === "html") {
        token.type = "text";
      }
    },
  });
}

type MarkdownProps = {
  source: string;
  copyCommandLabel?: string | undefined;
  onCopyCommand?: ((command: string) => void | Promise<void>) | undefined;
  consoleCode?: "show" | "hide" | undefined;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function sanitizeLinks(html: string): string {
  return html.replace(/\s(href|src)="([^"]*)"/gi, (match, _attribute: string, url: string) => {
    const compact = url.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
    return /^(javascript|vbscript):/.test(compact) ? match.replace(/"[^"]*"/, '"#"') : match;
  });
}

function deviceSource(source: string, consoleCode: "show" | "hide"): string {
  if (consoleCode === "hide") {
    return source.replace(/\[\[desktop-only\]\][\s\S]*?\[\[\/desktop-only\]\]/g, "");
  }
  return source.replace(/\[\[\/?desktop-only\]\]/g, "");
}

function consoleBlock(text: string, label: string): string {
  const lines = text.replace(/\n$/, "").split("\n");
  return `<div class="markdown__commands">${lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const escaped = escapeHtml(line);
      if (line.trimStart().startsWith("//")) {
        return `<div class="markdown__command-note"><code>${escaped}</code></div>`;
      }
      return [
        '<div class="markdown__command">',
        `<code>${escaped}</code>`,
        `<button type="button" class="button button--secondary markdown__command-copy" data-copy-command aria-label="${escapeHtml(`${label}: ${line.trim()}`)}">${escapeHtml(label)}</button>`,
        "</div>",
      ].join("");
    })
    .join("")}</div>`;
}

export function Markdown({
  source,
  copyCommandLabel,
  onCopyCommand,
  consoleCode = "show",
}: MarkdownProps): ReactElement {
  const html = useMemo(() => {
    configure();
    const renderer = new Renderer();
    const defaultCode = renderer.code.bind(renderer);
    renderer.code = (token) => {
      if (consoleCode === "hide" && token.lang === "js") return "";
      if (copyCommandLabel === undefined || token.lang !== "js") return defaultCode(token);
      return consoleBlock(token.text, copyCommandLabel);
    };
    return sanitizeLinks(
      marked.parse(deviceSource(source, consoleCode), {
        async: false,
        renderer,
      }),
    );
  }, [consoleCode, copyCommandLabel, source]);

  const copyCommand = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy-command]");
      if (button === null || onCopyCommand === undefined) return;
      const command = button.parentElement?.querySelector("code")?.textContent;
      if (command !== undefined && command !== null) void onCopyCommand(command);
    },
    [onCopyCommand],
  );

  return (
    <div
      className={copyCommandLabel === undefined ? "markdown" : "markdown markdown--commands"}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={copyCommandLabel === undefined ? undefined : copyCommand}
    />
  );
}
