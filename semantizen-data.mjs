import {createLexicon,SEMANTIC_VERSION} from './semantizen-core.mjs';
let loaded=null,pending=null;
/** Public data only: no word, account ID or token is sent to a model provider. */
export async function loadSemanticData(){
  if(loaded)return loaded;if(pending)return pending;
  pending=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const root=new URL('./',import.meta.url);
      const response=await fetch(new URL('semantizen-vocabulary.json',root),{signal:controller.signal,credentials:'same-origin'});
      if(!response.ok)throw Error('Dictionnaire indisponible. Vérifie ta connexion puis réessaie.');
      const manifest=await response.json();if(manifest.version!==SEMANTIC_VERSION)throw Error('Mise à jour du jeu nécessaire. Recharge SobriZen.');
      const vectors=await fetch(new URL('semantizen-vectors.bin',root),{signal:controller.signal,credentials:'same-origin'});
      if(!vectors.ok)throw Error('Le chargement du jeu a échoué. Réessaie.');
      const bytes=await vectors.arrayBuffer();
      if(!/^[a-f0-9]{64}$/.test(manifest.vectorSha256||''))throw Error('Dictionnaire non vérifiable.');
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(hash!==manifest.vectorSha256)throw Error('Les données du jeu sont incomplètes. Recharge puis réessaie.');
      loaded=createLexicon(manifest,bytes);return loaded;
    }catch(error){if(error.name==='AbortError')throw Error('Chargement trop long. Vérifie ta connexion puis réessaie.');throw error;}
    finally{clearTimeout(timeout);pending=null;}
  })();return pending;
}
