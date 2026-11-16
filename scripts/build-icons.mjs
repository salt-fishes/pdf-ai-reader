import { readFileSync, writeFileSync } from "node:fs";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const source = "build/icon.svg";
const smallSource = "build/icon-small.svg";
const svg = readFileSync(source);
const smallSvg = readFileSync(smallSource);
const sizes = [16, 24, 32, 48, 64, 128, 256];

const png = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
writeFileSync("build/icon.png", png);

const buffers = await Promise.all(
  sizes.map((size) =>
    sharp(size <= 32 ? smallSvg : svg, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);
writeFileSync("build/icon.ico", await pngToIco(buffers));

// The favicon uses the simplified mark so it stays legible in a 16px tab.
writeFileSync(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="6" fill="#5B5BD6"/>
  <rect x="3.2" y="2.4" width="17.6" height="19.2" rx="4.2" fill="#fff" opacity=".14"/>
  <path d="M7.6 8.2h8.8M7.6 12h8.8M7.6 15.8h8.8" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>
</svg>
`,
);

console.log(
  `Icons written: build/icon.png (${png.length} B), build/icon.ico (${sizes.length} sizes)`,
);
