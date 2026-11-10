#!/usr/bin/env node
const { execFileSync, spawn } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { createRequire } = require("node:module");

const ROOT = resolve(__dirname, "..");
const FRONTEND = join(ROOT, "frontend");
const frontendRequire = createRequire(join(FRONTEND, "package.json"));

const PASSPHRASE = "Test SDF Network ; September 2015";
const NETWORK = "testnet";
const DEFAULT_PORT = 5180;

const argv = process.argv.slice(2);

function flagValue(name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

const SIGN = argv.includes("--sign");
const LEVEL = Number(flagValue("--level", "10"));
const SOURCE = process.env.SOURCE || (SIGN ? "sandbox" : "sandbox3");
const PORT = Number(process.env.VITE_PORT || DEFAULT_PORT);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const START_SERVER = !process.env.BASE_URL;

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`uso: node scripts/ui-check.cjs [--sign] [--level 10|11|12]

  sem --sign  abre a instância mais recente do jogador e confere as leituras
              (eta/payload/original/predecessor com op_id, relógio de ledger,
              manifest/historical_manifest no 11 e evidência/payload no 12).
              Não assina nada.
  --sign      cria uma instância nova, executa o exploit e submete, com as
              assinaturas feitas por um servidor local em Node. A chave é lida
              de \`stellar keys secret SOURCE\`, fica só no processo Node e nunca
              é enviada à página.

  variáveis: SOURCE (padrão: sandbox3, ou sandbox com --sign), VITE_PORT,
             BASE_URL, PLAYWRIGHT_MODULE, CHROME_PATH`);
  process.exit(0);
}

if (![10, 11, 12].includes(LEVEL)) {
  console.error("✗ --level aceita 10, 11 ou 12");
  process.exit(2);
}

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  const cache = join(homedir(), ".npm", "_npx");
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache)) {
      const path = join(cache, entry, "node_modules", "playwright");
      if (!existsSync(path)) continue;
      try {
        return require(path);
      } catch {}
    }
  }
  throw new Error("Playwright não encontrado: instale playwright-core ou defina PLAYWRIGHT_MODULE");
}

function stellar(args, options = {}) {
  return execFileSync("stellar", args, { encoding: "utf8", ...options }).trim();
}

const ADDRESS = stellar(["keys", "address", SOURCE]);
const CORE = JSON.parse(readFileSync(join(ROOT, "deployments.sandbox.json"), "utf8")).contracts
  .breaker_core.id;

function isCompleted(level) {
  const out = stellar([
    "contract", "invoke", "--id", CORE, "--source-account", SOURCE, "--network", NETWORK,
    "--", "is_completed", "--player", ADDRESS, "--level_id", String(level),
  ]);
  return out.endsWith("true");
}

function hasInstance(level) {
  const out = stellar([
    "contract", "invoke", "--id", CORE, "--source-account", SOURCE, "--network", NETWORK,
    "--", "instances", "--player", ADDRESS, "--level_id", String(level),
  ]);
  return out.trim() !== "[]";
}

async function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Vite não respondeu em ${url}`);
}

function startVite() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    {
      cwd: FRONTEND,
      env: { ...process.env, VITE_DEPLOYMENT_PROFILE: "sandbox" },
      stdio: "ignore",
      detached: true,
    },
  );
  return child;
}

function stop(child) {
  if (!child || child.killed) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

function startSigner() {
  const { Keypair, TransactionBuilder } = frontendRequire("@stellar/stellar-sdk");
  const keypair = Keypair.fromSecret(stellar(["keys", "secret", SOURCE]));
  const token = randomBytes(16).toString("hex");
  const origin = new URL(BASE).origin;

  const server = createServer((request, response) => {
    if (request.headers.origin !== origin) {
      response.writeHead(403);
      response.end();
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const reply = (status, value) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (new URL(request.url, "http://127.0.0.1").searchParams.get("token") !== token) {
        reply(403, { error: "bad token" });
        return;
      }
      try {
        const { xdr } = JSON.parse(body);
        if (request.url.startsWith("/sign-tx")) {
          const transaction = TransactionBuilder.fromXdr(xdr, PASSPHRASE);
          transaction.sign(keypair);
          reply(200, { signedTxXdr: transaction.toXdr() });
          return;
        }
        if (request.url.startsWith("/sign-auth")) {
          const digest = createHash("sha256").update(Buffer.from(xdr, "base64")).digest();
          reply(200, { signedAuthEntry: keypair.sign(digest).toString("base64") });
          return;
        }
        reply(404, { error: "unknown route" });
      } catch (error) {
        reply(500, { error: String(error) });
      }
    });
  });

  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      done({
        url: `http://127.0.0.1:${server.address().port}`,
        token,
        close: () => server.close(),
      });
    });
  });
}

