// @vitest-environment jsdom
import { StrictMode, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BreakerDevice } from "./BreakerDevice.tsx";
import { LanguageProvider } from "../i18n/language.tsx";
import { LEVELS, type Level } from "../levels/index.ts";
import type { CaseNarrative } from "../levels/useCaseNarrative.ts";

const scrollIntoView = vi.fn();

const caseState: CaseNarrative = {
  fired: [],
  revealed: new Set(),
  calls: [],
  hintLevel: 0,
  hints: [],
  assisted: false,
  choices: {},
  requestHint: () => {},
  chooseTone: () => {},
  clear: () => {},
};

function device(level: Level | null = null): ReactElement {
  return (
    <StrictMode>
      <LanguageProvider>
        <MemoryRouter>
          <BreakerDevice
            level={level}
            narrative={null}
            player="GPLAYER"
            instance={undefined}
            caseFile={null}
            solved={false}
            open
            onToggle={() => {}}
            caseState={caseState}
            focus={null}
            contractSpec={[]}
          />
        </MemoryRouter>
      </LanguageProvider>
    </StrictMode>
  );
}

function unlock(): void {
  fireEvent.click(document.querySelector(".device__fingerprint") as Element);
  act(() => vi.advanceTimersByTime(700));
  act(() => vi.advanceTimersByTime(350));
  expect(document.querySelector(".device")?.classList.contains("device--locked")).toBe(false);
  expect(document.activeElement).toBe(
    document.querySelector(".device__mission-action"),
  );
}

function openSearch(): HTMLInputElement {
  const button = [...document.querySelectorAll(".device__phone-controls button")].find(
    (item) => item.textContent?.includes("Buscar"),
  );
  if (!button) throw new Error("search button not found");
  fireEvent.click(button);
  return document.querySelector(".device__search-box input") as HTMLInputElement;
}

beforeEach(() => {
  localStorage.setItem("breaker.language", "pt-BR");
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Breaker OS", () => {
  it("boots once under StrictMode and then reveals the lock screen", () => {
    render(device());

    expect(screen.getByText("Iniciando sistema")).toBeTruthy();
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByText("Iniciando sistema")).toBeNull();
    expect(document.querySelector(".device__lockscreen")).not.toBeNull();
  });

  it("filters the spotlight and activates the first result with Enter", () => {
    render(device());
    act(() => vi.advanceTimersByTime(800));
    unlock();

    const input = openSearch();
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("role")).toBe("combobox");

    fireEvent.change(input, { target: { value: "terminal" } });
    const selected = document.querySelector(".device__system-row.is-selected");
    expect(selected?.textContent).toContain("Terminal");
    expect(selected?.getAttribute("role")).toBe("option");
    expect(selected?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      "device-search-option-0",
    );
    expect(input.getAttribute("aria-controls")).toBe("device-search-listbox");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.querySelector(".device__app-title")?.textContent).toBe("Terminal");
  });

  it("moves the spotlight selection with the arrow keys", () => {
    render(device());
    act(() => vi.advanceTimersByTime(800));
    unlock();

    const input = openSearch();
    fireEvent.change(input, { target: { value: "a" } });
    const first = document.querySelector(".device__system-row.is-selected")?.textContent;
    scrollIntoView.mockClear();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = document.querySelector(".device__system-row.is-selected")?.textContent;

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("leaves the spotlight from the input without closing the OS", () => {
    render(device());
    act(() => vi.advanceTimersByTime(800));
    unlock();

    const input = openSearch();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(document.querySelector(".device__home")).not.toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(".device__mission-action"),
    );
  });

  it("turns Escape into back before the dialog can close", () => {
    render(device());
    act(() => vi.advanceTimersByTime(800));
    unlock();
    openSearch();

    const escape = (): boolean =>
      window.dispatchEvent(
        new CustomEvent("breaker:os-escape", { cancelable: true }),
      );

    let handled = true;
    act(() => {
      handled = escape();
    });
    expect(handled).toBe(false);
    expect(document.querySelector(".device__home")).not.toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(".device__mission-action"),
    );

    let closed = false;
    act(() => {
      closed = escape();
    });
    expect(closed).toBe(true);
  });

  it("keeps the case card and its actions on one surface", () => {
    render(device(LEVELS[0] as Level));
    act(() => vi.advanceTimersByTime(800));
    unlock();

    const mission = document.querySelector(".device__mission");
    expect(mission).not.toBeNull();
    expect(mission?.textContent).toContain("Sem instância");
    expect(mission?.textContent).toContain("0 chamadas");
    expect(mission?.textContent).toContain("0 evidências");
    expect(document.querySelector(".device__case-widget")).toBeNull();
    expect(
      [...document.querySelectorAll(".device__tile .device__label")].map(
        (item) => item.textContent,
      ),
    ).not.toContain("Notas");

    const actions = [...(mission?.querySelectorAll(".device__mission-action") ?? [])];
    expect(actions).toHaveLength(1);
    expect(actions[0]?.textContent).toContain("Continuar investigação");
  });
});
