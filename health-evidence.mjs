// Editorial evidence, not a model of an individual's medical recovery.
// fromMinutes is the canonical threshold; fromDays remains a compatibility value.
// A threshold selects information, never a certified benefit or an alcohol level.
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
    id: 'niaaa-overdose',
    title: 'Understanding the Dangers of Alcohol Overdose',
    authors: 'National Institute on Alcohol Abuse and Alcoholism · NIH',
    year: 'consulté en 2026',
    type: 'Information médicale institutionnelle',
    population: 'Effets immédiats de l’alcool et signes d’intoxication grave.',
    limits: 'L’alcoolémie peut encore monter après le dernier verre. La quantité bue, les repas, les médicaments et les caractéristiques individuelles comptent. Un chronomètre ne mesure ni l’alcoolémie ni l’aptitude à conduire.',
    url: 'https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/understanding-dangers-of-alcohol-overdose'
  },
  {
    id: 'niaaa-hangovers',
    title: 'Hangovers',
    authors: 'National Institute on Alcohol Abuse and Alcoholism · NIH',
    year: 'consulté en 2026',
    type: 'Information médicale institutionnelle',
    population: 'Personnes présentant des symptômes après une alcoolisation.',
    limits: 'La durée et l’intensité varient. Des symptômes peuvent persister 24 heures ou davantage ; une alcoolémie basse ne garantit pas une attention ou une coordination normales.',
    url: 'https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/hangovers'
  },
  {
    id: 'asam-2020',
    title: 'The ASAM Clinical Practice Guideline on Alcohol Withdrawal Management',
    authors: 'American Society of Addiction Medicine · comité de médecins spécialistes',
    year: 2020,
    type: 'Recommandations cliniques',
    population: 'Adultes en sevrage après arrêt ou forte réduction d’alcool.',
    limits: 'Les complications suivent des délais variables. Un examen médical évalue le risque personnel ; l’absence de symptôme ne suffit pas.',
    url: 'https://downloads.asam.org/sitefinity-production-blobs/docs/default-source/quality-science/the_asam_clinical_practice_guideline_on_alcohol-1.pdf'
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
    id: 'kirpich-2017',
    title: 'Liver Injury and Endotoxemia in Male and Female Alcohol-Dependent Individuals Admitted to an Alcohol Treatment Program',
    authors: 'I. A. Kirpich et al. · Alcoholism: Clinical and Experimental Research',
    year: 2017,
    type: 'Étude longitudinale de marqueurs biologiques',
    population: '48 patients en sevrage hospitalier, sans maladie hépatique avancée ; prélèvements à l’entrée, puis aux jours 8 et 15.',
    limits: 'Certains marqueurs s’amélioraient dans le sous-groupe avec atteinte hépatique légère. Petit échantillon recevant des soins : cela ne démontre pas un foie rétabli en deux semaines, ni un résultat individuel.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28166367/'
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
  },
  {
    id: 'niaaa-cravings',
    title: 'How to Stop Alcohol Cravings',
    authors: 'National Institute on Alcohol Abuse and Alcoholism · NIH',
    year: 'consulté en 2026',
    reviewedOn: '2026-10-27',
    type: 'Information médicale institutionnelle',
    population: 'Adultes souhaitant réduire ou arrêter l’alcool.',
    limits: 'Stratégies de soutien, pas un traitement du sevrage. Aucun délai personnel de disparition des envies. Un professionnel peut aider lorsque les envies restent difficiles à vivre.',
    url: 'https://rethinkingdrinking.niaaa.nih.gov/tools/worksheets-more/how-stop-alcohol-cravings'
  },
  {
    id: 'niaaa-recovery',
    title: 'Support Recovery: It’s a Marathon, Not a Sprint',
    authors: 'National Institute on Alcohol Abuse and Alcoholism · NIH',
    year: 2025,
    reviewedOn: '2026-10-27',
    type: 'Synthèse institutionnelle de recherches et de pratiques de soins',
    population: 'Personnes en rétablissement d’un trouble de l’usage d’alcool.',
    limits: 'Parcours variés, avec ou sans soins. Les études décrivent des groupes ; ni l’arrêt seul ni un compteur ne prédisent le rétablissement individuel. Les envies peuvent persister.',
    url: 'https://www.niaaa.nih.gov/health-professionals-communities/core-resource-on-alcohol/support-recovery-its-marathon-not-sprint'
  }
];

