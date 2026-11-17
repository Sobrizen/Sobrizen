/** Local QA server: mirrors static clean URLs, MIME types and configured response headers. */
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=resolve(root,'dist');
const config=JSON.parse(readFileSync(resolve(root,'vercel.json'),'utf8'));
const headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.pdf':'application/pdf','.bin':'application/octet-stream'};
mkdirSync(resolve(root,'artifacts'),{recursive:true});
const server=createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=resolve(dist,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(dist+sep)){res.writeHead(400);res.end();return;}
    if(!extname(file)&&existsSync(file+'.html'))file+='.html';
    if(!existsSync(file)||!statSync(file).isFile()){res.writeHead(404,headers);res.end('Page introuvable');return;}
    const data=readFileSync(file);
    res.writeHead(200,{...headers,'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':data.length});
    res.end(req.method==='HEAD'?undefined:data);
    appendFileSync(resolve(root,'artifacts/blog-http.jsonl'),JSON.stringify({path,bytes:data.length})+'\n');
  }catch{res.writeHead(400);res.end('Requête invalide');}
});
server.listen(4187,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4187/blog'));
