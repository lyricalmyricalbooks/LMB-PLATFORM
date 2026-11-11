// French twins of the platform's other press-facing emails (everything a press or its people receive, apart from the
// closing emails in templatesFr.js), for presses in Quebec. Same kinds, same `data`, same links and the same errors on
// bad data as TEMPLATES (templates.js). Words a press, a person or another part of the platform wrote in English (a
// support answer, a setup tip, a check-up line, a press message, a reason) come through as they were; the fixed
// English phrases the platform itself builds (card words, role words, newsletter problems, who stopped a request, plan
// names, prices) are turned French here, and anything unknown is kept rather than lost.
//
// No import from templatesFr.js: that file imports this one, so the small day helper is copied here.
import { layout, safeLink } from "./templates.js";

// What the shop sells (code plan 12.18): the French twin of shared/sells goodsWords, for the French emails whose English
// twin is worded for a shop that doesn't sell books. Only the words these emails use: livres → produits, titre → produit,
// maison d'édition → boutique. A books shop's emails never pass through it.
const GOODS_SWAPS_FR = [
  [/\bVos livres\b/g, "Vos produits"], [/\bvos livres\b/g, "vos produits"], [/\bLivres\b/g, "Produits"], [/\blivres\b/g, "produits"],
  [/\bun livre\b/g, "un produit"], [/\blivre\b/g, "produit"], [/\bun nouveau titre\b/g, "un nouveau produit"],
  [/\bla maison d'édition\b/g, "la boutique"], [/\bmaison d'édition\b/g, "boutique"],
];

/** French words for a shop that isn't books: livres → produits. */
export function goodsWordsFr(text) {
  return GOODS_SWAPS_FR.reduce((out, [from, to]) => out.replace(from, to), String(text));
}

const sameFr = (text) => text;

// The reasons Colophon's Chit Chats app writes itself (services/chitchats/app.js); Chit Chats's own stay as they came.
const CHITCHATS_WORDS_FR = Object.freeze({ "The order has no full shipping address.": "la commande n'a pas d'adresse de livraison complète." });

/** The plans' names in French (services/settings.js PLAN_NAMES); a name not known comes through as it was. */
const PLAN_NAMES_FR = Object.freeze({ Shop: "Boutique", Stockroom: "Réserve", "Shop and stockroom": "Boutique et réserve" });
export const planNameFr = (name) => PLAN_NAMES_FR[String(name ?? "").trim()] ?? name;

/**
 * A price as billing writes it in English ("$29.00", "US$1,234.50", "-$5.00") the French way ("29,00 $",
 * "1 234,50 US$", "-5,00 $"): comma for decimals, a thin no-break space between thousands, the sign after. Anything
 * else comes through as it was.
 */
