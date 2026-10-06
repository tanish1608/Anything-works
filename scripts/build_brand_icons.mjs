// Render the vector identity to installed-app icons. Requires the sharp package.
// Example: NODE_PATH=/path/to/bundled/node_modules node scripts/build_brand_icons.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(import.meta.url)('sharp');
const publicDir = new URL('../web/public/', import.meta.url);
const mark = readFileSync(new URL('brand/mark.svg', publicDir), 'utf8');
const paths = mark.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
// All opaque glyph points stay inside the central 80%-diameter maskable safe circle.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#101b2a"/><g fill="#ffffff" transform="translate(138.24 107.52) scale(2.56)">${paths}</g></svg>\n`;
writeFileSync(new URL('brand/app-icon.svg', publicDir), icon);
writeFileSync(new URL('favicon.svg', publicDir), icon);
for (const size of [192, 512]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(fileURLToPath(new URL(`icon-${size}.png`, publicDir)));
}
console.log('Rendered Placeholder AI favicon and 192/512 app icons.');
