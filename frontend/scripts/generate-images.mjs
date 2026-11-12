import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const MANIFEST = join(ROOT, "src/levels/image-variants.json");
const LADDER = [768, 1200];
const GENERATED = /-\d+\.(?:webp|avif)$/;
const SCAN_DIRS = ["images/levels", "images/seasons", "images/login"];

const brand = {
  input: join(ROOT, "assets-src/brand/breaker-os-presentation.png"),
  key: "/images/brand/breaker-os-presentation.png",
  quality: 88,
};

const logo = {
  input: join(PUBLIC, "images/brand/breaker-logo.webp"),
  key: "/images/brand/breaker-logo.webp",
  quality: 82,
  widths: [480, 768, 1200],
};

const mobileHomepage = {
  input: join(ROOT, "assets-src/levels/homepage-mobile.png"),
  key: "/images/levels/homepage-mobile.png",
  quality: 88,
};

async function listSources() {
  const sources = [];
  for (const dir of SCAN_DIRS) {
    const absolute = join(PUBLIC, dir);
    const names = await readdir(absolute);
    for (const name of names) {
      if (extname(name) !== ".webp" || GENERATED.test(name)) continue;
      sources.push({
        input: join(absolute, name),
        key: `/${dir}/${name}`,
        quality: 78,
      });
    }
  }
  sources.push(brand, mobileHomepage, logo);
  return sources.sort((a, b) => a.key.localeCompare(b.key));
}

function widthsFor(native) {
  const widths = LADDER.filter((width) => width < native);
  if (widths.length === 0 || native - widths[widths.length - 1] > 200) {
    widths.push(native);
  }
  return [...new Set(widths)].sort((a, b) => a - b);
}

function variantKey(key, width, ext) {
  return key.replace(/\.(?:webp|png)$/, `-${width}.${ext}`);
}

async function outputPath(key, width, ext) {
  const target = variantKey(key, width, ext);
  const absolute = join(PUBLIC, target.replace(/^\//, ""));
  await mkdir(dirname(absolute), { recursive: true });
  return absolute;
}

async function writeVariant(input, key, width, ext, quality) {
  const absolute = await outputPath(key, width, ext);
  const pipeline = sharp(input).resize({ width, withoutEnlargement: true });
  if (ext === "webp") {
    await pipeline.webp({ quality, effort: 5, smartSubsample: true }).toFile(absolute);
  } else {
    await pipeline.avif({ quality: Math.max(40, Math.min(70, quality - 20)), effort: 4 }).toFile(absolute);
  }
  return (await stat(absolute)).size;
}

const avifSupported = Boolean(sharp.format.heif?.output);

const sources = await listSources();
const manifest = { images: {} };
let written = 0;
let bytes = 0;

for (const source of sources) {
  const meta = await sharp(source.input).metadata();
  if (meta.width === undefined || meta.height === undefined) {
    throw new Error(`missing dimensions: ${source.key}`);
  }

  const widths = source.widths ?? widthsFor(meta.width);
  const webp = [];
  const avif = [];

  for (const width of widths) {
    if (width !== meta.width || source.key === brand.key || source.key === mobileHomepage.key) {
      bytes += await writeVariant(source.input, source.key, width, "webp", source.quality);
      written += 1;
      webp.push({ url: variantKey(source.key, width, "webp"), width });
    } else {
      webp.push({ url: source.key, width });
    }

    if (avifSupported) {
      try {
        bytes += await writeVariant(source.input, source.key, width, "avif", source.quality);
        written += 1;
        avif.push({ url: variantKey(source.key, width, "avif"), width });
      } catch (error) {
        console.warn(`avif failed for ${source.key} at ${width}px: ${error.message}`);
      }
    }
  }

  manifest.images[source.key] = {
    width: meta.width,
    height: meta.height,
    webp,
    avif,
  };
}

const sorted = Object.fromEntries(
  Object.keys(manifest.images)
    .sort()
    .map((key) => [key, manifest.images[key]]),
);

await writeFile(MANIFEST, `${JSON.stringify({ images: sorted }, null, 2)}\n`);
console.log(
  `wrote ${written} variants (${(bytes / 1024 / 1024).toFixed(2)} MB) for ${sources.length} sources` +
    `${avifSupported ? "" : " — AVIF unavailable, WebP only"}`,
);
