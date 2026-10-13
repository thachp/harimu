import { readFileSync } from 'node:fs';

export const developmentTarget = Object.freeze({
  accountId: '143bccf1a31c2161142c43845a8fc65d',
  worker: 'harimu-preview',
  databaseId: '85ec8276-a39f-4bdb-95ad-e77f92144bb9',
  hostname: 'preview.harimu.com',
});

export function assertDevelopmentConfig(config) {
  if (config.name !== developmentTarget.worker || config.account_id !== developmentTarget.accountId) {
    throw new Error('Development deploys are restricted to the approved harimu-preview Worker/account.');
  }
  const db = config.d1_databases;
  if (db?.length !== 1 || db[0].binding !== 'DB' || db[0].database_name !== 'harimu-preview' ||
      db[0].database_id !== developmentTarget.databaseId) {
    throw new Error('Development deploys must use the isolated preview D1 database.');
  }
  if (config.routes?.some(route => typeof route !== 'object' || route.pattern !== developmentTarget.hostname ||
      route.custom_domain !== true) || config.routes?.length > 1) {
    throw new Error('Development deploys cannot route apex, www, docs, or wildcard hostnames.');
  }
  if (config.vars?.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW !== 'true') {
    throw new Error('Development preview must identify its isolated world.');
  }
  return config;
}

export function readDevelopmentConfig() {
  // This checked-in JSONC uses full-line comments only; no secret files are read.
  return assertDevelopmentConfig(JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')));
}
