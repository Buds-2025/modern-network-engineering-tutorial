import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'public');
const files = [
  'index.html',
  '现代网络工程基础_零基础在线教程.html',
  'tokens.css',
  'styles/book.css',
  'scripts/book.js',
  'examples/compose.yaml',
  'examples/lab-site/index.html',
  'examples/lab-site/status.txt',
];

// Copy only the reviewed website files; never publish the whole workspace.
const privatePatterns = [
  /[A-Z]:[\\/]Users[\\/][^\s<>"']+/i,
  /[A-Z]:[\\/]AI Coding[\\/]/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:NETLIFY_AUTH_TOKEN|GITHUB_TOKEN)\s*=\s*["']?[A-Za-z0-9_-]{20,}/,
];

for (const relative of files) {
  const source = resolve(root, relative);
  if (!source.startsWith(root + '/') && !source.startsWith(root + '\\')) {
    throw new Error('Publish source must stay inside the project.');
  }
  if (!existsSync(source)) throw new Error(`Missing required file: ${relative}`);
  const text = readFileSync(source, 'utf8');
  if (privatePatterns.some(pattern => pattern.test(text))) {
    throw new Error(`Possible private content in ${relative}; review before publishing.`);
  }
}

// Resolve and validate the exact generated directory before removing old output.
if (dirname(output) !== root || basename(output) !== 'public') {
  throw new Error('Unexpected publish directory.');
}
rmSync(output, { recursive: true, force: true });
for (const relative of files) {
  const destination = join(output, relative);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(root, relative), destination);
}
console.log(`Prepared ${files.length} reviewed website files in public/.`);
