import { readFileSync, writeFileSync } from "node:fs";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const source = "build/icon.svg";
const smallSource = "build/icon-small.svg";
const faviconSource = "build/favicon.svg";
const pdfSource = "build/pdf-file.svg";
const pdfSmallSource = "build/pdf-file-small.svg";
const svg = readFileSync(source);
const smallSvg = readFileSync(smallSource);
const pdfSvg = readFileSync(pdfSource);
const pdfSmallSvg = readFileSync(pdfSmallSource);
const sizes = [16, 24, 32, 48, 64, 128, 256];

const png = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
writeFileSync("build/icon.png", png);
// Vite serves public/ as-is; the About hero and the dev window icon load this.
writeFileSync("public/icon.png", png);

const buffers = await Promise.all(
  sizes.map((size) =>
    sharp(size <= 32 ? smallSvg : svg, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);
writeFileSync("build/icon.ico", await pngToIco(buffers));

// The preferred app icon for .pdf files in Explorer. The association layer can
// point DefaultIcon at this file once it is shipped next to the executable.
const pdfBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(size <= 24 ? pdfSmallSvg : pdfSvg, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);
writeFileSync("build/pdf-file.ico", await pngToIco(pdfBuffers));
writeFileSync(
  "build/pdf-file.png",
  await sharp(pdfSvg, { density: 384 }).resize(512, 512).png().toBuffer(),
);

// The favicon uses the simplified mark so it stays legible in a 16px tab.
writeFileSync("public/favicon.svg", readFileSync(faviconSource));

console.log(
  `Icons written: build/icon.png, public/icon.png (${png.length} B), build/icon.ico (${sizes.length} sizes), build/pdf-file.ico (${sizes.length} sizes)`,
);
