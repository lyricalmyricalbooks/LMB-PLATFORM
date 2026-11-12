// La version française des conditions (Julian, 3 novembre 2026, « also for Quebec »). La Charte de la langue française
// demande qu'un contrat d'adhésion offert à une entreprise du Québec soit d'abord remis en français : la page des
// conditions s'ouvre en français pour le Québec (?lang=fr) et l'inscription montre le lien français en premier.
//
// Mêmes parties, même nombre de paragraphes et même version que terms.js (terms.test.js le vérifie) : changer un mot
// ici ou là-bas, c'est une nouvelle TERMS_VERSION.
import {
  BACKUP_KEEP_DAYS, CHANGE_NOTICE_DAYS, DOWNLOAD_DAYS, OPERATOR_NAME, PAUSED_DAYS, PRIVACY_CONTACT, REPORT_CONTACT,
  SHUTDOWN_NOTICE_DAYS,
} from "./terms.js";

/** L'adresse de l'entreprise, écrite à la française. */
export const OPERATOR_ADDRESS_FR = "456, avenue Montrose, Toronto (Ontario) M6G 3H1, Canada";
export const GOVERNING_LAW_FR = "la province de l'Ontario et les lois du Canada qui s'y appliquent";

/** Les entreprises qui nous aident, dans le même ordre que HELPERS. */
export const HELPERS_FR = Object.freeze([
  "Google Cloud et Google Workspace : gardent chaque boutique en ligne, conservent ses renseignements, gèrent la connexion, font fonctionner l'aide à la rédaction et envoient les courriels de votre boutique et les nôtres. Travaillent depuis le Canada (Montréal), avec certains services, dont le courriel, aux États-Unis.",
  "Stripe : reçoit les paiements par carte pour votre boutique et pour votre forfait Colophon. Travaille depuis les États-Unis et le Canada.",
  "Shippo et Postes Canada : tarifs et étiquettes d'expédition, seulement si vous les activez. Travaillent depuis les États-Unis et le Canada.",
]);

/** Les titres de la page elle-même. */
export const PAGE_FR = Object.freeze({
  title: "Nos engagements",
  lede: "Ce que nous promettons à votre maison d'édition, ce que nous faisons de vos données et ce qui arrive à votre boutique si Colophon ferme un jour. Le tout sur une page, en mots simples.",
  version: "Quand ce texte change, la version change, et nous vous demandons d'accepter de nouveau.",
  contents: "Sur cette page",
  other: "Read in English",
});

