import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('src/sri-schemas');
const destination = resolve('dist/sri-schemas');

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
