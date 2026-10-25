// Editorial evidence, not a model of an individual's medical recovery.
// fromDays selects an educational checkpoint; it never certifies a health benefit.
export const HEALTH_REVIEWED_ON = '2026-10-25';

export const HEALTH_SOURCES = [
  {
    id: 'ais-withdrawal',
    title: 'Sevrage : ce qu’il faut savoir pour mieux vous préparer',
    authors: 'Alcool Info Service · Santé publique France · Dr A. Luquiens et Dr M. Guillou',
    year: 2024,
    type: 'Information médicale institutionnelle',
    population: 'Personnes qui arrêtent l’alcool, notamment après une consommation régulière ou quotidienne.',
    limits: 'L’intensité et la durée du sevrage varient. Ces repères ne permettent pas d’évaluer le risque personnel à distance.',
    url: 'https://www.alcool-info-service.fr/agir-sur-sa-consommation/comment-arreter-de-boire/sevrage-ce-quil-faut-savoir-pour-mieux-vous'
  },
  {
    id: 'nhs-withdrawal',
    title: 'Alcohol-use disorder',
    authors: 'NHS',
    year: 2026,
    type: 'Information médicale institutionnelle',
    population: 'Personnes présentant un usage nocif ou une dépendance à l’alcool.',
    limits: 'Les délais de sevrage sont indicatifs. Un symptôme grave reste urgent quel que soit le nombre de jours d’arrêt.',
    url: 'https://www.nhs.uk/conditions/alcohol-use-disorder/'
  },
  {
    id: 'mehta-2018',
    title: 'Short-term abstinence from alcohol and changes in cardiovascular risk factors, liver function tests and cancer-related growth factors',
    authors: 'G. Mehta et al. · BMJ Open',
    year: 2018,
    type: 'Étude prospective observationnelle',
    population: '141 consommateurs réguliers : 94 ayant choisi un mois d’abstinence et 47 témoins.',
    limits: 'Étude non randomisée, excluant la dépendance et les maladies du foie connues. Les résultats de groupe ne prédisent pas ceux d’une personne. Aucun effet sur l’incidence des cancers n’a été mesuré.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29730627/'
  },
  {
    id: 'nhs-liver',
    title: 'Alcohol-related liver disease',
    authors: 'NHS',
    year: 2026,
    type: 'Information médicale institutionnelle',
    population: 'Personnes concernées par une maladie du foie liée à l’alcool.',
    limits: 'La récupération dépend des lésions. Une stéatose peut régresser ; les cicatrices d’une cirrhose ne sont généralement pas réversibles. Un bilan médical est nécessaire pour connaître l’état du foie.',
    url: 'https://www.nhs.uk/conditions/alcohol-related-liver-disease-arld/'
  },
  {
    id: 'iarc-2024',
    title: 'Reduction or Cessation of Alcohol Consumption · IARC Handbooks, volume 20A',
    authors: 'Centre international de recherche sur le cancer · OMS',
    year: 2024,
    type: 'Évaluation scientifique internationale',
    population: 'Études épidémiologiques humaines et recherches sur les mécanismes liés à l’alcool.',
    limits: 'Preuves suffisantes d’une baisse de l’incidence pour les cancers de la bouche et de l’œsophage. Preuves plus limitées ou insuffisantes pour les autres localisations évaluées. Aucun délai ni pourcentage individuel ne peut être déduit.',
    url: 'https://www.iarc.who.int/faq/iarc-handbooks-of-cancer-prevention-volume-20a-reduction-or-cessation-of-alcohol-consumption/'
  },
  {
    id: 'gopaldas-2025',
    title: 'Subgroups of anxiety and depression trajectories during early abstinence in alcohol use disorder',
    authors: 'M. Gopaldas et al. · Alcohol, Clinical and Experimental Research',
    year: 2025,
    type: 'Étude observationnelle de trajectoires',
    population: '1 005 personnes avec un trouble de l’usage d’alcool dans un programme de soins.',
    limits: 'Les trajectoires diffèrent : certains symptômes diminuent, d’autres persistent. Les soins concomitants empêchent d’attribuer toute évolution à l’arrêt seul. Aucun pronostic individuel.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40343869/'
  },
  {
    id: 'manning-2008',
    title: 'Changes in neuropsychological functioning during alcohol detoxification',
    authors: 'V. Manning et al. · European Addiction Research',
    year: 2008,
    type: 'Étude avant/après sevrage',
    population: '30 patients hospitalisés avec dépendance, évalués aux jours 4 et 26.',
    limits: 'Petit échantillon en soins. Certaines capacités verbales et de mémoire de travail s’amélioraient ; les fonctions complexes ne progressaient pas toutes. Pas de date universelle de récupération.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/18810242/'
  },
  {
    id: 'brower-2011',
    title: 'Persistent insomnia, abstinence, and moderate drinking in alcohol-dependent individuals',
    authors: 'K. J. Brower, A. Krentzman et E. A. R. Robinson · American Journal on Addictions',
    year: 2011,
    type: 'Étude longitudinale observationnelle',
    population: '267 personnes avec dépendance à l’alcool à l’entrée en soins, avec un suivi à six mois.',
    limits: 'Le sommeil pouvait s’améliorer, mais une insomnie persistait chez certaines personnes malgré l’abstinence. Les résultats ne fixent pas de délai personnel.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/21838842/'
  },
  {
    id: 'pitel-2009',
    title: 'Changes in the episodic memory and executive functions of abstinent and relapsed alcoholics over a 6-month period',
    authors: 'A.-L. Pitel et al. · Alcoholism: Clinical and Experimental Research',
    year: 2009,
    type: 'Étude longitudinale cognitive',
    population: '54 patients avec dépendance et 54 témoins au départ ; un sous-groupe de patients réévalué à six mois.',
    limits: 'Petit suivi avec pertes de participants. Les résultats concernent des tests précis, pas toute la santé du cerveau. L’âge et l’histoire de consommation comptent ; aucune récupération garantie à six mois.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19120052/'
  },
  {
    id: 'nice-cg115',
    title: 'Alcohol-use disorders: diagnosis, assessment and management · CG115',
    authors: 'National Institute for Health and Care Excellence',
    year: 2011,
    type: 'Recommandations cliniques',
    population: 'Adultes et jeunes à partir de 10 ans concernés par un trouble de l’usage d’alcool ; recommandations appliquées ici aux adultes.',
    limits: 'Un point clinique est recommandé si anxiété ou dépression persistent après environ trois à quatre semaines d’abstinence. Ce repère n’est jamais une consigne d’attendre en cas de souffrance ou de danger.',
    url: 'https://www.nice.org.uk/guidance/cg115/chapter/Recommendations'
  },
  {
    id: 'fr-3114',
    title: '3114 · Numéro national de prévention du suicide',
    authors: 'Dispositif national piloté par le ministère chargé de la Santé',
    year: 2026,
    type: 'Ressource officielle d’aide',
    population: 'Personnes en détresse ou ayant des pensées suicidaires, et leurs proches, en France.',
    limits: 'Numéro gratuit accessible 24 h/24 et 7 j/7 en France. En cas de danger immédiat, contacter les urgences ; ailleurs, utiliser les services locaux.',
    url: 'https://3114.fr/'
  }
];

