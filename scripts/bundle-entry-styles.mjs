/** Combine blocking styles at build time; source styles remain independently editable. */
export function bundleEntryStyles(files){
  const html=files.get('index.html').toString('utf8');
  const links=[...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="(\/[^"?#]+\.css)")[^>]*>/giu)];
  if(links.length<2)return {requestsBefore:links.length,requestsAfter:links.length};
  const sheets=[...new Set(links.map(match=>match[1].slice(1)))];
  const target='experience.css';
  if(!sheets.includes(target))throw Error('Style bundle: missing experience stylesheet.');
  const css=sheets.map(file=>{
    if(!files.has(file))throw Error('Style bundle: unpublished stylesheet '+file);
    const source=files.get(file).toString('utf8');
    if(/@(?:import|charset)\b/iu.test(source)||/url\(\s*['"]?(?!\/|data:|https?:)[^)'"\s]/iu.test(source))throw Error('Style bundle: resolve relative dependencies first in '+file);
    return `/* ${file} */\n${source}\n`;
  }).join('\n');
  // Match by location, never CSS content. Keeping order preserves the full cascade.
  let cursor=0,result='';
  for(const [index,match] of links.entries()){
    if(/\b(?:media|disabled|title)\s*=/iu.test(match[0]))throw Error('Style bundle: conditional styles need an explicit bundle.');
    result+=html.slice(cursor,match.index)+(index===0?'<link rel="stylesheet" href="/experience.css">':'');
    cursor=match.index+match[0].length;
  }
  result+=html.slice(cursor);
  files.set('experience.css',Buffer.from(css));
  files.set('index.html',Buffer.from(result));
  return {requestsBefore:links.length,requestsAfter:1};
}