export const HEALTH_STAGES = [
  {
    id: 'first-days',
    fromMinutes: 0,
    fromDays: 0,
    label: 'Début',
    rangeLabel: '0 à 6 heures',
    title: 'Un premier pas qui compte',
    physical: [
      {
        title: 'Une première action pour ta santé',
        text: 'Ce temps donne un premier repère à ton arrêt. Même après 20 minutes, l’alcool déjà consommé peut encore passer dans le sang : le compteur décrit une durée, pas ton alcoolémie.',
        sourceIds: ['niaaa-overdose']
      }
    ],
    mental: [
      {
        title: 'Faire de la place à ce que tu ressens',
        text: 'Ton premier ressenti sera un point de comparaison pour la suite. Note ton humeur, ton énergie ou ton calme ; l’alcool récent peut encore influencer l’attention et le jugement.',
        sourceIds: ['niaaa-overdose']
      }
    ],
    checkInPrompt: 'Qu’aimerais-tu retrouver dans ton quotidien ? Comment te sens-tu maintenant ?',
    outlook: 'Tu poses le premier repère de ton parcours. Garde-le pour regarder, au fil des jours, ce qui change réellement pour toi.',
    sourceIds: ['niaaa-overdose']
  },
  {
    id: 'six-hours',
    fromMinutes: 360,
    fromDays: 0.25,
    label: '6 h',
    rangeLabel: '6 à 24 heures',
    title: 'Avancer avec du soutien',
    physical: [
      {
        title: 'Un accompagnement pour les premiers jours',
        text: 'Les soins du sevrage aident à traverser le manque en sécurité. En cas de dépendance, des symptômes peuvent commencer entre 6 et 24 heures après l’arrêt.',
        sourceIds: ['asam-2020']
      }
    ],
    mental: [
      {
        title: 'Des appuis pour retrouver du calme',
        text: 'L’accompagnement prend aussi en compte l’agitation et le sommeil. Une première journée inconfortable ne résume pas la suite de ton parcours : parle de ce que tu ressens.',
        sourceIds: ['asam-2020']
      }
    ],
    checkInPrompt: 'Qu’est-ce qui t’aide à te sentir soutenu aujourd’hui ?',
    outlook: 'T’entourer fait partie du chemin. Un symptôme nouveau ou qui s’aggrave mérite un avis médical rapide.',
    sourceIds: ['asam-2020']
  },
  {
    id: 'one-day',
    fromMinutes: 1440,
    fromDays: 1,
    label: '1 jour',
    rangeLabel: '24 à 48 heures',
    title: 'Une journée qui compte',
    physical: [
      {
        title: 'Vers des lendemains plus légers',
        text: 'Poursuivre l’arrêt évite une nouvelle exposition à l’alcool. Les effets du dernier épisode, comme la fatigue, les maux de tête ou les nausées, peuvent encore durer 24 heures ou davantage.',
        sourceIds: ['niaaa-hangovers']
      }
    ],
    mental: [
      {
        title: 'Des repères pour retrouver de la clarté',
        text: 'Ce premier bilan aide à suivre ta concentration et ton humeur. Après une alcoolisation, l’attention et les décisions peuvent encore être perturbées ; le ressenti ne suffit pas à juger l’aptitude à conduire.',
        sourceIds: ['niaaa-hangovers']
      }
    ],
    checkInPrompt: 'Quel petit changement ou quelle difficulté veux-tu noter aujourd’hui ?',
    outlook: 'Une journée est un repère concret. Continue l’accompagnement prévu : le risque de sevrage ne s’arrête pas automatiquement à ce jalon.',
    sourceIds: ['asam-2020']
  },
  {
    id: 'two-days',
    fromMinutes: 2880,
    fromDays: 2,
    label: '2 jours',
    rangeLabel: '48 à 72 heures',
    title: 'Construire de nouveaux appuis',
    physical: [
      {
        title: 'Des soins qui soutiennent ton arrêt',
        text: 'Un accompagnement adapté aide à traverser cette étape. À 48 heures, le sevrage peut encore évoluer : garde le contact avec le professionnel qui te suit.',
        sourceIds: ['asam-2020']
      }
    ],
    mental: [
      {
        title: 'Une envie n’est pas une obligation',
        text: 'Pour traverser une envie, le NIAAA conseille de repérer son déclencheur, de préparer une autre réponse et de s’appuyer sur quelqu’un de confiance.',
        sourceIds: ['niaaa-cravings']
      }
    ],
    checkInPrompt: 'Quelle personne ou quelle activité t’aide dans un moment difficile ?',
    outlook: 'Préparer un appui concret aujourd’hui te donne une réponse à retrouver lors d’une prochaine envie.',
    sourceIds: ['nhs-withdrawal', 'niaaa-cravings']
  },
  {
    id: 'three-days',
    fromMinutes: 4320,
    fromDays: 3,
    label: '3 jours',
    rangeLabel: '3 à 7 jours',
    title: 'Les premiers signes d’apaisement',
    physical: [
      {
        title: 'L’inconfort s’atténue souvent en plusieurs jours',
        text: 'Les symptômes simples s’atténuent souvent en plusieurs jours. Certaines complications peuvent toutefois débuter après 72 heures chez les personnes à risque.',
        sourceIds: ['nhs-withdrawal', 'asam-2020']
      }
    ],
    mental: [
      {
        title: 'Repérer les moments plus calmes',
        text: 'Le sommeil et l’humeur évoluent pendant les premiers jours. Note les moments de confort autant que les difficultés ; demander du soutien fait aussi partie de ton avancée.',
        sourceIds: ['ais-withdrawal']
      }
    ],
    checkInPrompt: 'As-tu remarqué un moment plus calme ou plus confortable, même bref ?',
    outlook: 'Les premiers changements se remarquent parfois dans de petites choses. Un symptôme inquiétant reste urgent, même après plusieurs jours.',
    sourceIds: ['nhs-withdrawal']
  },
  {
    id: 'first-weeks',
    fromMinutes: 10080,
    fromDays: 7,
    label: '1 semaine',
    rangeLabel: '1 à 2 semaines',
    title: 'Une semaine pour voir ce qui change',
    physical: [
      {
        title: 'Un quotidien qui gagne en confort',
        text: 'Les symptômes simples de sevrage s’atténuent généralement en plusieurs jours. Si une gêne persiste ou s’aggrave, un professionnel t’aide à comprendre ce qui se passe.',
        sourceIds: ['nhs-withdrawal']
      }
    ],
    mental: [
      {
        title: 'Moins d’anxiété dans les premières semaines de soins',
        text: 'Dans une étude auprès de 1 005 personnes, les trajectoires les plus fréquentes montraient une baisse de l’anxiété et des symptômes dépressifs pendant les premières semaines de soins. Les rythmes d’amélioration différaient.',
        sourceIds: ['gopaldas-2025']
      }
    ],
    checkInPrompt: 'En regardant tes premiers ressentis, qu’est-ce qui a changé pour toi ?',
    outlook: 'Ces résultats donnent une raison concrète d’espérer. Ton propre suivi montre ce que tu ressens ; si le mieux tarde, tu mérites un soutien adapté.',
    sourceIds: ['gopaldas-2025', 'nice-cg115', 'nhs-withdrawal']
  },
  {
    id: 'two-weeks',
    fromMinutes: 20160,
    fromDays: 14,
    label: '2 semaines',
    rangeLabel: '2 à 4 semaines',
    title: 'Les changements prennent forme',
    physical: [
      {
        title: 'Des marqueurs du foie en amélioration',
        text: 'Une petite étude en sevrage hospitalier a observé une amélioration de certains marqueurs d’atteinte légère du foie en deux semaines. Un bilan médical renseigne sur ta propre situation.',
        sourceIds: ['kirpich-2017']
      }
    ],
    mental: [
      {
        title: 'Des envies qui prennent moins de place',
        text: 'Les recherches présentées par le NIAAA associent le maintien de l’abstinence à une diminution des envies d’alcool et des émotions négatives au fil du temps, avec l’aide des soins et des stratégies apprises.',
        sourceIds: ['niaaa-recovery']
      }
    ],
    checkInPrompt: 'Qu’est-ce qui te demande moins d’effort ? De quel soutien as-tu encore besoin ?',
    outlook: 'Le changement se construit dans la durée. Prépare un bilan autour d’un mois pour reconnaître tes progrès et ajuster ton accompagnement.',
    sourceIds: ['nice-cg115', 'niaaa-recovery']
  },
  {
    id: 'one-month',
    fromMinutes: 40320,
    fromDays: 28,
    label: '1 mois',
    rangeLabel: 'Autour d’un mois',
    title: 'Un premier mois de chemin parcouru',
    physical: [
      {
        title: 'Des résultats mesurés pour la tension et le métabolisme',
        text: 'Dans une étude de consommateurs réguliers sans dépendance, un mois d’abstinence était associé à une amélioration de la tension, de la sensibilité à l’insuline et du poids. Ces changements se vérifient avec des mesures réelles.',
        sourceIds: ['mehta-2018']
      }
    ],
    mental: [
      {
        title: 'Mémoire de travail et aisance verbale en progrès',
        text: 'Chez 30 patients hospitalisés, les tests de mémoire de travail, de fluidité verbale et d’inhibition verbale se sont améliorés entre les jours 4 et 26. Les capacités complexes de planification évoluaient moins.',
        sourceIds: ['manning-2008']
      },
      {
        title: 'Un accompagnement ajusté à tes besoins',
        text: 'Le NICE recommande un point sur l’anxiété ou la dépression si elles persistent après trois à quatre semaines d’abstinence, pour proposer des soins adaptés. En cas de souffrance, consulte sans attendre ce délai.',
        sourceIds: ['nice-cg115']
      }
    ],
    checkInPrompt: 'Quels changements veux-tu garder en mémoire ? Qu’aimerais-tu encore améliorer ?',
    outlook: 'Fais le point sur tes ressentis et, si nécessaire, avec ton soignant. Ce bilan donne une direction à la suite de ton parcours.',
    sourceIds: ['mehta-2018', 'manning-2008', 'nice-cg115', 'nhs-liver']
  },
  {
    id: 'three-months',
    fromMinutes: 129600,
    fromDays: 90,
    label: '3 mois',
    rangeLabel: 'Point à 3 mois',
    title: 'Ancrer les habitudes qui te font du bien',
    physical: [
      {
        title: 'L’arrêt au cœur de la santé du foie',
        text: 'L’arrêt fait partie du traitement des maladies du foie liées à l’alcool. Certaines lésions, comme la stéatose, sont réversibles ; la récupération dépend de leur nature et se suit avec un professionnel.',
        sourceIds: ['nhs-liver']
      }
    ],
    mental: [
      {
        title: 'Vers des nuits plus reposantes',
        text: 'Dans une étude suivie sur six mois, l’abstinence était associée à une amélioration du sommeil après des soins pour dépendance à l’alcool. Une insomnie persistante mérite aussi son propre accompagnement.',
        sourceIds: ['brower-2011']
      }
    ],
    checkInPrompt: 'Quelles habitudes soutiennent ton sommeil, ton énergie ou ta concentration ?',
    outlook: 'Ce point à trois mois sert à reconnaître ce qui t’aide et à faire évoluer ton soutien. Les soins nécessaires continuent à faire partie du parcours.',
    sourceIds: ['nhs-liver', 'brower-2011']
  },
  {
    id: 'six-months',
    fromMinutes: 259200,
    fromDays: 180,
    label: '6 mois',
    rangeLabel: 'Point à 6 mois',
    title: 'Des progrès qui s’inscrivent dans la durée',
    physical: [
      {
        title: 'Prendre soin du corps dans la durée',
        text: 'En cas de maladie du foie liée à l’alcool, poursuivre l’arrêt est une part essentielle du traitement. Les examens et les soins prévus permettent de suivre ta situation.',
        sourceIds: ['nhs-liver']
      }
    ],
    mental: [
      {
        title: 'Mémoire et organisation : des progrès mesurés',
        text: 'Dans une petite étude, les participants restés abstinents ont progressé en six mois sur les tests de mémoire épisodique et de fonctions exécutives étudiés, comme l’inhibition et la souplesse mentale.',
        sourceIds: ['pitel-2009']
      },
      {
        title: 'Continuer à soutenir ton sommeil',
        text: 'L’étude sur six mois a observé une amélioration du sommeil associée à l’abstinence, tout en repérant des insomnies persistantes. Parler de tes nuits aide à choisir un accompagnement adapté.',
        sourceIds: ['brower-2011']
      }
    ],
    checkInPrompt: 'Qu’est-ce qui est devenu plus facile ? De quoi veux-tu prendre soin maintenant ?',
    outlook: 'Relis tes premiers bilans et reconnais les changements que tu observes. Ton parcours et tes besoins restent les meilleurs repères pour la suite.',
    sourceIds: ['nhs-liver', 'pitel-2009', 'brower-2011']
  },
  {
    id: 'long-term',
    fromMinutes: 525600,
    fromDays: 365,
    label: '1 an',
    rangeLabel: '1 an et au-delà',
    title: 'Plus de place pour ce qui compte',
    physical: [
      {
        title: 'Réduire les risques dans la durée',
        text: 'L’évaluation du CIRC conclut que l’arrêt durable réduit l’incidence des cancers de la bouche et de l’œsophage. Ce bénéfice se construit à long terme ; il ne correspond pas à un risque devenu nul au premier anniversaire.',
        sourceIds: ['iarc-2024']
      }
    ],
    mental: [
      {
        title: 'Du mieux-être au-delà du compteur',
        text: 'Les recherches sur le rétablissement décrivent des progrès de santé mentale, de qualité de vie et de relations dans la durée. Fais le point sur les changements qui comptent pour toi et les soutiens que tu veux garder.',
        sourceIds: ['niaaa-recovery']
      }
    ],
    checkInPrompt: 'Qu’as-tu retrouvé ou découvert dans ta vie ? Quelle place veux-tu lui donner pour la suite ?',
    outlook: 'Les jours comptent, et ce que tu en fais aussi. Continue à nourrir les habitudes, les liens et les projets qui soutiennent ton parcours.',
    sourceIds: ['iarc-2024', 'nice-cg115', 'nhs-liver', 'niaaa-recovery']
  }
];