export const HEALTH_STAGES = [
  {
    id: 'first-days',
    fromDays: 0,
    rangeLabel: 'Premiers jours',
    title: 'Prendre soin de toi pendant l’arrêt',
    physical: [
      {
        title: 'Ton corps s’adapte',
        text: 'Des sueurs, tremblements ou nausées peuvent apparaître en quelques heures, surtout en cas de dépendance. Un accompagnement médical peut être nécessaire.',
        sourceIds: ['ais-withdrawal', 'nhs-withdrawal']
      }
    ],
    mental: [
      {
        title: 'Le sommeil et les émotions peuvent bouger',
        text: 'Anxiété, irritabilité ou sommeil perturbé peuvent accompagner les premiers jours. Leur intensité varie ; tu peux demander de l’aide dès maintenant.',
        sourceIds: ['ais-withdrawal']
      }
    ],
    checkInPrompt: 'Comment te sens-tu aujourd’hui, physiquement et moralement ?',
    outlook: 'Les symptômes peuvent diminuer dans les jours suivants, mais aucun jour précis ne garantit la fin du sevrage. Un signe inquiétant mérite une aide immédiate.',
    sourceIds: ['ais-withdrawal', 'nhs-withdrawal']
  },
  {
    id: 'first-weeks',
    fromDays: 7,
    rangeLabel: '1 à 4 semaines',
    title: 'Observer les premiers changements',
    physical: [
      {
        title: 'Une évolution à ton rythme',
        text: 'Certains symptômes physiques s’atténuent souvent après plusieurs jours. Une gêne persistante ou qui s’aggrave doit être discutée avec un professionnel.',
        sourceIds: ['ais-withdrawal', 'nhs-withdrawal']
      }
    ],
    mental: [
      {
        title: 'Des émotions parfois plus stables',
        text: 'Dans une étude en soins, anxiété et humeur dépressive diminuaient chez certains participants au cours des premières semaines, mais persistaient chez d’autres.',
        sourceIds: ['gopaldas-2025']
      }
    ],
    checkInPrompt: 'Depuis tes premières observations, ton énergie, ton sommeil ou ton humeur ont-ils changé ?',
    outlook: 'Des améliorations sont possibles durant les prochaines semaines. Leur absence n’est pas un échec et peut justifier un soutien adapté.',
    sourceIds: ['gopaldas-2025', 'nice-cg115', 'ais-withdrawal', 'nhs-withdrawal']
  },
  {
    id: 'one-month',
    fromDays: 28,
    rangeLabel: 'Autour d’un mois',
    title: 'Faire un premier bilan',
    physical: [
      {
        title: 'Tension et métabolisme',
        text: 'Un mois sans alcool était associé à de meilleurs marqueurs de tension, de sensibilité à l’insuline et de poids chez des consommateurs réguliers étudiés. Tes résultats nécessitent des mesures réelles.',
        sourceIds: ['mehta-2018']
      }
    ],
    mental: [
      {
        title: 'Certaines capacités peuvent progresser',
        text: 'Chez 30 patients hospitalisés, certaines capacités de mémoire de travail et de langage s’amélioraient en trois semaines. D’autres fonctions évoluaient peu : le rythme n’est pas uniforme.',
        sourceIds: ['manning-2008']
      },
      {
        title: 'Si l’anxiété ou la tristesse persistent',
        text: 'Autour de trois à quatre semaines, un point avec un professionnel est utile si ces difficultés persistent. Tu peux consulter plus tôt si tu souffres.',
        sourceIds: ['nice-cg115']
      }
    ],
    checkInPrompt: 'Qu’est-ce qui s’est amélioré pour toi ? Qu’est-ce qui reste difficile ?',
    outlook: 'Poursuivre ton arrêt peut soutenir ces changements. Ni ton ressenti ni le compteur ne permettent de connaître seuls l’état de tes organes.',
    sourceIds: ['mehta-2018', 'manning-2008', 'nice-cg115', 'nhs-liver']
  },
  {
    id: 'three-months',
    fromDays: 90,
    rangeLabel: 'Point à 3 mois',
    title: 'Comprendre ton évolution',
    physical: [
      {
        title: 'Le foie : des bénéfices possibles, à évaluer',
        text: 'L’arrêt peut permettre une amélioration de certaines lésions du foie. La récupération dépend de leur nature ; un bilan médical, pas le compteur, renseigne sur ton état.',
        sourceIds: ['nhs-liver']
      }
    ],
    mental: [
      {
        title: 'Le sommeil peut demander plus de temps',
        text: 'Chez des personnes avec dépendance suivies en soins, des difficultés de sommeil pouvaient persister plusieurs mois malgré l’abstinence. Un trouble durable mérite une aide adaptée.',
        sourceIds: ['brower-2011', 'nhs-withdrawal']
      }
    ],
    checkInPrompt: 'Compare ton sommeil, ton énergie et ta concentration à tes premiers bilans. De quoi as-tu besoin maintenant ?',
    outlook: 'Ce rendez-vous est un repère pour ton suivi, pas une date de récupération attendue. Les lésions avancées peuvent nécessiter des soins malgré la poursuite de l’arrêt.',
    sourceIds: ['nhs-liver', 'brower-2011', 'nhs-withdrawal']
  },
  {
    id: 'six-months',
    fromDays: 180,
    rangeLabel: 'Point à 6 mois',
    title: 'Voir le chemin parcouru',
    physical: [
      {
        title: 'Continuer à prendre soin de ton corps',
        text: 'Poursuivre l’arrêt reste important en cas de maladie du foie. Même si tu te sens mieux, les éventuels examens et soins restent utiles selon ton médecin.',
        sourceIds: ['nhs-liver']
      }
    ],
    mental: [
      {
        title: 'Mémoire et organisation',
        text: 'Une petite étude a observé une amélioration de tests de mémoire et d’organisation après six mois d’abstinence. Elle ne permet pas d’affirmer que toutes tes capacités sont rétablies.',
        sourceIds: ['pitel-2009']
      },
      {
        title: 'Ton ressenti compte toujours',
        text: 'Des troubles du sommeil peuvent encore être présents chez certaines personnes suivies après une dépendance. Les signaler permet d’en parler avec un professionnel.',
        sourceIds: ['brower-2011']
      }
    ],
    checkInPrompt: 'Qu’est-ce qui est devenu plus facile au quotidien ? Qu’aimerais-tu améliorer avec de l’aide ?',
    outlook: 'Garde comme repères tes observations réelles et, si nécessaire, tes bilans médicaux. Six mois n’est pas une échéance de rétablissement identique pour tous.',
    sourceIds: ['nhs-liver', 'pitel-2009', 'brower-2011']
  },
  {
    id: 'long-term',
    fromDays: 365,
    rangeLabel: '1 an et au-delà',
    title: 'Prendre soin de la suite',
    physical: [
      {
        title: 'Des bénéfices dans la durée',
        text: 'L’arrêt durable est associé à une baisse du risque de cancers de la bouche et de l’œsophage. Il ne s’agit pas d’un bénéfice acquis précisément à un an ni d’un risque devenu nul.',
        sourceIds: ['iarc-2024']
      }
    ],
    mental: [
      {
        title: 'Un bilan qui t’appartient',
        text: 'Relis tes observations de sommeil, d’humeur et de concentration. Si une difficulté te pèse, un professionnel peut t’aider, quelle que soit la durée de ton arrêt.',
        sourceIds: ['nice-cg115']
      }
    ],
    checkInPrompt: 'Quels changements constates-tu dans ta vie ? Quel soutien veux-tu garder pour la suite ?',
    outlook: 'Poursuivre l’arrêt contribue à réduire certaines expositions et certains risques à long terme. Ton risque individuel dépend aussi de ton histoire et de ta santé ; il ne se calcule pas avec un nombre de jours.',
    sourceIds: ['iarc-2024', 'nice-cg115', 'nhs-liver']
  }
];

export const HEALTH_SAFETY = {
  withdrawal: 'Si tu buvais quotidiennement, en grande quantité, ou as déjà ressenti un manque, demande un avis médical pour sécuriser l’arrêt. Des tremblements, sueurs ou nausées après l’arrêt nécessitent un avis rapide.',
  urgent: 'Confusion, hallucinations, convulsions ou tremblements intenses : appelle immédiatement les urgences. En France : 15 ou 112. Ailleurs : le numéro d’urgence local. N’attends pas le prochain palier.',
  mental: 'Si tu es en détresse ou as des pensées suicidaires, appelle le 3114 en France, gratuitement, 24 h/24 et 7 j/7. En danger immédiat : 15 ou 112 ; ailleurs, les urgences ou un service de crise local.',
  sourceIds: ['ais-withdrawal', 'nhs-withdrawal', 'nice-cg115', 'fr-3114']
};
