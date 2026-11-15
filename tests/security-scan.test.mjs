import test from 'node:test';
import assert from 'node:assert/strict';
import {scanText} from '../scripts/security-scan.mjs';

test('credential detection reports location and category without disclosing the value',()=>{
  const secret=['sk','live','x'.repeat(28)].join('_');
  const findings=scanText(`const publicValue=1;\nconst credential='${secret}';`,'sample.mjs');
  assert.deepEqual(findings,[{path:'sample.mjs',line:2,rule:'stripe-secret'}]);
  assert.equal(JSON.stringify(findings).includes(secret),false);
});
test('Supabase anon tokens remain public while privileged JWTs are blocked',()=>{
  const token=role=>[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({role})).toString('base64url'),'x'.repeat(43)].join('.');
  assert.deepEqual(scanText(token('anon')),[]);
  assert.equal(scanText(token('service_role'))[0].rule,'supabase-service-role-jwt');
});
test('webhook/private-key credentials and environment files cannot be committed silently',()=>{
  assert.equal(scanText(['whsec','x'.repeat(28)].join('_'))[0].rule,'stripe-webhook-secret');
  assert.equal(scanText(['-----BEGIN','PRIVATE KEY-----'].join(' '))[0].rule,'private-key');
  assert.equal(scanText('SAFE=placeholder','.env.production')[0].rule,'environment-file');
  assert.deepEqual(scanText('SAFE=placeholder','.env.example'),[]);
});