function engineBody(signer) {
  const signerBody = signer
    ? `signer: {
        signTransaction: async (xdr) => (await (await fetch("${signer.url}/sign-tx?token=${signer.token}", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ xdr }),
        })).json()).signedTxXdr,
        signAuthEntry: async (xdr) => (await (await fetch("${signer.url}/sign-auth?token=${signer.token}", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ xdr }),
        })).json()).signedAuthEntry,
      },`
    : `signer: {
        signTransaction: async () => { throw new Error("ui-check sem --sign não assina"); },
        signAuthEntry: async () => { throw new Error("ui-check sem --sign não assina"); },
      },`;

  return `export const realEngine = {
    testOnly: false,
    detect: async () => ({ kind: "available", wallet: "ui-check" }),
    connect: async () => ({ address: "${ADDRESS}", rightNetwork: true, ${signerBody} }),
    disconnect: async () => {},
  };`;
}

async function connect(page) {
  await page.goto(`${BASE}/level/${LEVEL}`);
  const button = page.getByRole("button", { name: /conectar carteira|connect wallet/i });
  await button.first().waitFor();
  await button.first().click();
  await page.waitForFunction(() => location.pathname !== "/login", null, { timeout: 30000 });
  await page.evaluate((level) => {
    history.pushState({}, "", `/level/${level}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, LEVEL);
}

async function waitForContract(page, previous = null) {
  await page.waitForFunction(
    (before) =>
      Boolean(window.contract && window.player && window.instance) && window.instance !== before,
    previous,
    { timeout: 30000 },
  );
}

async function createInstance(page) {
  const before = await page.evaluate(() => window.instance ?? null);
  const button = page.getByRole("button", {
    name: /criar instância|create instance|nova instância|new instance/i,
  });
  await button.first().waitFor();
  await button.first().click();
  await waitForContract(page, before);
}

async function waitForTimelock(page) {
  await page.waitForFunction(
    () => /chegou|ready/i.test(document.querySelector(".ledger-clock")?.textContent ?? ""),
    null,
    { timeout: 90000 },
  );
}

async function submit(page) {
  const button = page.getByRole("button", { name: /submeter|submit/i });
  await button.first().waitFor();
  await button.first().click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Objetivo cumprido") ||
      document.body.innerText.includes("Objective met"),
    null,
    { timeout: 60000 },
  );
}

function instanceCall(instance, args) {
  return stellar([
    "contract", "invoke", "--id", instance, "--source-account", SOURCE,
    "--network", NETWORK, "--", ...args,
  ]);
}

function caseVariant(hex) {
  const text = Buffer.from(hex, "hex").toString("ascii");
  return Buffer.from(text.toUpperCase(), "ascii").toString("hex");
}

async function exploit10(page) {
  await waitForTimelock(page);
  await page.evaluate(async (player) => {
    await window.contract.execute({ op_id: 1 });
    await window.contract.rewrite_payload({
      op_id: 0,
      payload: { tag: "GrantSpireAccess", values: [player] },
    });
    await window.contract.execute({ op_id: 0 });
  }, ADDRESS);
}

async function exploit11(page) {
  await page.evaluate(async () => {
    const shares = await Promise.all([0, 1, 2].map((index) =>
      window.contract.evidence_share({ index })));
    const key = Uint8Array.from({ length: 32 }, (_, index) =>
      shares[0][index] ^ shares[1][index] ^ shares[2][index]);
    await window.contract.unlock_evidence({ key });
    await window.contract.verify_history({
      signature: await window.contract.historical_signature(),
    });
    const historical = await window.contract.historical_manifest();
    const variant = new TextEncoder().encode(
      new TextDecoder().decode(historical).toUpperCase(),
    );
    await window.contract.verify_manifest({ manifest: variant });
    await window.contract.recover_proof({ decoder: window.aux, fragment: variant });
  });
}

async function exploit12(page) {
  await page.evaluate(async (player) => {
    const shares = await Promise.all([0, 1, 2].map((index) =>
      window.contract.evidence_share({ index })));
    const key = Uint8Array.from({ length: 32 }, (_, index) =>
      shares[0][index] ^ shares[1][index] ^ shares[2][index]);
    await window.contract.unlock_evidence({ key });
    await window.contract.verify_history({
      signature: await window.contract.historical_signature(),
    });
    await window.contract.verify_evidence({ manifest: await window.contract.manifest() });
    await window.contract.rewrite_payload({
      payload: { tag: "OpenForensicSession", values: ["GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"] },
    });
    await window.contract.execute();
    await window.contract.open_forensic_session({ player });
  }, ADDRESS);
}

async function main() {
  if (!SIGN && !hasInstance(LEVEL)) {
    throw new Error(`${SOURCE} ainda não tem uma instância do caso ${LEVEL}; use --sign com uma conta de teste`);
  }

  if (SIGN && isCompleted(LEVEL)) {
    throw new Error(
      `${SOURCE} já venceu o caso ${LEVEL} na sandbox; use uma conta sem a conclusão (SOURCE=...)`,
    );
  }

  const vite = START_SERVER ? startVite() : null;
  let signer = null;

  try {
    if (START_SERVER) await waitForServer(BASE);
    if (SIGN) signer = await startSigner();

    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox"],
    });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(20000);

      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !/favicon/i.test(message.text())) {
          errors.push(`console: ${message.text()}`);
        }
      });

      await page.addInitScript(() => {
        localStorage.setItem("breaker.wallet.entry", "1");
        localStorage.setItem("breaker.language", "pt-BR");
      });
      await page.route("**/src/wallet/real-engine.ts*", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: engineBody(signer),
        }),
      );

      await connect(page);

      if (!SIGN) {
        await waitForContract(page);
        const probe = await page.evaluate(async (level) => {
          if (level === 10) {
            return {
              eta: await window.contract.eta({ op_id: 0 }),
              predecessor: await window.contract.predecessor({ op_id: 0 }),
              payload: await window.contract.payload({ op_id: 0 }),
              original: await window.contract.original({ op_id: 0 }),
              clock: document.querySelector(".ledger-clock")?.textContent ?? null,
            };
          }
          if (level === 12) {
            return {
              eta: await window.contract.eta(),
              original: await window.contract.original(),
              payload: await window.contract.payload(),
              evidence: await window.contract.evidence_verified(),
              clock: document.querySelector(".ledger-clock")?.textContent ?? null,
            };
          }
          return {
            historical: await window.contract.historical_manifest(),
            current: await window.contract.manifest(),
            verify: typeof window.contract.verify_manifest,
          };
        }, LEVEL);

        if (LEVEL === 10) {
          if (typeof probe.eta !== "number") throw new Error("eta({ op_id: 0 }) não devolveu número");
          if (Number(probe.predecessor) !== 1) throw new Error("predecessor({ op_id: 0 }) não é 1");
          if (probe.original.tag !== "OpenMaintenanceHatch") {
            throw new Error("original({ op_id: 0 }) não é o hatch");
          }
          if (!["OpenMaintenanceHatch", "GrantSpireAccess", "RotateServiceKey"].includes(probe.payload.tag)) {
            throw new Error("payload({ op_id: 0 }) não devolveu um payload conhecido");
          }
          if (!probe.clock) throw new Error("o relógio de ledger não renderizou");
        } else if (LEVEL === 12) {
          if (typeof probe.eta !== "number") throw new Error("eta() não devolveu número");
          if (probe.original.tag !== "DiagnoseCore" || probe.payload.tag !== "DiagnoseCore") {
            throw new Error("o 12 não começou com DiagnoseCore");
          }
          if (probe.evidence !== false) throw new Error("a evidência do 12 já nasceu verificada");
          if (!probe.clock) throw new Error("o relógio de ledger não renderizou");
        } else {
          if (!probe.historical || !probe.current) throw new Error("os manifestos não responderam");
          if (probe.verify !== "function") throw new Error("verify_manifest ausente no cliente");
        }
      } else {
        await createInstance(page);
        if (LEVEL === 10) await exploit10(page);
        else if (LEVEL === 11) await exploit11(page);
        else {
          await page.evaluate(async () => {
            const shares = await Promise.all([0, 1, 2].map((index) => window.contract.evidence_share({ index })));
            const key = Uint8Array.from({ length: 32 }, (_, index) => shares[0][index] ^ shares[1][index] ^ shares[2][index]);
            await window.contract.unlock_evidence({ key });
            await window.contract.verify_history({ signature: await window.contract.historical_signature() });
            await window.contract.verify_evidence({ manifest: await window.contract.manifest() });
          });
          await waitForTimelock(page);
          await exploit12(page);
        }

        const state = await page.evaluate(async (level) => {
          if (level === 10) {
            return {
              access: await window.contract.access({ player: window.player }),
              rewritten: await window.contract.rewritten(),
              key: await window.contract.key_rotated(),
              hatch: await window.contract.hatch_open(),
            };
          }
          if (level === 12) {
            return {
              evidence: await window.contract.evidence_verified(),
              rewritten: await window.contract.rewritten(),
              session: await window.contract.session({ player: window.player }),
              original: await window.contract.original(),
              executed: await window.contract.executed_payload(),
            };
          }
          const accepted = await window.contract.verified_manifest();
          const historical = await window.contract.historical_manifest();
          const variant =
            accepted &&
            historical &&
            accepted.length === historical.length &&
            accepted.some((byte, index) => byte !== historical[index]);
          return { context: await window.contract.context_verified(), acceptedIsVariant: Boolean(variant) };
        }, LEVEL);

        if (LEVEL === 10) {
          if (!state.access || !state.rewritten || !state.key || state.hatch) {
            throw new Error(`estado inesperado no 10: ${JSON.stringify(state)}`);
          }
        } else if (LEVEL === 11 && (!state.context || !state.acceptedIsVariant)) {
          throw new Error(`estado inesperado no 11: ${JSON.stringify(state)}`);
        } else if (LEVEL === 12 && (
          !state.evidence || !state.rewritten || !state.session ||
          state.original.tag !== "DiagnoseCore" ||
          state.executed?.tag !== "OpenForensicSession" ||
          state.executed.values?.[0] === ADDRESS
        )) {
          throw new Error(`estado inesperado no 12: ${JSON.stringify(state)}`);
        }

        if (LEVEL === 11) {
          const instance = await page.evaluate(() => window.instance);
          const exact = instanceCall(instance, ["historical_manifest"]).replaceAll('"', "");
          const variant = caseVariant(exact);
          const refused = instanceCall(instance, ["verify_manifest", "--manifest", exact]);
          const accepted = instanceCall(instance, ["verify_manifest", "--manifest", variant]);
          if (refused !== "false") {
            throw new Error(`o registro exato do 11 não foi recusado: ${refused}`);
          }
          if (accepted !== "true") {
            throw new Error(`a variante do 11 não foi aceita: ${accepted}`);
          }
        }

        await submit(page);
        if (!isCompleted(LEVEL)) throw new Error("o núcleo não registrou is_completed");
      }

      if (errors.length > 0) throw new Error(`erros no navegador:\n${errors.join("\n")}`);

      console.log(
        SIGN
          ? `✅ caso ${LEVEL} resolvido com assinatura local; is_completed=true (${ADDRESS})`
          : `✅ leituras do caso ${LEVEL} conferidas na instância real (${ADDRESS})`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    signer?.close();
    stop(vite);
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message ?? error}`);
  process.exit(1);
});