export function frenchMoney(text) {
  const m = String(text ?? "").trim().match(/^(-?)([^\d\s,.-]*)(-?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?$/);
  if (!m || !m[2]) return text;
  const whole = m[4].replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return `${m[1] || m[3]}${whole}${m[5] ? `,${m[5]}` : ""}\u00a0${m[2]}`;
}

const signOff = (settings) => `Envoyé par ${settings.platformName}. Répondez à ce courriel si vous avez besoin d'un coup de main.`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * An English day as the platform writes it ("March 1, 2027", billing.js dateText, or "1 March 2027") becomes
 * "1er mars 2027"; "November 2026" becomes "novembre 2026" and "November" "novembre". Anything else is kept.
 * The one copy: templatesFr.js re-exports it.
 */
export function frenchDay(text) {
  const words = String(text ?? "").trim();
  const day = (d) => (Number(d) === 1 ? "1er" : String(Number(d)));
  let m = words.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  if (m && MONTHS.includes(m[1])) return `${day(m[2])} ${MOIS[MONTHS.indexOf(m[1])]} ${m[3]}`;
  m = words.match(/^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/);
  if (m && MONTHS.includes(m[2])) return `${day(m[1])} ${MOIS[MONTHS.indexOf(m[2])]} ${m[3]}`;
  m = words.match(/^([A-Z][a-z]+) (\d{4})$/);
  if (m && MONTHS.includes(m[1])) return `${MOIS[MONTHS.indexOf(m[1])]} ${m[2]}`;
  if (MONTHS.includes(words)) return MOIS[MONTHS.indexOf(words)];
  return text;
}

/**
 * A moment the platform passes as an ISO time ("2026-11-05T12:00:00.000Z": new-device, recovery-approved), in UTC the
 * French way: "5 novembre 2026 à 12 h 00". Anything else goes through frenchDay.
 */
export function frenchMoment(text) {
  const words = String(text ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(words) || !Number.isFinite(Date.parse(words))) return frenchDay(text);
  const t = new Date(words);
  const pad = (n) => String(n).padStart(2, "0");
  const day = t.getUTCDate() === 1 ? "1er" : String(t.getUTCDate());
  return `${day} ${MOIS[t.getUTCMonth()]} ${t.getUTCFullYear()} à ${t.getUTCHours()} h ${pad(t.getUTCMinutes())}`;
}

const listed = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} et ${words.at(-1)}` : words.join(""));

/** "1.5%" becomes "1,5 %". */
const percentFr = (text) => String(text).replace(/(\d+)\.(\d+)/g, "$1,$2").replace(/(\d)%/g, "$1 %");

/** The app a plan change drops ("the stockroom", "the shop and the stockroom"), in French. */
const CLOSING_FR = Object.freeze({
  "the shop": "la boutique",
  "the stockroom": "la réserve",
  "the shop and the stockroom": "la boutique et la réserve",
});

/** accounts/roles.js ROLE_WORDS, in French. */
const ROLES_FR = Object.freeze({
  "an owner, with everything including billing and the team": "propriétaire, avec accès à tout, y compris la facturation et l'équipe",
  "staff, with the shop's admin but not billing, payment and email connections, or the team": "membre du personnel, avec l'administration de la boutique, mais sans la facturation, les branchements de paiement et de courriel, ni l'équipe",
  "an author, with your own books in the stockroom": "auteur ou autrice, avec vos propres livres dans la réserve",
  "the bookkeeper, reading the shop's orders, sales, tax and payouts without changing anything": "responsable de la comptabilité, qui consulte les commandes, les ventes, les taxes et les versements de la boutique sans rien modifier",
});

/** accounts/recovery.js: who stopped a recovery request. */
const STOPPED_BY_FR = Object.freeze({
  "the account's owner": "la personne propriétaire du compte",
  "the person who asked": "la personne qui l'avait demandé",
});

/** reputation.js's problem words ("3 people marked it as spam (1.5%)"), in French. */
function newsletterProblemFr(words) {
  let m = String(words).match(/^(\d+) people marked it as spam \((.+)\)$/);
  if (m) return `${m[1]} ${Number(m[1]) === 1 ? "personne l'a signalée" : "personnes l'ont signalée"} comme indésirable (${percentFr(m[2])})`;
  m = String(words).match(/^(\d+) addresses bounced \((.+)\)$/);
  if (m) return `${m[1]} ${Number(m[1]) === 1 ? "adresse a été refusée" : "adresses ont été refusées"} (${percentFr(m[2])})`;
  return words;
}

/** billing/cards.js card words ("Visa ending 4242"), in French. */
const cardFr = (card) => String(card ?? "").replace(/^(.+) ending (\d{4})$/, "$1 se terminant par $2");

/** new-device's browser words (accounts/devices.js browserWords: "Chrome on Mac", "A browser"), in French. */
const browserFr = (browser) => String(browser ?? "").replace(/^A browser$/, "un navigateur").replace(/ on /, " sur ").replace(/iPhone or iPad$/, "iPhone ou iPad");

/** What Stripe still needs (services/payments/requirements.js WORDS), in French; an unknown one comes through. */
const NEEDS_FR = Object.freeze({
  "your bank details": "vos coordonnées bancaires",
  "your agreement to Stripe's terms": "votre acceptation des conditions de Stripe",
  "a document showing your business is registered": "un document qui montre que votre entreprise est enregistrée",
  "a photo of your ID": "une photo de votre pièce d'identité",
  "your date of birth": "votre date de naissance",
  "your ID number": "votre numéro d'identité",
  "your business number": "votre numéro d'entreprise",
  "your business details": "les renseignements sur votre entreprise",
  "your shop's web address": "l'adresse Web de votre boutique",
  "what you sell": "ce que vous vendez",
  "how shoppers can reach you": "comment les clients peuvent vous joindre",
  "what kind of business you are": "le type de votre entreprise",
  "the name on shoppers' card statements": "le nom inscrit sur les relevés de carte des clients",
  "details about the press's owners": "des renseignements sur les propriétaires de la maison d'édition",
  "your home address": "votre adresse personnelle",
  "your name": "votre nom",
  "your email address": "votre adresse courriel",
  "your phone number": "votre numéro de téléphone",
  "your role at the press": "votre rôle dans la maison d'édition",
  "a few more details": "quelques renseignements de plus",
});
const needFr = (words) => NEEDS_FR[words] ?? words;

/** Where the press finds payments in its shop's admin (the admin's own labels, with the French beside them). */
const PAYMENTS_PLACE = "Ouvrez l'administration de votre boutique, puis Réglages (Settings) et Paiements (Payments)";

export const PRESS_TEMPLATES_FR = {
  /** French twin of "owner-welcome". */
  "owner-welcome": ({ links = {} }, { settings, pressName }) => {
    const buttons = [];
    if (links.shopAdmin) buttons.push(["Ouvrir l'administration de votre boutique", links.shopAdmin]);
    if (links.stockroom) buttons.push(["Ouvrir votre réserve", links.stockroom]);
    if (!buttons.length) throw new Error("the welcome email has no links");
    return layout({
      subject: `${pressName} est prête sur ${settings.platformName}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Tout est en place pour ${pressName}. C'est à vous de jouer!`,
        "Connectez-vous avec cette adresse courriel. Votre liste de démarrage vous guidera pour la suite.",
      ],
      buttons,
      footer: signOff(settings),
    });
  },

  /** French twin of "app-added". */
  "app-added": ({ links = {} }, { settings, pressName }) => {
    const buttons = [];
    if (links.shopAdmin) buttons.push(["Ouvrir l'administration de votre boutique", links.shopAdmin]);
    if (links.stockroom) buttons.push(["Ouvrir votre réserve", links.stockroom]);
    if (!buttons.length) throw new Error("the new-app email has no links");
    const ready = links.shopAdmin && links.stockroom
      ? "Votre site Web et votre réserve sont prêts"
      : links.stockroom ? "Votre réserve est prête" : "Votre site Web est prêt";
    return layout({
      subject: `${ready} sur ${settings.platformName}`,
      greeting: "Bonjour,",
      paragraphs: [
        `${ready} pour ${pressName}. Connectez-vous avec cette adresse courriel, comme d'habitude.`,
        "Votre liste de démarrage montre ce qu'il reste à faire.",
      ],
      buttons,
      footer: signOff(settings),
    });
  },

  /** French twin of "sign-in-link". */
  "sign-in-link": ({ link }, { settings }) => layout({
    subject: `Votre lien pour vous connecter à ${settings.platformName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Utilisez le bouton ci-dessous pour vous connecter à ${settings.platformName}. Le lien fonctionne une seule fois et expire après un court moment.`,
      "Si vous ne l'avez pas demandé, vous pouvez ignorer ce courriel.",
    ],
    buttons: [["Se connecter", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "sign-in-code". */
  "sign-in-code": ({ code }, { settings }) => {
    if (!/^\d{6}$/.test(String(code ?? ""))) throw new Error("A sign-in code is six numbers");
    return layout({
      subject: `${code} est votre code ${settings.platformName}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Votre code pour vous connecter à ${settings.platformName} est ${code}. Entrez-le sur la page d'où vous venez. Il fonctionne une seule fois, pendant 10 minutes.`,
        "Si vous ne l'avez pas demandé, vous pouvez ignorer ce courriel. Personne ne peut se connecter sans le code.",
      ],
      footer: signOff(settings),
    });
  },

  /** French twin of "shop-starting". */
  "shop-starting": ({ pressName, link }, { settings }) => layout({
    subject: `La création de votre boutique a commencé sur ${settings.platformName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Merci d'avoir patienté. Nous avons commencé à créer ${pressName || "votre boutique"}, et votre essai gratuit commence aujourd'hui. Aucune carte n'est nécessaire.`,
      "Cela prend quelques minutes. Nous vous enverrons par courriel le lien pour y entrer dès que tout sera prêt.",
    ],
    buttons: [["Voir où ça en est", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "setup-ending". */
  "setup-ending": ({ pressName, daysLeft, date, link }, { settings }) => layout({
    subject: `Votre configuration ${settings.platformName} est gardée jusqu'au ${frenchDay(date)}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Vous avez commencé à configurer ${pressName || "votre boutique"} sur ${settings.platformName}, mais nous ne vous avons pas vu depuis un moment. Nous gardons une configuration 60 jours après votre dernière visite : ce que vous avez fait est donc gardé encore ${daysLeft} jours, jusqu'au ${frenchDay(date)}.`,
      "Connectez-vous d'ici là et tout sera comme vous l'avez laissé, et les 60 jours recommencent. Après cette date, nous effaçons vos réponses et le fichier de produits que vous avez ajouté. Vous pourrez toujours recommencer.",
    ],
    buttons: [["Continuer la configuration", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "waitlist-invite" (a commercial message: it keeps the STOP line). */
  "waitlist-invite": ({ link }, { settings }) => layout({
    subject: `Vous pouvez maintenant créer votre boutique ${settings.platformName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Merci de votre inscription à la liste d'attente de ${settings.platformName}. Votre tour est arrivé : vous pouvez créer votre boutique dès maintenant.`,
      `Inscrivez-vous avec cette adresse courriel. Les ${settings.trialDays ?? 14} premiers jours sont gratuits et aucune carte n'est nécessaire.`,
      `Vous recevez ce courriel parce que vous avez demandé à ${settings.platformName} de vous prévenir quand votre tour arriverait. Répondez STOP et nous vous retirerons de la liste immédiatement.`,
    ],
    buttons: [["Créer votre boutique", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "platform-fee-changing". */
  /** French twin of "terms-changed": the French lines come in `changesFr`. */
  "terms-changed": ({ changes = [], changesFr, appliesOn, link, billing }, { settings, pressName }) => layout({
    subject: `Les conditions de ${settings.platformName} changent le ${frenchDay(appliesOn)}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Nous avons mis à jour les conditions de ${settings.platformName}. Le nouveau texte s'applique à ${pressName} à partir du ${frenchDay(appliesOn)}. Ce qui change :`,
      ...(Array.isArray(changesFr) && changesFr.length ? changesFr : changes).map((line) => `• ${line}`),
      `Si vous continuez d'utiliser ${settings.platformName} après le ${frenchDay(appliesOn)}, vous acceptez les nouvelles conditions. Sinon, vous pouvez annuler d'ici là depuis votre page de facturation, sans rien payer de plus.`,
    ],
    buttons: [["Lire les conditions", safeLink(link)], ["Votre forfait et la facturation", safeLink(billing)]],
    footer: signOff(settings),
  }),

  "platform-fee-changing": ({ fromPercent, toPercent, startsOn, refunded, link }, { settings, pressName }) => layout({
    subject: `Un changement aux frais de ${pressName} sur chaque commande`,
    greeting: "Bonjour,",
    paragraphs: [
      `À partir du ${frenchDay(startsOn)}, les frais de ${settings.platformName} sur chaque commande que reçoit ${pressName} seront de ${percentFr(toPercent)} % (ils sont de ${percentFr(fromPercent)} % en ce moment).`,
      refunded ? "Quand vous remboursez une commande, les frais sont remboursés avec elle." : "Quand vous remboursez une commande, les frais ne sont pas remboursés.",
      "Rien ne change avant cette date. Répondez à ce courriel si vous avez une question.",
    ],
    buttons: [["Voir votre forfait", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "invite". */
  "invite": ({ pressName, invitedBy, roleWords, link, days }, { settings }) => layout({
    subject: `Invitation à rejoindre ${pressName} sur ${settings.platformName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `${invitedBy} vous invite à rejoindre l'équipe de ${pressName}, à titre de ${ROLES_FR[roleWords] ?? roleWords}.`,
      `Acceptez avec le bouton ci-dessous et connectez-vous avec cette adresse courriel. L'invitation est valide pendant ${days} jours.`,
      "Si vous ne vous y attendiez pas, vous pouvez ignorer ce courriel.",
    ],
    buttons: [["Accepter l'invitation", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "support-received". The person's own words come back as they wrote them. */
  "support-received": ({ ticketId, subject, body }, { settings }) => layout({
    subject: `Nous avons bien reçu votre demande : ${subject}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Merci d'avoir écrit au soutien de ${settings.platformName}. Une personne lit chaque demande, et vous recevrez la réponse par courriel.`,
      `Votre demande (numéro ${ticketId}) :`,
      body,
    ],
    footer: signOff(settings),
  }),

  /** French twin of "support-reply". "Re:" stays as it is, so mail programs keep the answer with the request. */
  "support-reply": ({ ticketId, subject, body }, { settings }) => layout({
    subject: `Re: ${subject}`,
    greeting: "Bonjour,",
    paragraphs: [body, `Ceci répond à votre demande numéro ${ticketId}. Ajoutez-y des précisions à partir de la page de votre compte si vous avez besoin de plus d'aide.`],
    footer: signOff(settings),
  }),

  /** French twin of "trial-ending". */
  "trial-ending": ({ planName, price, date, link, hasCard }, { settings, pressName }) => {
    const day = frenchDay(date);
    return layout({
      subject: hasCard ? `Votre essai ${settings.platformName} se termine le ${day}` : `Ajoutez une carte pour garder ${pressName} ouverte après le ${day}`,
      greeting: "Bonjour,",
      paragraphs: hasCard
        ? [
          `Votre essai gratuit pour ${pressName} se termine le ${day}. Ensuite, votre carte sera débitée de ${frenchMoney(price)} par mois pour le forfait ${planNameFr(planName)}, plus ce que coûte le fonctionnement de votre boutique.`,
          "Vous pouvez changer de forfait ou annuler en tout temps d'ici là.",
        ]
        : [
          `Votre essai gratuit pour ${pressName} se termine le ${day}.`,
          `Pour la garder ouverte, ajoutez une carte. Le forfait ${planNameFr(planName)} coûte ${frenchMoney(price)} par mois plus ce que coûte le fonctionnement de votre boutique, et vous pouvez annuler en tout temps.`,
          "Sans carte d'ici là, votre boutique sera mise en pause. Tout est conservé pendant 60 jours, et l'ajout d'une carte la rouvre.",
        ],
      buttons: [[hasCard ? "Gérer votre forfait" : "Ajouter une carte", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "card-needed". */
  "card-needed": ({ link }, { settings, pressName }) => layout({
    subject: `${pressName} est en pause jusqu'à ce que vous ajoutiez une carte`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre essai gratuit pour ${pressName} est terminé, la boutique est donc en pause pour l'instant. Tout est conservé pendant 60 jours.`,
      "Ajoutez une carte et elle rouvrira tout de suite.",
    ],
    buttons: [["Ajouter une carte", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "newsletter-paused". */
  "newsletter-paused": ({ problems = [], days }, { settings, pressName }) => layout({
    subject: `L'infolettre de ${pressName} est en pause pour l'instant`,
    greeting: "Bonjour,",
    paragraphs: [
      `Nous avons mis en pause l'infolettre de ${pressName}. Au cours des ${days} derniers jours, ${problems.map(newsletterProblemFr).join(" et ")}.`,
      "Quand cela arrive, les fournisseurs de courriel se mettent à envoyer le courrier de tout le monde dans les indésirables, alors nous l'arrêtons tôt. Vos reçus, vos courriels de commande et vos avis d'expédition continuent de partir normalement.",
      "Pour recommencer, envoyez-la seulement aux personnes qui ont demandé à la recevoir, et retirez les adresses qui ont été refusées. Répondez ensuite à ce courriel et nous la réactiverons.",
    ],
    footer: signOff(settings),
  }),

  /** French twin of "domain-live". */
  "domain-live": ({ domain, link }, { settings, pressName }) => layout({
    subject: `${pressName} s'ouvre maintenant à l'adresse ${domain}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre boutique s'ouvre maintenant à l'adresse ${domain}, avec le cadenas de sécurité.`,
      "L'adresse fournie avec votre boutique continue aussi de fonctionner. Pour que les courriels, les liens et Google utilisent la nouvelle, faites-en votre adresse principale dans les réglages de votre adresse Web.",
    ],
    buttons: [["Ouvrir les réglages de votre adresse Web", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "free-address-live". */
  "free-address-live": ({ domain, link }, { settings, pressName }) => layout({
    subject: `${pressName} s'ouvre maintenant à l'adresse ${domain}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre boutique s'ouvre maintenant à l'adresse ${domain}, avec le cadenas de sécurité. C'est l'adresse à partager : mettez-la sur vos pages sociales, vos cartes et vos courriels.`,
      "Elle est gratuite et reste la vôtre tant que votre boutique est ouverte. Vous pouvez changer son nom, ou apporter votre propre domaine, dans les réglages de votre adresse Web.",
    ],
    buttons: [["Ouvrir les réglages de votre adresse Web", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "quiet-shop". */
  "quiet-shop": ({ pressName, link, helpLink }, { settings, wFr = sameFr }) => layout({
    subject: `Comment ça va pour ${pressName}?`,
    greeting: "Bonjour,",
    paragraphs: [
      `C'est calme chez ${pressName} ces temps-ci, alors nous voulions prendre de vos nouvelles. Les boutiques ralentissent souvent entre deux saisons, et c'est normal.`,
      wFr("Quelques idées qui ramènent souvent les clients : ajoutez un nouveau titre ou une nouvelle photo, parlez-en dans votre infolettre, ou affichez un petit code de réduction sur votre page d'accueil pendant une semaine."),
      `Si quelque chose dans ${settings.platformName} vous bloque, répondez à ce courriel pour nous dire quoi. Les pages d'aide sont toujours là aussi : ${helpLink}`,
    ],
    buttons: [["Ouvrir l'administration de votre boutique", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "domain-expiring". */
  "domain-expiring": ({ domain, daysLeft, date, seller, own }, { settings }) => layout({
    subject: `${domain} expire dans ${daysLeft} jour${daysLeft === 1 ? "" : "s"}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre adresse Web ${domain} est payée jusqu'au ${frenchDay(date)}. Si elle n'est pas renouvelée d'ici là, votre boutique ne s'ouvrira plus à ${domain}, et tout ce qui utilise cette adresse s'arrêtera aussi.`,
      `Pour la garder, renouvelez-la là où vous l'avez achetée${seller ? ` (${seller})` : ""}. La plupart des vendeurs peuvent la renouveler pour vous chaque année : cherchez le renouvellement automatique dans votre compte chez eux.`,
      `Si vous l'avez déjà renouvelée, vous n'avez rien à faire. Votre boutique continue aussi de fonctionner à ${own}.`,
    ],
    footer: signOff(settings),
  }),

  /** French twin of "domain-not-pointing". */
  "domain-not-pointing": ({ domain, own, link }, { settings }) => layout({
    subject: `${domain} n'ouvre plus votre boutique`,
    greeting: "Bonjour,",
    paragraphs: [
      `${domain} ne mène plus à votre boutique. Cela veut souvent dire que les réglages ont changé là où vous avez acheté ${domain}, ou que l'adresse n'a pas été renouvelée.`,
      `Votre boutique fonctionne toujours à ${own}, et vos commandes sont en sécurité.`,
      `Les réglages de votre adresse Web montrent les lignes à remettre là où vous avez acheté ${domain}. Une fois qu'elles y sont, votre boutique s'ouvre de nouveau à ${domain} d'elle-même.`,
    ],
    buttons: [["Ouvrir les réglages de votre adresse Web", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "own-email-paused". */
  "own-email-paused": ({ domain }, { settings, pressName }) => layout({
    subject: `Les courriels de ${pressName} partent de ${settings.platformName} pour l'instant`,
    greeting: "Bonjour,",
    paragraphs: [
      `Les courriels de votre boutique partaient de orders@${domain}, mais cette adresse ne peut plus envoyer de courriels. Quelque chose a changé chez l'entreprise où vous avez acheté ${domain}.`,
      `Pour que rien ne se perde, vos reçus et vos courriels de commande partent maintenant de l'adresse de ${settings.platformName}, au nom de ${pressName}, et les réponses vous parviennent toujours.`,
      `Quand l'adresse fonctionnera de nouveau, vos courriels repartiront d'eux-mêmes de orders@${domain}. Si vous avez transféré ${domain} à une autre entreprise, répondez à ce courriel et nous vous aiderons.`,
    ],
    footer: signOff(settings),
  }),

  /** French twin of "payment-failed". */
  "payment-failed": ({ price, nextTry, link, note }, { settings, pressName }) => layout({
    subject: `Nous n'avons pas pu prélever le paiement de ce mois-ci pour ${pressName}`,
    greeting: "Bonjour,",
    paragraphs: [
      // The owner's own line from the control room's reminder, first, so it reads as a person and not the robot.
      ...(note ? [String(note).slice(0, 300)] : []),
      `Votre carte a été refusée pour le paiement de ${frenchMoney(price)} de ce mois-ci pour ${pressName}. Votre boutique reste ouverte pendant que nous réglons la situation.`,
      nextTry
        ? `Nous essaierons de nouveau la carte le ${frenchDay(nextTry)}. Pour éviter un autre refus, mettez votre carte à jour dès maintenant.`
        : "Veuillez mettre votre carte à jour pour que votre boutique reste ouverte.",
    ],
    buttons: [["Mettre votre carte à jour", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "payment-needs-confirming". */
  "payment-needs-confirming": ({ price, link, note }, { settings, pressName }) => layout({
    subject: `Votre banque vous demande de confirmer le paiement de ${pressName}`,
    greeting: "Bonjour,",
    paragraphs: [
      // The owner's own line from the control room's reminder, first, so it reads as a person and not the robot.
      ...(note ? [String(note).slice(0, 300)] : []),
      `Votre banque vous demande de confirmer le paiement de ${frenchMoney(price)} de ce mois-ci pour ${pressName} avant qu'il soit fait. C'est une étape de sécurité normale chez certaines banques.`,
      "Utilisez le bouton ci-dessous pour le confirmer auprès de votre banque. Votre boutique reste ouverte en attendant.",
    ],
    buttons: [["Confirmer le paiement", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "payment-received". */
  "payment-received": ({ price, link, bill }, { settings, pressName }) => layout({
    subject: `Merci, le paiement de ${pressName} est passé`,
    greeting: "Bonjour,",
    paragraphs: [`Votre paiement de ${frenchMoney(price)} pour ${pressName} est passé : tout est revenu à la normale. Vos factures sont sur votre page de facturation quand vous en avez besoin.`],
    buttons: [...(bill ? [["Voir cette facture", safeLink(bill)]] : []), ["Voir vos factures", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "bill-paid". */
  "bill-paid": ({ price, number, paidOn, from, to, tax, bill, link, planName }, { settings, pressName }) => {
    if (!price) throw new Error("a receipt needs the amount paid");
    return layout({
      subject: `Votre reçu ${settings.platformName} pour ${pressName}${number ? ` (${number})` : ""}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Merci : nous avons bien reçu votre paiement de ${frenchMoney(price)} pour ${pressName}${planName ? `, forfait ${planNameFr(planName)}` : ""}${paidOn ? `, le ${frenchDay(paidOn)}` : ""}.`,
        ...(from && to ? [`Il couvre la période du ${frenchDay(from)} au ${frenchDay(to)}.`] : []),
        ...(tax ? [`Il comprend ${frenchMoney(tax)} de taxes de vente.`] : []),
        `${number ? `La facture ${number} est conservée` : "Cette facture est conservée"} sur votre page de facturation, avec toutes les précédentes, quand vous en avez besoin pour votre comptabilité.`,
      ],
      buttons: [...(bill ? [["Voir cette facture", safeLink(bill)]] : []), ["Voir vos factures", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "card-changed". */
  "card-changed": ({ card, link }, { settings, pressName }) => layout({
    subject: `La carte qui paie ${pressName} a changé`,
    greeting: "Bonjour,",
    paragraphs: [
      `${card ? `La carte ${cardFr(card)} paie` : "Une nouvelle carte paie"} désormais le forfait ${settings.platformName} de ${pressName}.`,
      "Si c'est vous qui avez fait ce changement, il n'y a rien à faire.",
      "Sinon, connectez-vous et vérifiez votre page de facturation tout de suite, puis répondez à ce courriel pour que nous vous aidions sans attendre.",
    ],
    buttons: [["Voir votre facturation", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "shop-reopened". */
  "shop-reopened": ({ card, price, planName, link }, { settings, pressName }) => layout({
    subject: `${pressName} est de nouveau ouverte`,
    greeting: "Bonjour,",
    paragraphs: [
      `Merci d'avoir ajouté ${card ? `la carte ${cardFr(card)}` : "une carte"}. ${pressName} est de nouveau ouverte, et les clients peuvent commander comme d'habitude.`,
      "Votre forfait reprend aujourd'hui, facturé chaque mois comme avant, et vous pouvez le changer ou l'annuler à tout moment.",
    ],
    buttons: [["Voir votre forfait", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "cancel-undone". */
  "cancel-undone": ({ price, planName, link }, { settings, pressName }) => layout({
    subject: `${pressName} reste ouverte`,
    greeting: "Bonjour,",
    paragraphs: [
      `Vous avez gardé votre forfait ${settings.platformName} : ${pressName} ne fermera pas. Nous sommes heureux que vous restiez.`,
      "Votre forfait continue exactement comme avant, et vous n'avez rien à reconfigurer.",
    ],
    buttons: [["Voir votre forfait", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "subscription-cancelled". */
  "subscription-cancelled": ({ date, link }, { settings, pressName }) => {
    const day = frenchDay(date);
    return layout({
      subject: `${pressName} fermera le ${day}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Vous avez annulé votre forfait ${settings.platformName} pour ${pressName}. La boutique reste ouverte jusqu'au ${day}, et plus rien ne vous sera facturé.`,
        "Vous avez changé d'avis? Vous pouvez garder votre forfait en un clic d'ici là.",
      ],
      buttons: [["Garder mon forfait", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "subscription-ended". */
  "subscription-ended": ({ link }, { settings, pressName }) => layout({
    subject: `${pressName} est fermée`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre forfait ${settings.platformName} pour ${pressName} est terminé, la boutique est donc fermée. Pendant 90 jours, connectez-vous, ouvrez les réglages (Settings), puis le forfait, et appuyez sur Télécharger votre boutique (Download your shop) pour tout obtenir dans un seul zip; ensuite, tout est supprimé, et nous vous écrivons 30 jours et 7 jours avant.`,
      "Vous pouvez reprendre un forfait d'ici là et continuer là où vous étiez.",
    ],
    buttons: [["Reprendre un forfait", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "payments-past-due". `needs` are the payments service's words (requirements.js), turned French. */
  "payments-past-due": ({ provider = "Stripe", needs = [], link }, { settings, pressName }) => {
    if (!Array.isArray(needs) || !needs.length) throw new Error("the past-due email names nothing that is needed");
    return layout({
      subject: `${provider} a mis en pause les paiements de ${pressName}`,
      greeting: "Bonjour,",
      paragraphs: [
        `${provider} a encore besoin de ces renseignements pour ${pressName} : ${listed(needs.map(needFr))}. La date limite est passée, alors les paiements par carte ou les versements sont en pause jusqu'à ce qu'il les reçoive.`,
        `Ouvrez l'administration de votre boutique et, sous Paiements (Payments), appuyez sur Continuer avec ${provider} (Continue with ${provider}). Cela prend quelques minutes.`,
      ],
      buttons: [["Ouvrir les paiements", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "plan-changed". `closing` ("the stockroom") is turned French; `apps` is used when it is given. */
  "plan-changed": ({ planName, price, link, prorated = true, closing, apps, date, now, everything, adds }, { settings, pressName }) => {
    if (everything) {
      return layout({
        subject: `${pressName} a maintenant le site web et la réserve`,
        greeting: "Bonjour,",
        paragraphs: [
          `Chaque boutique ${settings.platformName} comprend maintenant le site web et la réserve, pour les mêmes ${frenchMoney(price)} par mois, plus ce que coûte le fonctionnement de la boutique.`,
          Array.isArray(adds) && adds.length ? `Nous préparons votre ${adds.includes("shop") ? "site web" : "réserve"}. ${adds.includes("shop") ? "Il apparaît" : "Elle apparaît"} dans votre administration d'ici une heure, sans rien à faire de votre part.` : "",
        ].filter(Boolean),
        buttons: [["Ouvrir l'administration", safeLink(link)]],
        footer: signOff(settings),
      });
    }
    const known = Array.isArray(apps) ? ["shop", "stockroom"].filter((a) => apps.includes(a)) : [];
    const what = known.length ? listed(known.map((a) => ({ shop: "la boutique", stockroom: "la réserve" })[a])) : CLOSING_FR[closing] ?? closing;
    const many = known.length > 1 || / et | and /.test(what ?? "");
    const day = frenchDay(date);
    return layout({
      subject: `${pressName} est maintenant au forfait ${planNameFr(planName)}`,
      greeting: "Bonjour,",
      paragraphs: [
        `${pressName} est maintenant au forfait ${planNameFr(planName)}, à ${frenchMoney(price)} par mois, plus ce que coûte le fonctionnement de la boutique.${prorated ? " Votre prochaine facture est ajustée selon la partie du mois passée sur chaque forfait." : ""}`,
        closing
          ? (now
            ? `Votre forfait ne comprend plus ${what} : ${many ? "elles sont donc fermées" : "elle est donc fermée"} dès maintenant.`
            : `Votre forfait ne comprend plus ${what}. ${many ? "Elles restent ouvertes" : "Elle reste ouverte"} jusqu'au ${day}, la fin du mois déjà payé, puis ${many ? "ferment" : "ferme"}.`)
          : "",
        closing ? `Vous pourrez tout télécharger pendant 90 jours après la fermeture. Changez de forfait de nouveau d'ici là pour ${many ? "les" : "la"} garder.` : "",
      ].filter(Boolean),
      buttons: [["Voir votre forfait", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "card-expiring". */
  "card-expiring": ({ card, date, month, link }, { settings, pressName }) => layout({
    subject: `Votre carte pour ${pressName} expire bientôt`,
    greeting: "Bonjour,",
    paragraphs: [
      `La carte avec laquelle vous payez ${pressName}${card ? ` (${cardFr(card)})` : ""} expire ${month ? `à la fin de ${frenchDay(month)}` : `le ${frenchDay(date)}`}.`,
      "Ajoutez votre nouvelle carte d'ici là pour que votre boutique reste ouverte sans interruption.",
    ],
    buttons: [["Mettre votre carte à jour", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "bill-heads-up". */
  "bill-heads-up": ({ month, projected, limit, link }, { settings, pressName }) => layout({
    subject: `La facture de ${pressName} pour ${frenchDay(month)} pourrait dépasser ${frenchMoney(limit)}`,
    greeting: "Bonjour,",
    paragraphs: [
      `À ce rythme, la facture de ${pressName} pour ${frenchDay(month)} sera d'environ ${frenchMoney(projected)} : les frais de la plateforme et ce que coûte le fonctionnement de la boutique. Vous nous avez demandé de vous prévenir si elle pouvait dépasser ${frenchMoney(limit)}.`,
      "Un mois achalandé (une vente, une mention, beaucoup de visites) en est la cause habituelle. Vous pouvez voir le mois en cours, ou changer ce montant, sous Facturation.",
    ],
    buttons: [["Voir votre facture", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "new-device". */
  "new-device": ({ browser, at }, { settings }) => layout({
    subject: `Nouvelle connexion à votre compte ${settings.platformName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre compte ${settings.platformName} vient d'être utilisé sur un appareil où il ne l'avait jamais été : ${browserFr(browser)}, le ${frenchMoment(at)} (UTC).`,
      "Si c'était vous, vous n'avez rien à faire.",
      "Sinon, déconnectez-vous partout en changeant votre mot de passe Google ou celui de l'adresse courriel avec laquelle vous vous connectez, puis répondez à ce courriel pour que nous puissions vous aider.",
    ],
    buttons: [["Ouvrir votre compte", safeLink(`${settings.platformUrl}/accounts/`)]],
    footer: signOff(settings),
  }),

  /** French twin of "account-deleted". */
  "account-deleted": ({ shops = [] }, { settings }) => layout({
    subject: `Votre compte ${settings.platformName} est supprimé`,
    greeting: "Bonjour,",
    paragraphs: [
      `Votre compte ${settings.platformName} et votre connexion sont supprimés, comme vous l'avez demandé.`,
      shops.length ? `Vous ne faites plus partie de l'équipe de ${shops.join(", ")}.` : "",
      "Les factures et les dossiers de facturation sont gardés six ans, comme l'exige la loi fiscale, et vos anciens messages au soutien restent comme trace. Rien d'autre à votre sujet n'est gardé.",
      "Si ce n'était pas vous, répondez à ce courriel tout de suite.",
    ].filter(Boolean),
    footer: signOff(settings),
  }),

  /** French twin of "payments-moved". */
  "payments-moved": ({ to, ready }, { settings, pressName, wFr = sameFr }) => {
    const words = {
      own: {
        subject: `${pressName} accepte maintenant les cartes avec votre propre compte Stripe`,
        paragraphs: [
          `Les paiements par carte par ${settings.platformName} sont arrêtés pour l'instant. Pour que vous puissiez continuer à vendre, nous avons branché la caisse de ${pressName} sur votre propre compte Stripe.`,
          ready
            ? "Votre propre compte Stripe est déjà connecté : vos clients peuvent payer par carte dès maintenant."
            : `${PAYMENTS_PLACE}, et connectez votre propre compte Stripe. D'ici là, vos clients ne peuvent pas payer par carte.`,
        ],
      },
      square: {
        subject: `${pressName} accepte maintenant les cartes avec Square`,
        paragraphs: [
          `Les paiements par carte par Stripe sont arrêtés pour l'instant. Pour que vous puissiez continuer à vendre, nous avons branché la caisse de ${pressName} sur Square.`,
          ready
            ? "Votre compte Square est connecté : vos clients peuvent payer par carte dès maintenant."
            : `${PAYMENTS_PLACE}, et appuyez sur Connecter Square (Connect Square). D'ici là, vos clients ne peuvent pas payer par carte.`,
        ],
      },
      platform: {
        subject: `Les paiements par carte de ${pressName} sont revenus à la normale`,
        paragraphs: [`Les paiements par carte par ${settings.platformName} fonctionnent de nouveau : nous avons donc remis la caisse de ${pressName} comme avant. Vous n'avez rien à faire.`],
      },
    }[to];
    if (!words) throw new Error("the payments email needs where the payments went");
    return layout({
      subject: words.subject,
      greeting: "Bonjour,",
      paragraphs: [...words.paragraphs, wFr("Vos livres, vos commandes et les versements déjà faits ne sont pas touchés. Nous vous écrirons de nouveau si quoi que ce soit change.")],
      footer: signOff(settings),
    });
  },

  /** French twin of "recovery-asked". */
  "recovery-asked": ({ newEmail }, { settings }) => layout({
    subject: `Quelqu'un a demandé de transférer votre compte ${settings.platformName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `Une personne connectée avec l'adresse ${newEmail} nous a demandé de lui transférer le compte ${settings.platformName} qui utilise cette adresse courriel, en disant avoir perdu l'accès à celle-ci.`,
      "Une personne de notre équipe vérifie chaque demande avant que quoi que ce soit soit transféré, et rien n'est transféré pendant au moins trois jours après cette vérification.",
      "Si ce n'était pas vous, connectez-vous à la page de votre compte et choisissez Arrêter cette demande (Stop this request).",
    ],
    buttons: [["Ouvrir votre compte", safeLink(`${settings.platformUrl}/accounts/`)]],
    footer: signOff(settings),
  }),

  /** French twin of "recovery-received". Never says whether the old address has an account. */
  "recovery-received": ({ oldEmail }, { settings }) => layout({
    subject: "Nous avons bien reçu votre demande de transfert de compte",
    greeting: "Bonjour,",
    paragraphs: [
      `Nous allons examiner votre demande de transfert du compte qui utilisait ${oldEmail}. Une personne vérifie chaque demande : cela peut prendre quelques jours, et nous pourrions vous écrire pour vous poser une question.`,
      "Pour votre sécurité, nous prévenons aussi l'ancienne adresse.",
    ],
    footer: signOff(settings),
  }),

  /** French twin of "recovery-stopped". */
  "recovery-stopped": ({ requestId, by }, { settings }) => layout({
    subject: `La demande de transfert de compte ${requestId} a été arrêtée`,
    greeting: "Bonjour,",
    paragraphs: [`La demande de transfert d'un compte ${settings.platformName} (${requestId}) a été arrêtée par ${STOPPED_BY_FR[by] ?? by}. Rien n'a été transféré.`],
    footer: signOff(settings),
  }),

  /** French twin of "recovery-approved". */
  "recovery-approved": ({ oldEmail, newEmail, holdUntil }, { settings }) => layout({
    subject: "Le transfert de votre compte est approuvé et en attente",
    greeting: "Bonjour,",
    paragraphs: [
      `Nous avons approuvé le transfert du compte ${settings.platformName} qui utilise ${oldEmail} vers ${newEmail}.`,
      `Il sera transféré après le ${frenchMoment(holdUntil)} (UTC). D'ici là, la personne propriétaire de ${oldEmail} peut l'arrêter à partir de la page de son compte.`,
    ],
    buttons: [["Ouvrir votre compte", safeLink(`${settings.platformUrl}/accounts/`)]],
    footer: signOff(settings),
  }),

  /** French twin of "recovery-denied". `reason` is the team's own words. */
  "recovery-denied": ({ oldEmail, reason }, { settings }) => layout({
    subject: "Nous n'avons pas pu transférer votre compte",
    greeting: "Bonjour,",
    paragraphs: [`Nous n'avons pas pu transférer le compte qui utilise ${oldEmail}.`, reason, "Répondez à ce courriel si vous pouvez nous en dire plus."],
    footer: signOff(settings),
  }),

  /** French twin of "recovery-applied". */
  "recovery-applied": ({ oldEmail, newEmail }, { settings }) => layout({
    subject: `Votre compte ${settings.platformName} a été transféré`,
    greeting: "Bonjour,",
    paragraphs: [
      `Le compte ${settings.platformName} qui utilisait ${oldEmail} se connecte maintenant avec ${newEmail}.`,
      "Si vous ne vous y attendiez pas, répondez à ce courriel immédiatement.",
    ],
    footer: signOff(settings),
  }),

  /** French twin of "trial-tip". The tip's own subject, paragraphs and button come through as they are. */
  "trial-tip": ({ subject, paragraphs = [], action, link, offLink }, { settings, pressName }) => {
    if (!subject || !paragraphs.length || !action) throw new Error("the setup tip has no words");
    return layout({
      subject: `${pressName} : ${subject}`,
      greeting: "Bonjour,",
      paragraphs: [...paragraphs, `Vous ne voulez plus ces conseils de démarrage? Désactivez-les ici : ${safeLink(offLink)}. Les courriels sur votre forfait et vos paiements continueront d'arriver.`],
      buttons: [[action, safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "shop-checkup". Each line's words and button come through as they are. */
  "shop-checkup": ({ lines = [], offLink }, { settings, pressName }) => {
    if (!lines.length) throw new Error("the check-up has no lines");
    const fixes = lines.filter((l) => l.state === "fix");
    return layout({
      subject: fixes.length
        ? `${pressName} : ${fixes.length === 1 ? "une chose" : `${fixes.length} choses`} à régler dans votre boutique`
        : `${pressName} : votre boutique est en bonne forme`,
      greeting: "Bonjour,",
      paragraphs: [
        `Voici le bilan mensuel de ${pressName}. ${fixes.length ? "Chaque chose qui demande votre attention a son bouton." : "Rien ne demande votre attention ce mois-ci."}`,
        ...lines.map((l) => `${l.state === "ok" ? "Bien : " : "À faire : "}${l.words}`),
        `Vous ne voulez pas recevoir ce courriel chaque mois? Désactivez-le ici : ${safeLink(offLink)}. Les courriels sur votre forfait et vos paiements continueront d'arriver.`,
      ],
      buttons: fixes.filter((l) => l.fix).map((l) => [l.fix.label, safeLink(l.fix.link)]),
      footer: signOff(settings),
    });
  },

  /** French twin of "support-access-request". */
  "support-access-request": ({ by, reason, until, link }, { settings, pressName }) => layout({
    subject: `Le soutien de ${settings.platformName} demande à faire des changements dans ${pressName}`,
    greeting: "Bonjour,",
    paragraphs: [
      `${by}, du soutien de ${settings.platformName}, aimerait ouvrir l'administration de ${pressName} pendant 30 minutes, avec la possibilité d'y faire des changements.`,
      `Pourquoi : ${reason}`,
      `Rien ne change sans votre accord. Approuvez ou refusez sur la page de votre compte${until ? ` d'ici le ${frenchDay(until)}` : ""}; après, la demande expire. Chaque visite est inscrite dans le journal de votre boutique.`,
    ],
    buttons: [["Approuver ou refuser", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** French twin of "press-message". The message's own words come through as they are. */
  "press-message": ({ words, endsOn, link }, { settings, pressName }) => {
    if (typeof words !== "string" || !words.trim()) throw new Error("the message has no words");
    return layout({
      subject: `Un message de ${settings.platformName} pour ${pressName}`,
      greeting: "Bonjour,",
      paragraphs: [
        ...words.trim().split(/\n{2,}/),
        link
          ? `Vous verrez aussi ce message en haut de l'administration de votre boutique${endsOn ? ` jusqu'au ${frenchDay(endsOn)}` : ""}.`
          : "Nous vous l'envoyons par courriel pour que vous ne le manquiez pas.",
      ],
      buttons: link ? [["Ouvrir l'administration de votre boutique", safeLink(link)]] : [],
      footer: signOff(settings),
    });
  },

  /** French twin of "chitchats-waiting". The app's own reason is turned French; Chit Chats's come through as they are. */
  "chitchats-waiting": ({ late = [], lateCount = late.length, problems = [], problemCount = problems.length, refused = null, days, link }, { settings }) => {
    if (!lateCount && !problemCount && !refused) throw new Error("nothing is waiting");
    const orders = (n) => `${n} commande${n === 1 ? "" : "s"}`;
    const more = (shown, n) => (n > shown ? ` et ${n - shown} autre${n - shown === 1 ? "" : "s"}` : "");
    return layout({
      subject: [refused ? "Chit Chats ne reçoit plus vos commandes" : null, lateCount ? `${orders(lateCount)} toujours en attente d'envoi` : null, problemCount ? `${orders(problemCount)} refusée${problemCount === 1 ? "" : "s"} par Chit Chats` : null].filter(Boolean).join(", "),
      greeting: "Bonjour,",
      paragraphs: [
        refused ? `Chit Chats n'accepte plus les informations de votre compte (${(CHITCHATS_WORDS_FR[refused] ?? refused).replace(/\.$/, "")}). Tant que vous ne les entrez pas de nouveau dans Settings › Apps › Chit Chats, les nouvelles commandes payées n'arrivent pas dans Chit Chats.` : null,
        lateCount ? `${lateCount === 1 ? "Une commande payée attend" : `${lateCount} commandes payées attendent`} depuis ${days} jours sans numéro de suivi : ${late.join(", ")}${more(late.length, lateCount)}. ${lateCount === 1 ? "Elle est" : "Elles sont"} dans votre compte Chit Chats, prête${lateCount === 1 ? "" : "s"} pour une étiquette. Dès qu'un colis part, sa commande est marquée envoyée et le client reçoit le suivi.` : null,
        ...problems.map((p) => `Chit Chats n'a pas pu prendre la commande ${p.order}${p.words ? ` : ${CHITCHATS_WORDS_FR[p.words] ?? p.words}` : "."}`),
        problemCount > problems.length ? `Chit Chats en a aussi refusé ${problemCount - problems.length} autre${problemCount - problems.length === 1 ? "" : "s"}.` : null,
        problemCount ? `Préparez ${problemCount === 1 ? "ce colis" : "ces colis"} vous-même dans Chit Chats, ou ${problemCount === 1 ? "envoyez-le" : "envoyez-les"} autrement.` : null,
      ].filter(Boolean),
      buttons: link ? [[refused && !lateCount && !problemCount ? "Ouvrir Settings › Apps" : "Voir vos commandes", safeLink(link)]] : [],
      footer: `${signOff(settings)} Pour ne plus recevoir ces courriels, ouvrez Chit Chats dans Settings › Apps, dans l'administration de votre boutique.`,
    });
  },

  /** French twin of "payout-schedule-changed". */
  "payout-schedule-changed": ({ before, after, link }, { settings }) => {
    const days = { monday: "lundi", tuesday: "mardi", wednesday: "mercredi", thursday: "jeudi", friday: "vendredi", saturday: "samedi", sunday: "dimanche" };
    const when = (s) => {
      if (!s || typeof s !== "object") return null;
      if (s.interval === "manual") return "seulement quand un versement est lancé à la main";
      if (s.interval === "daily") return `chaque jour${s.delayDays ? `, environ ${s.delayDays} jour${s.delayDays === 1 ? "" : "s"} après chaque vente` : ""}`;
      if (s.interval === "weekly" && days[s.weeklyAnchor]) return `chaque ${days[s.weeklyAnchor]}`;
      if (s.interval === "monthly" && s.monthlyAnchor) return `le ${s.monthlyAnchor === 1 ? "1er" : s.monthlyAnchor} de chaque mois`;
      return null;
    };
    const now = when(after);
    if (!now) throw new Error("the new payout timing has no words");
    const was = when(before);
    return layout({
      subject: "Stripe a changé le moment où il vous paie",
      greeting: "Bonjour,",
      paragraphs: [
        `Stripe verse maintenant vos ventes par carte à votre banque ${now}${was ? `, au lieu de ${was}` : ""}.`,
        "Rien d'autre ne change : vos ventes et vos remboursements fonctionnent comme avant.",
      ],
      buttons: link ? [["Ouvrir Paiements", safeLink(link)]] : [],
      footer: signOff(settings),
    });
  },

  /** French twin of "payments-switched". */
  "payments-switched": ({ from, to, link }, { settings }) => {
    const name = (p) => ({ stripe: "Stripe", square: "Square" })[p];
    if (!name(from) || !name(to)) throw new Error("the switch names no card provider");
    return layout({
      subject: `Vos paiements par carte passent maintenant par ${name(to)}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Votre changement est terminé. Les nouvelles ventes par carte vont maintenant dans votre compte ${name(to)}, et ${name(to)} vous les verse.`,
        `Les remboursements des commandes passées avant aujourd'hui passent toujours par ${name(from)} : gardez ce compte ouvert.`,
      ],
      buttons: link ? [["Ouvrir Paiements", safeLink(link)]] : [],
      footer: signOff(settings),
    });
  },

  /** French twin of "data-export-ready". */
  "data-export-ready": ({ link, until, asked, reason }, { settings, pressName, wFr = sameFr }) => layout({
    subject: `Les données de ${pressName} sont prêtes à télécharger`,
    greeting: "Bonjour,",
    paragraphs: [
      asked === "owner"
        ? `Voici la copie des données de ${pressName} que vous avez demandée.`
        : `${settings.platformName} a fait une copie des données de ${pressName} pour vous${reason ? ` : ${reason}` : "."}`,
      wFr("Elle contient vos livres, commandes, clients, codes de réduction, avis, pages, réglages, inscriptions à l'infolettre et données de la réserve, dans une feuille de calcul pour chacun, avec une courte note qui explique ce qu'elles contiennent."),
      `Le lien fonctionne jusqu'au ${frenchDay(until)}. Ensuite, demandez une nouvelle copie à partir de la page de votre compte.`,
      "Gardez le fichier en lieu sûr : il contient le nom et l'adresse de vos clients.",
    ],
    buttons: [["Télécharger vos données", safeLink(link)]],
    footer: signOff(settings),
  }),
};
