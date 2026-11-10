/** Deterministic, checksum-pinned build-time extraction; never calls an inference API. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const URL='https://embeddings.net/embeddings/frWac_non_lem_no_postag_no_phrase_200_skip_cut100.bin';
const SHA='860452fd2ffb9498a29d69e315ddb60801a5c81fb1045f8149b319fa0dd93809';
const version='frwac200-v1',dimensions=200;
const TARGET_WORDS=`maison jardin forêt rivière montagne plage soleil lune étoile nuage pluie neige vent océan désert vallée île volcan arbre fleur feuille racine fruit graine herbe animal oiseau poisson chien chat cheval abeille papillon tortue renard lapin dauphin éléphant lion voyage train avion bateau vélo voiture route pont chemin gare port carte valise fenêtre porte escalier toit mur cuisine chambre table chaise lampe miroir horloge livre page histoire poésie roman musique chanson piano guitare peinture dessin couleur lumière ombre cinéma théâtre danse sport ballon course marche natation football tennis vélo école professeur élève classe université science recherche expérience question réponse idée mémoire langage parole silence temps matin soir nuit hiver printemps été automne bonheur sourire amitié famille enfant parent voisin rencontre partage confiance courage liberté espoir patience calme repos sommeil rêve énergie effort projet objectif travail métier bureau équipe réunion entreprise client commerce magasin marché produit service qualité prix budget économie argent monnaie banque contrat facture outil atelier usine machine robot ordinateur clavier écran téléphone réseau internet message lettre courrier photo image vidéo jardinage cuisine recette pain fromage légume pomme orange citron tomate carotte chocolat miel café thé eau jus soupe farine gâteau montagne campagne village ville quartier rue place parc musée bibliothèque restaurant hôtel ferme château palais plage bateau jardin forêt aventure découverte création progrès réussite talent choix décision solution problème défi stratégie organisation formation savoir intelligence curiosité imagination habitude équilibre détente plaisir attention concentration respiration santé médecin hôpital soin corps visage main pied bras jambe tête regard oreille voix peau cœur sang repas famille culture tradition fête cadeau surprise souvenir enfance vacances loisir saison journée minute heure avenir passé présent voyage destination voyageur paysage environnement planète univers espace distance vitesse poids taille forme cercle carré triangle nombre calcul mesure quantité addition comparaison justice respect règle loi droit devoir vote paix solidarité entraide générosité humour rire jeu mot sens chaleur froid température feu glace vapeur métal bois pierre sable terre sol ciel étoile lumière douceur force souplesse stabilité mouvement rythme harmonie beauté simplicité chance volonté motivation changement action début fin départ arrivée retour sommet horizon trésor richesse valeur artisan boulanger jardinier pilote marin sportif musicien auteur artiste ingénieur architecte entrepreneur`.split(/\s+/u);
const targets=[...new Set(TARGET_WORDS)];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function prepare(){
 const output=resolve(root,'semantizen-vocabulary.json'),binary=resolve(root,'semantizen-vectors.bin');
 try{const manifest=JSON.parse(await readFile(output,'utf8')),bytes=await readFile(binary);if(manifest.version===version&&manifest.sourceSha256===SHA&&manifest.vectorSha256===digest(bytes)&&bytes.length===manifest.words.length*dimensions&&manifest.targets.length>=200){console.log(`Semantic data already verified: ${manifest.words.length} words.`);return;}}catch{}
 const cache=resolve(root,'node_modules/.cache/semantizen');await mkdir(cache,{recursive:true});
 const modelPath=process.env.SOBRIZEN_WORD_MODEL||resolve(cache,'frwac200.bin');let model;
 try{model=await readFile(modelPath);if(digest(model)!==SHA)model=null;}catch{}
 if(!model){const response=await fetch(URL,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Word model download failed: '+response.status);model=Buffer.from(await response.arrayBuffer());if(digest(model)!==SHA)throw Error('Word model checksum mismatch; publication stopped.');await writeFile(modelPath,model);}
 const end=model.indexOf(10),[count,dim]=model.subarray(0,end).toString('utf8').trim().split(' ').map(Number);
 if(count!==155562||dim!==dimensions)throw Error('Unexpected model header.');
 const needed=new Set(targets),seen=new Set(),words=[],rows=[];let offset=end+1;
 for(let i=0;i<count;i++){
  while(model[offset]===10||model[offset]===13)offset++;
  const space=model.indexOf(32,offset);if(space<0)throw Error('Truncated word vector.');
  const word=model.subarray(offset,space).toString('utf8').normalize('NFC');offset=space+1;
  if(offset+dim*4>model.length)throw Error('Truncated vector payload.');
  if(!seen.has(word)&&(words.length<30000||needed.has(word))&&word.length>=2&&word.length<=32&&/^[a-zàâæçéèêëîïôœùûüÿ]+(?:[-'][a-zàâæçéèêëîïôœùûüÿ]+)*$/u.test(word)){
   const values=new Float32Array(dim);let max=0;
   for(let j=0;j<dim;j++){values[j]=model.readFloatLE(offset+j*4);if(!Number.isFinite(values[j]))throw Error('Nonfinite word vector.');max=Math.max(max,Math.abs(values[j]));}
   if(max){const row=new Int8Array(dim);for(let j=0;j<dim;j++)row[j]=Math.round(values[j]/max*127);words.push(word);rows.push(Buffer.from(row.buffer));seen.add(word);}
  }
  offset+=dim*4;
 }
 const targetIds=targets.filter(word=>seen.has(word)).map(word=>words.indexOf(word));if(targetIds.length<200)throw Error('Insufficient supported targets.');
 let seed=20261110;for(let i=targetIds.length-1;i>0;i--){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const j=(seed>>>0)%(i+1);[targetIds[i],targetIds[j]]=[targetIds[j],targetIds[i]];}
 const bytes=Buffer.concat(rows),manifest={version,dimensions,sourceSha256:SHA,vectorSha256:digest(bytes),source:URL,attribution:'French Word Embeddings, Jean-Philippe Fauconnier, 2015. CC BY 3.0. Vocabulary subset, per-vector int8 quantization by SobriZen.',words,targets:targetIds};
 await writeFile(binary,bytes);await writeFile(output,JSON.stringify(manifest));console.log(`Semantic data: ${words.length} words, ${targetIds.length} targets, ${bytes.length} vector bytes.`);
}
await prepare();
