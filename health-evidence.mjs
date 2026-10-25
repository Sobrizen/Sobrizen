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
  }
];

export const HEALTH_STAGES = [
  {
    id: 'first-days',
    fromMinutes: 0,
    fromDays: 0,
    label: 'Début',
    rangeLabel: '0 à 6 heures',
    title: 'Tu as commencé',
    physical: [
      {
        title: 'Les premières minutes comptent',
        text: 'Même après 20 minutes, l’alcool déjà bu peut encore passer dans le sang. Ton compteur ne permet pas d’affirmer un changement physique précis à cet instant.',
        sourceIds: ['niaaa-overdose']
      }
    ],
    mental: [
      {
        title: 'Un premier repère pour toi',
        text: 'L’alcool récemment consommé peut encore influencer l’attention et le jugement. Note simplement comment tu te sens, sans chercher à mesurer une récupération.',
        sourceIds: ['niaaa-overdose']
      }
    ],
    checkInPrompt: 'Comment te sens-tu au début de ce nouveau départ ?',
    outlook: 'Ce premier repère servira à regarder ton évolution. L’heure du dernier verre ne permet pas de calculer quand l’alcool aura disparu de ton organisme.',
    sourceIds: ['niaaa-overdose']
  },
  {
    id: 'six-hours',
    fromMinutes: 360,
    fromDays: 0.25,
    label: '6 h',
    rangeLabel: '6 à 24 heures',
    title: 'Prendre tes premiers repères',
    physical: [
      {
        title: 'Une adaptation différente pour chacun',
        text: 'En cas de dépendance, des signes de manque peuvent débuter entre 6 et 24 heures. Un professionnel peut t’aider à traverser cette étape en sécurité.',
        sourceIds: ['asam-2020']
      }
    ],
    mental: [
      {
        title: 'Écouter ton sommeil et ton humeur',
        text: 'Agitation ou sommeil perturbé peuvent accompagner le sevrage. Leur présence et leur intensité varient d’une personne à l’autre.',
        sourceIds: ['asam-2020']
      }
    ],
    checkInPrompt: 'Comment évoluent ton calme, ton énergie et ton confort ?',
    outlook: 'Les premières heures ne prédisent pas la suite. Demande de l’aide si un symptôme apparaît ou s’aggrave.',
    sourceIds: ['asam-2020']
  },
  {
    id: 'one-day',
    fromMinutes: 1440,
    fromDays: 1,
    label: '1 jour',
    rangeLabel: '24 à 48 heures',
    title: 'Une journée pour te connaître',
    physical: [
      {
        title: 'Le lendemain peut encore être difficile',
        text: 'Après une alcoolisation, fatigue, maux de tête ou nausées peuvent durer 24 heures ou davantage. Ce délai varie selon les personnes et la consommation.',
        sourceIds: ['niaaa-hangovers']
      }
    ],
    mental: [
      {
        title: 'L’attention peut rester perturbée',
        text: 'Un lendemain d’alcool peut encore affecter la concentration et les décisions. Ton ressenti n’est pas un test d’aptitude à conduire.',
        sourceIds: ['niaaa-hangovers']
      }
    ],
    checkInPrompt: 'Qu’est-ce qui a changé depuis ton premier point ?',
    outlook: 'Un jour d’arrêt ne garantit pas la fin du risque de sevrage chez une personne dépendante. Continue l’accompagnement prévu avec ton professionnel.',
    sourceIds: ['asam-2020']
  },
  {
    id: 'two-days',
    fromMinutes: 2880,
    fromDays: 2,
    label: '2 jours',
    rangeLabel: '48 à 72 heures',
    title: 'Deux jours, à ton rythme',
    physical: [
      {
        title: 'Continuer à prendre soin de toi',
        text: 'À 48 heures, un sevrage peut encore évoluer chez une personne dépendante. Le nombre d’heures écoulées ne remplace pas l’avis du soignant.',
        sourceIds: ['asam-2020']
      }
    ],
    mental: [
      {
        title: 'Des émotions encore changeantes',
        text: 'Le sommeil et l’humeur peuvent rester perturbés pendant les premiers jours. Tu peux chercher du soutien même si ton compteur avance.',
        sourceIds: ['ais-withdrawal']
      }
    ],
    checkInPrompt: 'Ton sommeil ou ton humeur ont-ils changé depuis hier ?',
    outlook: 'La suite peut être plus confortable, mais 48 heures n’est pas une date de récupération garantie. Tes observations comptent davantage qu’une attente de résultat.',
    sourceIds: ['nhs-withdrawal']
  },
  {
    id: 'three-days',
    fromMinutes: 4320,
    fromDays: 3,
    label: '3 jours',
    rangeLabel: '3 à 7 jours',
    title: 'Laisser de la place à ton rythme',
    physical: [
      {
        title: 'Un apaisement progressif est possible',
        text: 'Les symptômes simples s’atténuent souvent en plusieurs jours. Certaines complications peuvent toutefois débuter après 72 heures chez les personnes à risque.',
        sourceIds: ['nhs-withdrawal', 'asam-2020']
      }
    ],
    mental: [
      {
        title: 'Le sommeil peut demander du temps',
        text: 'Des nuits irrégulières ou une humeur difficile peuvent persister. Tu n’as pas besoin d’attendre une semaine pour en parler à un professionnel.',
        sourceIds: ['ais-withdrawal']
      }
    ],
    checkInPrompt: 'Remarques-tu des moments plus confortables dans ta journée ?',
    outlook: 'Un mieux peut apparaître pendant cette première semaine, avec des rythmes différents. Un symptôme inquiétant reste urgent, même après plusieurs jours.',
    sourceIds: ['nhs-withdrawal']
  },
  {
    id: 'first-weeks',
    fromMinutes: 10080,
    fromDays: 7,
    label: '1 semaine',
    rangeLabel: '1 à 2 semaines',
    title: 'Observer les premiers changements',
    physical: [
      {
        title: 'Une évolution à ton rythme',
        text: 'Certains symptômes physiques s’atténuent souvent après plusieurs jours. Une gêne persistante ou qui s’aggrave doit être discutée avec un professionnel.',
        sourceIds: ['nhs-withdrawal']
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
    sourceIds: ['gopaldas-2025', 'nice-cg115', 'nhs-withdrawal']
  },
  {
    id: 'two-weeks',
    fromMinutes: 20160,
    fromDays: 14,
    label: '2 semaines',
    rangeLabel: '2 à 4 semaines',
    title: 'Observer ce qui change pour toi',
    physical: [
      {
        title: 'Des changements internes sont possibles',
        text: 'Dans une petite étude de sevrage hospitalier, certains marqueurs d’atteinte légère du foie s’amélioraient après deux semaines. Cela ne signifie pas que ton foie est rétabli.',
        sourceIds: ['kirpich-2017']
      }
    ],
    mental: [
      {
        title: 'Des trajectoires différentes',
        text: 'Les études en soins montrent des évolutions variées de l’anxiété et de l’humeur au cours du premier mois. Compare-toi à tes propres observations.',
        sourceIds: ['gopaldas-2025']
      }
    ],
    checkInPrompt: 'Comment sont ton énergie, ton sommeil et ton humeur par rapport au début ?',
    outlook: 'Autour d’un mois, un point peut aider à repérer ce qui s’améliore et ce qui mérite du soutien. Une difficulté persistante peut être discutée dès maintenant.',
    sourceIds: ['nice-cg115']
  },
  {
    id: 'one-month',
    fromMinutes: 40320,
    fromDays: 28,
    label: '1 mois',
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
    fromMinutes: 129600,
    fromDays: 90,
    label: '3 mois',
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
        sourceIds: ['brower-2011']
      }
    ],
    checkInPrompt: 'Compare ton sommeil, ton énergie et ta concentration à tes premiers bilans. De quoi as-tu besoin maintenant ?',
    outlook: 'Ce rendez-vous est un repère pour ton suivi, pas une date de récupération attendue. Les lésions avancées peuvent nécessiter des soins malgré la poursuite de l’arrêt.',
    sourceIds: ['nhs-liver', 'brower-2011']
  },
  {
    id: 'six-months',
    fromMinutes: 259200,
    fromDays: 180,
    label: '6 mois',
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
    fromMinutes: 525600,
    fromDays: 365,
    label: '1 an',
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
  urgent: 'Confusion, hallucinations, convulsions, tremblements intenses, difficulté à respirer ou à rester éveillé : appelle immédiatement les urgences. En France : 15 ou 112. Ailleurs : le numéro d’urgence local. N’attends pas le prochain palier.',
  mental: 'Si tu es en détresse ou as des pensées suicidaires, appelle le 3114 en France, gratuitement, 24 h/24 et 7 j/7. En danger immédiat : 15 ou 112 ; ailleurs, les urgences ou un service de crise local.',
  sourceIds: ['ais-withdrawal', 'nhs-withdrawal', 'niaaa-overdose', 'nice-cg115', 'fr-3114']
};
