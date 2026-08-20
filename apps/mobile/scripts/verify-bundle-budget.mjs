import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const javascriptBudget = 3_200_000;
const totalBudget = 12_000_000;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

const files = await filesIn(outputDirectory).catch(() => {
  throw new Error('Ejecute primero el export web mobile.');
});
const sizes = await Promise.all(
  files.map(async (file) => ({ file, size: (await stat(file)).size })),
);
const javascriptSize = sizes
  .filter(({ file }) => file.endsWith('.js'))
  .reduce((total, { size }) => total + size, 0);
const totalSize = sizes.reduce((total, { size }) => total + size, 0);

if (javascriptSize > javascriptBudget)
  throw new Error(
    `Bundle JavaScript mobile excede el presupuesto: ${javascriptSize} > ${javascriptBudget}.`,
  );
if (totalSize > totalBudget)
  throw new Error(
    `Export mobile excede el presupuesto: ${totalSize} > ${totalBudget}.`,
  );

console.log(
  `Presupuesto mobile verificado: JS ${javascriptSize} bytes; total ${totalSize} bytes.`,
);
