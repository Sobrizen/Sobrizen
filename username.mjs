export const USERNAME_MIN=3;
export const USERNAME_MAX=30;

/**
 * Produce the existing database-compatible handle from a friendly French input.
 * The caller can show `value` before saving. Unsupported characters are retained
 * and reported, never silently removed; availability is checked by the server.
 */
export function normalizeUsername(input=''){
  const value=(typeof input==='string'?input:'').trim().replace(/^@/,'').trim()
    .toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\s\-\u2010-\u2015]+/g,'_');
  let error='';
  if(!value)error='Choisis un pseudo.';
  else if(!/^[a-z0-9_.]+$/.test(value))error='Utilise a à z, 0 à 9, un point ou un tiret bas.';
  else if(value.length<USERNAME_MIN)error='Choisis un pseudo d’au moins 3 caractères.';
  else if(value.length>USERNAME_MAX)error='Raccourcis ton pseudo à 30 caractères maximum.';
  return {value,error};
}