export const HEALTH_ADDICTION = {
  title: 'Plus de liberté face aux envies',
  text: 'Dans les recherches sur le rétablissement, le maintien de l’abstinence s’accompagne d’une diminution des envies d’alcool et des émotions négatives. Les stratégies apprises et le soutien donnent des appuis pour avancer.',
  sourceIds: ['niaaa-recovery', 'niaaa-cravings'],
  steps: [
    {
      title: 'Reconnaître le déclencheur',
      text: 'Repère la situation, l’émotion ou le moment qui précède l’envie.',
      sourceIds: ['niaaa-cravings']
    },
    {
      title: 'Préparer une autre réponse',
      text: 'Prévois une activité sans alcool ou un lieu où tu te sens soutenu.',
      sourceIds: ['niaaa-cravings']
    },
    {
      title: 'Laisser passer la vague',
      text: 'Observe l’envie sans y répondre immédiatement : son intensité évolue.',
      sourceIds: ['niaaa-cravings']
    },
    {
      title: 'T’appuyer sur quelqu’un',
      text: 'Parle à une personne de confiance ou à un soignant.',
      sourceIds: ['niaaa-cravings']
    }
  ],
  support: {
    title: 'Tu peux te faire aider',
    text: 'Un professionnel peut proposer des stratégies et des traitements pour réduire les envies difficiles à vivre.',
    sourceIds: ['niaaa-cravings', 'nhs-withdrawal']
  },
  setback: {
    title: 'Ton parcours continue',
    text: 'Une consommation ne retire pas la valeur de tes efforts. Chercher du soutien et comprendre ce qui s’est passé aide à préparer la suite.',
    sourceIds: ['niaaa-recovery']
  }
};

export const HEALTH_SAFETY = {
  withdrawal: 'Si tu buvais quotidiennement, en grande quantité, ou as déjà ressenti un manque, demande un avis médical pour sécuriser l’arrêt. Des tremblements, sueurs ou nausées après l’arrêt nécessitent un avis rapide.',
  urgent: 'Confusion, hallucinations, convulsions, tremblements intenses, difficulté à respirer ou à rester éveillé : appelle immédiatement les urgences. En France : 15 ou 112. Ailleurs : le numéro d’urgence local. N’attends pas le prochain palier.',
  mental: 'Si tu es en détresse ou as des pensées suicidaires, appelle le 3114 en France, gratuitement, 24 h/24 et 7 j/7. En danger immédiat : 15 ou 112 ; ailleurs, les urgences ou un service de crise local.',
  sourceIds: ['ais-withdrawal', 'nhs-withdrawal', 'niaaa-overdose', 'nice-cg115', 'fr-3114']
};
