/** Use the supplied artwork without redrawing its lettering. */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function brandIconAssets(sourceRoot=root){
  return new Map(['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png']
    .map(file=>[file,readFileSync(resolve(sourceRoot,file))]));
}
