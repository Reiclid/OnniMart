// Переписує блок @theme у src/app/globals.css з src/design/tokens.ts.
//   bun run tokens
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { themeCss } from '../src/design/tokens';

const file = join(__dirname, '../src/app/globals.css');
const css = readFileSync(file, 'utf8');
const next = css.replace(/@theme \{[\s\S]*?\n\}/, themeCss());
if (next === css) console.log('globals.css уже збігається з tokens.ts');
else {
  writeFileSync(file, next);
  console.log('globals.css оновлено з tokens.ts');
}