/** @type {readonly import("./terms.js").Section[]} */
export const SECTIONS_FR = Object.freeze([
  {
    id: "terms",
    title: "Conditions d'utilisation",
    paragraphs: [
      `Ces conditions lient votre maison d'édition et ${OPERATOR_NAME}, l'entreprise qui exploite Colophon, au ${OPERATOR_ADDRESS_FR}. La personne qui coche la case à l'inscription accepte au nom de la maison et confirme qu'elle en a le droit.`,
      "Colophon donne à votre maison un seul forfait qui comprend tout : un site web et une réserve. Le service est fait pour les entreprises du Canada et des États-Unis, pas pour des personnes qui achètent pour elles-mêmes.",
      "Votre boutique est votre propre entreprise. Votre maison est le vendeur auprès de vos clients, fixe ses prix et ses politiques, et respecte les lois sur la vente, la vie privée et les taxes des endroits où elle vend.",
      "Vous êtes responsable de ce que vous vendez et des textes et images de votre boutique. N'utilisez pas Colophon pour vendre quoi que ce soit d'illégal là où vous êtes ou là où sont vos acheteurs.",
      "Vos livres, vos textes et vos images restent à vous. Vous nous permettez de les copier et de les montrer seulement pour faire fonctionner votre boutique, et cela prend fin quand elle est supprimée.",
      "Gardez votre connexion en sécurité et dites-nous tout de suite si vous croyez que quelqu'un d'autre l'a utilisée.",
      "Nous pouvons fermer une boutique qui vend quelque chose d'illégal, reçoit des paiements frauduleux, envoie des courriels non sollicités ou met d'autres boutiques en danger. Nous vous en donnons la raison par écrit, et la façon de demander un réexamen.",
      "Nous travaillons fort pour garder chaque boutique ouverte, et notre page d'état montre comment va le service. Nous ne pouvons pas promettre qu'il ne s'arrêtera jamais un moment.",
      "Dans la mesure permise par la loi, notre responsabilité totale envers votre maison, pour toute réclamation, se limite à ce que vous nous avez payé dans les 12 mois précédents. Nous ne sommes pas responsables des ventes ou profits perdus.",
      `Si nous modifions ces conditions, nous vous écrivons au moins ${CHANGE_NOTICE_DAYS} jours avant et vous demandons d'accepter de nouveau. Si vous n'acceptez pas, vous pouvez annuler avant le changement sans rien payer de plus.`,
      `Ces conditions sont régies par les lois de ${GOVERNING_LAW_FR}.`,
    ],
  },
  {
    id: "paying",
    title: "Votre forfait et le paiement",
    paragraphs: [
      "Votre forfait commence par un essai gratuit, et nous ne demandons jamais de carte pour le commencer. Il dure le nombre de jours affiché sur la page d'inscription le jour de votre inscription. Si l'essai se termine sans carte, votre boutique est mise en pause et rien n'est facturé.",
      "Une fois votre carte ajoutée, votre forfait se renouvelle chaque mois jusqu'à ce que vous annuliez. Chaque mois, nous débitons cette carte des frais du forfait et de ce qu'a coûté le fonctionnement de votre boutique le mois précédent (stockage, trafic web, tâches de fond et courriels), à ce qu'il nous coûte, sans rien ajouter. Nous le calculons à partir du relevé de l'usage de chaque boutique tenu par notre fournisseur infonuagique, et le vérifions avec la facture de ce fournisseur avant de vous facturer. Les mois d'essai ne coûtent rien. Votre page de facturation montre le coût à ce jour, et nous vous écrivons quand un mois semble devoir dépasser le montant que vous y choisissez (25 $ si vous ne le changez pas).",
      "Une maison aux États-Unis paie en dollars américains, et une maison au Canada en dollars canadiens. Le coût de fonctionnement est calculé en dollars canadiens et, pour une maison qui paie en dollars américains, nous le convertissons au taux de change du jour, sans rien ajouter. Les prix sont affichés avant taxes. Nous ajoutons les taxes de vente de l'endroit où se trouve votre maison, sa province ou son État, et votre facture les indique. Vous pouvez télécharger chaque facture depuis Réglages, sous Facturation.",
      "Une maison qui paie déjà une part des ventes de son site au lieu d'un prix mensuel continue de payer ainsi jusqu'à ce qu'elle change. Ce choix n'est pas offert aux nouvelles maisons.",
      "L'offre fondatrice donne aux premières maisons des frais de plateforme réduits tant qu'elles gardent leur forfait. Elle ne réduit pas le coût de fonctionnement. Si une maison fondatrice annule avant son premier paiement, sa place passe à la maison suivante.",
      `Si nous augmentons un prix ou changeons la façon de le calculer, nous vous écrivons au moins ${CHANGE_NOTICE_DAYS} jours avant votre premier paiement au nouveau prix, et vous pouvez annuler avant sans rien payer de plus.`,
      "Vous pouvez annuler en tout temps depuis Forfait et facturation dans votre compte, sans appel ni courriel. Nous vous écrivons pour le confirmer.",
      "Quand vous annulez, votre forfait continue jusqu'à la fin du mois déjà payé, et nous ne remboursons pas une partie de mois. Vous pouvez changer d'avis d'ici là.",
      `Si un paiement échoue, nous vous prévenons et gardons votre boutique ouverte pendant que vous réglez la situation. Une boutique qui ne peut toujours pas être payée est mise en pause, et tout son contenu est conservé ${PAUSED_DAYS} jours.`,
      `Quand un forfait prend fin, ou qu'une boutique en pause atteint ${PAUSED_DAYS} jours, la boutique ferme. Vous avez alors ${DOWNLOAD_DAYS} jours pour tout télécharger.`,
      "Nous vous écrivons 30 jours et 7 jours avant la suppression d'une boutique fermée. Elle est ensuite supprimée pour de bon, sauf les documents que la loi nous oblige à garder, comme les factures de votre forfait.",
    ],
  },
  {
    id: "privacy",
    title: "Politique de confidentialité",
    paragraphs: [
      "Cette partie vous concerne, vous qui dirigez une maison sur Colophon. Vos clients sont couverts par la politique de confidentialité de votre propre boutique.",
      `${OPERATOR_NAME} est responsable des renseignements que nous gardons sur vous. Notre responsable de la protection des renseignements personnels en répond, à ${PRIVACY_CONTACT}.`,
      "Nous gardons votre nom, votre adresse courriel, le nom de votre maison, votre forfait, vos réponses à l'inscription et tout design de boutique fait avant la création de votre boutique. Nous les utilisons pour faire fonctionner votre boutique, facturer votre forfait et vous écrire au sujet de votre compte.",
      "Les numéros de carte sont gardés par notre entreprise de paiement. Nous ne voyons que la marque de la carte, ses quatre derniers chiffres et sa date d'expiration.",
      "Nous gardons aussi une trace des connexions, des nouveaux appareils et de ce que notre équipe fait dans votre boutique, pour protéger les comptes.",
      "Nous utilisons vos renseignements parce que nous en avons besoin pour vous offrir le service choisi, parce que la loi nous oblige à garder certains documents, et pour protéger Colophon contre la fraude.",
      "Nous vous écrivons au sujet de votre compte, de votre forfait et de votre boutique. Pour le reste, comme les nouvelles de Colophon, seulement si vous le demandez, et chacun de ces courriels permet de les arrêter.",
      "Nous ne vendons jamais vos renseignements et ne montrons jamais de publicité à vous ou à vos clients. Les pages de Colophon n'utilisent aucun témoin de publicité ou de suivi.",
      "Toutes les boutiques fonctionnent sur un seul système Colophon partagé, stocké au Canada. Les renseignements de chaque boutique sont derrière leur propre mur, qu'aucune autre maison ne peut franchir. Pour calculer le coût de fonctionnement de chaque boutique, nous comptons son usage (pages servies, fichiers stockés, tâches et courriels) à partir des relevés de notre fournisseur infonuagique, et rien de plus. Certaines des entreprises nommées plus bas travaillent aux États-Unis, dont les lois peuvent permettre aux autorités d'y accéder.",
      `Chaque copie de sauvegarde est gardée ${BACKUP_KEEP_DAYS} jours, puis supprimée. Si votre boutique est supprimée, ses sauvegardes sont gardées ${BACKUP_KEEP_DAYS} jours de plus, puis disparaissent aussi.`,
      "L'historique de ce qui s'est passé dans votre boutique est supprimé après deux ans. Les factures et documents fiscaux sont gardés au moins six ans, comme le demandent les lois fiscales.",
      "Vous pouvez nous demander une copie de ce que nous détenons sur vous, ou nous demander de le corriger ou de le supprimer. Écrivez-nous depuis la page de votre compte; nous répondons dans les 30 jours.",
      `Pour toute question sur la vie privée, écrivez à ${PRIVACY_CONTACT}. Si nous ne pouvons pas régler la situation, vous pouvez porter plainte auprès du commissaire à la protection de la vie privée de chez vous; au Québec, la Commission d'accès à l'information.`,
    ],
  },
  {
    id: "data",
    title: "Vos données et celles de vos clients",
    paragraphs: [
      "Vos livres, commandes, clients et liste d'infolettre appartiennent à votre maison. Nous les gardons pour vous et ne les utilisons que pour faire fonctionner votre boutique. Vous pouvez tout télécharger en tout temps depuis Réglages, sous Télécharger votre boutique.",
      "Quand un client achète chez vous, votre maison décide de ce qui est gardé sur lui. Nous le gardons en votre nom et suivons vos instructions, données par vos réglages et vos demandes.",
      "Si une loi nous obligeait un jour à faire autre chose de ces données, nous vous le dirions d'abord, sauf si cette loi l'interdit.",
      "Toutes les personnes de notre équipe qui peuvent voir vos données se sont engagées à les garder confidentielles. Notre équipe n'entre dans votre boutique que si vous demandez de l'aide, et seulement le temps nécessaire. Chaque visite est consignée.",
      "Nous protégeons vos données par la connexion en deux étapes, le chiffrement, un mur entre les données de chaque boutique, des sauvegardes chaque nuit et une trace de chaque visite.",
      "Quand un client demande à voir ou à supprimer ses renseignements, votre boutique a les outils pour le faire, et nous vous aidons si vous le demandez.",
      `Les entreprises qui nous aident sont nommées plus bas. Nous vous écrivons au moins ${CHANGE_NOTICE_DAYS} jours avant d'en ajouter une, et si vous vous y opposez, vous pouvez partir sans payer le reste du mois.`,
      "Si un incident touche vos données, nous vous prévenons dès que nous le savons, et dans les 72 heures, en mots simples, avec ce que nous faisons pour y remédier.",
      `Quand votre boutique est supprimée, après les ${DOWNLOAD_DAYS} jours pour la télécharger, les données de vos clients sont supprimées avec elle.`,
      "Si la loi de l'endroit où vivent vos clients demande une entente signée sur les données, demandez-la-nous et nous en signerons une fondée sur ce texte.",
    ],
  },
  {
    id: "helpers",
    title: "Les entreprises qui nous aident",
    paragraphs: [
      ...HELPERS_FR,
      "Si votre maison relie son propre compte Square ou PayPal, c'est l'entente de votre maison avec cette entreprise qui s'applique.",
    ],
  },
  {
    id: "reports",
    title: "Signaler une boutique",
    paragraphs: [
      `Toute personne peut signaler une boutique qui vend quelque chose d'illégal ou qui copie l'œuvre de quelqu'un d'autre. Écrivez à ${REPORT_CONTACT} en indiquant la boutique et la page, le problème et comment vous joindre.`,
      "Nous examinons chaque signalement et en informons la maison. Nous retirons ce qui est clairement illégal et disons aux deux parties ce que nous avons décidé et pourquoi.",
      "Un signalement selon lequel une boutique copie l'œuvre de quelqu'un est transmis à la maison, comme le demande la loi canadienne sur le droit d'auteur. Une maison signalée à répétition pour copie peut voir sa boutique fermée.",
    ],
  },
  {
    id: "shutdown",
    title: "Si Colophon ferme un jour",
    paragraphs: [
      `Nous vous préviendrons au moins ${SHUTDOWN_NOTICE_DAYS} jours avant l'arrêt de Colophon, par courriel et sur la page de votre compte. Votre boutique continue de fonctionner pendant ces ${SHUTDOWN_NOTICE_DAYS} jours.`,
      "Vous pouvez télécharger toute votre boutique en tout temps depuis Réglages, avec ses livres, commandes, clients, images et réglages, y compris pendant ces jours.",
      "Les données de votre boutique sont gardées à part de celles de toutes les autres maisons. Si vous voulez la garder en marche, nous faisons une copie complète des données et fichiers de votre boutique et remettons cette copie à votre maison, avec ses livres, commandes, clients et réglages, sans frais.",
      `Il en va de même si vous nous quittez : pendant les ${DOWNLOAD_DAYS} jours qui suivent la fermeture de votre boutique, vous gardez vos fichiers et pouvez demander votre propre copie.`,
    ],
  },
]);
