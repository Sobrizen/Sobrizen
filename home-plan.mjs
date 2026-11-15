/**
 * Non-blocking plan discovery for the home screen. Access is already resolved
 * by billingState; do not infer a subscription from a plan name or stale dates.
 * Customer-provided billing fields are never interpolated into this markup.
 */
export function renderHomePlan(billing,{demo=false}={}){
  if(billing?.premium===true)return '';

  const badge=demo===true?'DÉMONSTRATION · APERÇU DES OFFRES':'TON ACCOMPAGNEMENT';
  if(billing?.ready!==true)return `<section class="card sz-home-plan sz-home-plan--pending" data-home-plan aria-label="Statut de ton plan">
    <div class="sz-home-plan__copy"><span class="eyebrow sz-home-plan__badge">${badge}</span><h2>Vérifier mon plan</h2><p>Le statut de ton plan n’a pas encore pu être confirmé. Consulte Mon Plan pour vérifier ton accès.</p></div>
    <div class="sz-home-plan__actions"><a class="secondary" href="/abonnement">Consulter mon plan →</a></div>
  </section>`;

  return `<section class="card sz-home-plan" data-home-plan aria-label="Choisir ton plan">
    <div class="sz-home-plan__copy"><span class="eyebrow sz-home-plan__badge">${badge}</span><h2>Un accompagnement à ton rythme.</h2><p>L’essentiel est déjà accessible gratuitement. Compare les options et choisis ce qui t’aide à avancer.</p></div>
    <div class="sz-home-plan__options">
      <div class="sz-home-plan__option"><span class="sz-home-plan__option-label">Gratuit</span><p>Suivi synthétique, journal et outils de soutien.</p></div>
      <div class="sz-home-plan__option sz-home-plan__option--premium"><span class="sz-home-plan__option-label">Avec Premium</span><p>Rapports détaillés, agenda et davantage d’activités.</p></div>
    </div>
    <div class="sz-home-plan__actions"><a class="primary" href="/abonnement">Choisir mon plan <span aria-hidden="true">→</span></a><a class="text" href="/abonnement">Comparer les options</a></div>
  </section>`;
}
