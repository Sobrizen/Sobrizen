import {esc} from './community-core.mjs';

const number=new Intl.NumberFormat('fr-FR');
const leaf='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 3.5c-5-.8-9.2.7-10.7 3.6-1.7 3.3-.2 6.6 2.9 6.9 4.4.4 6.9-3.5 7.8-10.5Z"/><path d="M4 16c1.5-3.3 4-6 7.4-8.4"/></svg>';

/** A duration saved with the post, never a live counter or a medical status. */
export function durationBadge(post={}){
  const days=post?.abstinence_days;
  if(!Number.isSafeInteger(days)||days<0||days>50000)return '';
  const count=days===0?'< 1':number.format(days);
  const full=days===0?'Moins d’un jour':`${number.format(days)} jour${days===1?'':'s'}`;
  const provenance=post.abstinence_source==='tracking'
    ?'Durée reprise du dernier arrêt enregistré dans le suivi.'
    :'Durée déclarée par l’auteur lors du partage.';
  const accessible=`${full} sans alcool au moment de la publication. ${provenance}`;
  const tone=days<7?'first':days<30?'week':days<90?'month':'steady';
  return `<span class="community-duration-badge community-duration-badge--${tone}" role="img" aria-label="${esc(accessible)}" title="${esc(accessible)}">${leaf}<span class="community-duration-number" aria-hidden="true">${esc(count)} j</span><span class="community-duration-unit" aria-hidden="true">sans alcool</span></span>`;
}
