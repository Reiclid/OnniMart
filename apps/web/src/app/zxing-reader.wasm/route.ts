import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// WASM-розпізнавач штрихкодів (ZXing) з нашого сервера, а не з CDN за замовчуванням.
// Версія — та сама, що в barcode-detector (zxing-wasm закріплено точно в package.json)
const WASM = join(process.cwd(), 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');

export async function GET() {
  return new Response(new Uint8Array(await readFile(WASM)), {
    headers: { 'Content-Type': 'application/wasm', 'Cache-Control': 'public, max-age=604800' },
  });
}
