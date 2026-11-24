import {PLANS} from './billing/core.mjs';

const monthlyPrice = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR'}).format(PLANS.monthly.amount / 100);

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
    <div class="sz-home-plan__copy"><span class="eyebrow sz-home-plan__badge">${badge}</span><h2>Et si tu préparais ta semaine ?</h2><p>L’essentiel est déjà accessible gratuitement. Avec Premium, tu peux comparer tes tendances et prévoir une activité pour un moment que tu trouves difficile.</p></div>
    <div class="sz-home-plan__options">
      <div class="sz-home-plan__option"><span class="sz-home-plan__option-label">Gratuit</span><p>Note tes journées, retrouve ton journal et ouvre les outils de soutien à tout moment.</p></div>
      <div class="sz-home-plan__option sz-home-plan__option--premium"><span class="sz-home-plan__option-label">Avec Premium</span><p>Rapports détaillés, agenda personnel et tous les jeux.</p><strong class="sz-monthly-price">${monthlyPrice} / mois</strong></div>
    </div>
    <div class="sz-home-plan__actions"><a class="primary" href="/abonnement">Comparer les options <span aria-hidden="true">→</span></a></div>
  </section>`;
}
