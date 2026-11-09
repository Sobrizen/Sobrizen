/** One reproducible entrypoint for both legacy and current isolated QA harnesses. */
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let jsdom,pglite;
try {jsdom=require.resolve('jsdom');pglite=require.resolve('@electric-sql/pglite');}
catch {console.error('Installe les dépendances de test épinglées avec npm ci avant de lancer npm test.');process.exit(1);}
const result=spawnSync(process.execPath,['--test',...process.argv.slice(2)],{
  cwd:root,stdio:'inherit',env:{...process.env,
    SOBRIZEN_QA_JSDOM:jsdom,SOBRIZEN_JSDOM_PATH:jsdom,
    SOBRIZEN_QA_PGLITE:pglite,SOBRIZEN_PGLITE_PATH:pglite,
  },
});
if(result.error){console.error(result.error.message);process.exit(1);}
process.exit(result.status??1);
