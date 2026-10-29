import {healthJourney} from './health-core.mjs';

const empty=status=>({status,days:null,precision:'unknown'});

/**
 * Share only the duration of the current effective stop, never the private
 * timeline, last-drink timestamp, quantities, notes or cumulative records.
 * The caller owns loading, consent and the canonical snapshot's freshness.
 */
export function trackingAbstinence({consent,ready,snapshot,today,now=new Date()}={}){
  if(consent!==true)return empty('consent-required');
  if(ready!==true)return empty('unavailable');
  if(!snapshot)return empty('missing');
  try{
    const current=healthJourney(snapshot,today,now);
    if(!current.active||!Number.isSafeInteger(current.days)||current.days<0||current.days>50000
      ||!['minute','day'].includes(current.precision))return empty('no-current-stop');
    return {status:'active',days:current.days,precision:current.precision};
  }catch{return empty('unavailable');}
}
