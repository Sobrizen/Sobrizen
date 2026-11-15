/** Small local guard for high-confidence committed credentials. Never print a match. */
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const rules=[
  ['stripe-secret',/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/gu],
  ['stripe-webhook-secret',/\bwhsec_[A-Za-z0-9]{20,}\b/gu],
  ['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/gu],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/gu],
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu],
];
export function scanText(source,path='input'){
  const findings=[];
  const add=(rule,index)=>findings.push({path,line:source.slice(0,index).split('\n').length,rule});
  for(const [name,pattern] of rules){pattern.lastIndex=0;for(const match of source.matchAll(pattern))add(name,match.index);}
  // The public anon JWT is an identifier; a service_role JWT is a credential.
  for(const match of source.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/gu)){
    try{if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString()).role==='service_role')add('supabase-service-role-jwt',match.index);}catch{}
  }
  const file=basename(path);
  if(/^\.env(?:\..+)?$/u.test(file)&&!/^\.env\.(?:example|sample|template)$/u.test(file))add('environment-file',0);
  return findings;
}
export async function scanRepository(root){
  const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const findings=[];
  for(const path of paths){
    if(!/\.(?:[cm]?js|[jt]sx?|json|html|xml|ya?ml|sql|toml|ini|md|txt|sh|ps1|env|log)$/iu.test(path)&&!/(?:^|\/)\.(?:env[^/]*|npmrc)$/u.test(path))continue;
    const bytes=await readFile(resolve(root,path));if(bytes.includes(0))continue;
    findings.push(...scanText(bytes.toString('utf8'),path));
  }
  return findings;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),findings=await scanRepository(root);
  for(const finding of findings)console.error(`${finding.path}:${finding.line}: ${finding.rule} (value redacted)`);
  console.log(`Credential scan: ${findings.length} finding(s).`);
  if(findings.length)process.exitCode=1;
}
