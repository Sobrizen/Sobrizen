import {VERIFIED_MOTIVATION_QUOTES} from './journal-motivation-quotes.mjs';

/** Sourced quotations. French translations are explicitly identified in the UI. */
export const MOTIVATION_TITLE = 'Une pensée pour avancer · SobriZen';
export const MOTIVATION_KIND = 'reflection';

export const MOTIVATION_QUOTES = VERIFIED_MOTIVATION_QUOTES;

/** Keep attribution in the existing plain-text body, including account exports. */
export function motivationEntryBody(quote){
  const translation=quote.translationCredit||(quote.translation?'Traduction française SobriZen':'');
  return `${quote.text}\n\n— ${quote.author}\n${quote.work} · ${quote.locator}\n${quote.context?quote.context+'\n':''}${translation?translation+'\n':''}Source : ${quote.url}`;
}

const quotesByBody=new Map(MOTIVATION_QUOTES.map(quote=>[motivationEntryBody(quote),quote]));
/** Historical saved encouragements remain readable without invented attribution. */
export function motivationQuoteForEntry(entry){
  return isMotivationEntry(entry)?quotesByBody.get(entry.body)||null:null;
}

/** Uses only existing journal columns and an already supported kind. */
export function isMotivationEntry(entry){
  return entry?.kind===MOTIVATION_KIND && entry?.title===MOTIVATION_TITLE;
}

/** A shuffled deck lives only in memory. Every quote is seen before a repeat. */
export function createQuoteRotation(random=Math.random){
  let deck=[],last=null,lastAuthor=null;
  return {
    next(){
      if(!deck.length){
        deck=[...MOTIVATION_QUOTES];
        for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
        if(deck.at(-1).id===last)[deck[0],deck[deck.length-1]]=[deck.at(-1),deck[0]];
      }
      // Vary authors when the remaining deck allows it, without skipping quotes.
      if(deck.at(-1)?.author===lastAuthor){
        const alternative=deck.findIndex(quote=>quote.author!==lastAuthor&&quote.id!==last);
        if(alternative>=0)[deck[alternative],deck[deck.length-1]]=[deck.at(-1),deck[alternative]];
      }
      const quote=deck.pop();last=quote.id;lastAuthor=quote.author;return quote;
    },
    reset(){deck=[];last=null;lastAuthor=null;},
  };
}

/**
 * Stable UUIDv8 per account and quote. The existing journal primary key makes
 * retries and concurrent tabs idempotent without a new database constraint.
 * Nothing is written to browser storage.
 */
export async function motivationEntryId(userId,quoteId){
  if(!userId||!MOTIVATION_QUOTES.some(quote=>quote.id===quoteId))throw Error('Cette citation n’est plus disponible.');
  const source=new TextEncoder().encode(`sobrizen:journal-motivation:v1:${userId}:${quoteId}`);
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',source)).slice(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
