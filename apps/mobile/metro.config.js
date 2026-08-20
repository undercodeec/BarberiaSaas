/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads its CommonJS configuration with Node require. */
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo watches the monorepo. Next.js's generated output is transient, and can
// disappear while Metro sets up its watcher, crashing the development server.
const nextOutput = path.resolve(__dirname, '../web/.next');
const escapedNextOutput = nextOutput
  .split(/[\\/]+/)
  .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('[\\\\/]');

config.resolver.blockList = new RegExp(`^${escapedNextOutput}(?:[\\\\/].*)?$`);

module.exports = config;
