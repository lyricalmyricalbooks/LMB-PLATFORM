// French twins of the platform's closing emails, for presses in Quebec (Charter of the French language: French at least
// as available as English). Same kinds and the same `data` as TEMPLATES (templates.js), plus what French needs that the
// English words can't give: `apps` (["shop"], ["stockroom"] or both, for "la boutique" / "la réserve") and `on`, the ISO
// time behind `date`, written here the French way. Every French template falls back to the English data when those are
// missing, so an email never fails for want of them.
//
// Which language an email goes in (`mailLanguage`, used by sendPlatform's `language`):
//   "fr"     the press chose French (sign-up in a French browser);
//   "fr+en"  no choice stored, but the press's billing address is in Quebec: French first, the English below;
//   "en"     everyone else.
// Every press-facing kind has a twin (the closing ones here, the rest in templatesFrPress.js); the platform's own alerts
// to its staff stay in English.
import { layout, safeLink } from "./templates.js";
import { PRESS_TEMPLATES_FR, frenchDay } from "./templatesFrPress.js";

const sameFr = (text) => text;

export { frenchDay };

const signOff = (settings) => `Envoyé par ${settings.platformName}. Répondez à ce courriel si vous avez besoin d'un coup de main.`;

/** The apps in French, with their article ("la boutique et la réserve"). */
export const APP_NAMES_FR = Object.freeze({ shop: "la boutique", stockroom: "la réserve" });

/** What a closed app's download holds (closedApps.js DOWNLOAD_HOLDS, same order), in French. */
const HOLDS_FR = Object.freeze({
  shop: ["vos livres et produits", "les auteurs et artistes", "les commandes", "les clients", "les codes de réduction", "les cartes-cadeaux", "les avis", "vos pages", "les inscriptions à l'infolettre", "les points de vente", "les prix de livraison"],
  stockroom: ["les livres de votre réserve", "le registre des stocks", "l'historique des ventes et des stocks", "les dépenses", "les librairies et les dépôts", "l'argent versé aux artistes", "les paiements aux artistes", "ce qui est dû aux artistes"],
});

const listed = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} et ${words.at(-1)}` : words.join(""));
const capital = (text) => text.replace(/^./, (c) => c.toUpperCase());
const appList = (apps) => (Array.isArray(apps) ? ["shop", "stockroom"].filter((app) => apps.includes(app)) : []);

/** "la boutique et la réserve", or the fallback when the apps aren't known. */
const appsWords = (apps, fallback) => {
  const known = appList(apps);
  return known.length ? listed(known.map((app) => APP_NAMES_FR[app])) : fallback;
};

/** "une feuille de calcul pour chacun de …", like closedApps.js downloadHolds. */
export function downloadHoldsFr(apps) {
  const known = appList(apps);
  const words = known.flatMap((app) => HOLDS_FR[app]);
  if (!words.length) return "";
  return `une feuille de calcul pour chacun de ces éléments : ${listed(words)}${known.includes("shop") ? ", ainsi que les réglages de votre boutique" : ""}`;
}

/** A day in French ("3 novembre 2026"), from the ISO time; else the English words turned French (frenchDay). */
export function dateFr(on, fallback = "") {
  const time = on ? Date.parse(on) : NaN;
  if (!Number.isFinite(time)) return frenchDay(fallback);
  // The first of the month is "1er" in French ("le 1er mars").
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" }).format(new Date(time)).replace(/^1 /, "1er ");
}

const QUEBEC = new Set(["QC", "QUEBEC", "QUÉBEC", "PQ"]);

/** The language a press's platform emails go in: { language?, province? } from its billing row. */
export function mailLanguage({ language, province } = {}) {
  if (language === "fr") return "fr";
  if (language === "en") return "en";
  return QUEBEC.has(String(province ?? "").trim().toUpperCase()) ? "fr+en" : "en";
}

/**
 * A shop's email language from its registry row: once billing has mirrored the plan, its choice and province (so
 * "automatic" chosen later on the Plan page wins over the language picked at sign-up); before that, the language it
 * signed up in. Used by the email service and the control room, so both say what billing says.
 */
export const shopMailLanguage = (shop) => (shop?.billing ? mailLanguage(shop.billing) : mailLanguage({ language: shop?.language ?? null }));

/** French first, then the English, in one email (subjects joined, each half marked with its language). */
export function bilingual(fr, en) {
  return {
    subject: `${fr.subject} / ${en.subject}`,
    text: `${fr.text}\n\n----- English -----\n\n${en.text}`,
    html: `<div lang="fr">${fr.html}</div><hr style="border:0;border-top:1px solid #ccc;margin:24px 0"><div lang="en">${en.html}</div>`,
  };
}

export const TEMPLATES_FR = {
  // Every other email to a press or its people (templatesFrPress.js); only the platform's own alerts stay English.
  ...PRESS_TEMPLATES_FR,

  /** French twin of "shop-closed". */
  "shop-closed": ({ date, on, link }, { settings, pressName, wFr = sameFr }) => {
    const day = dateFr(on, date);
    return layout({
      subject: `${pressName} est fermée. Téléchargez tout d'ici le ${day}`,
      greeting: "Bonjour,",
      paragraphs: [
        `${pressName} est en pause depuis un moment, elle est donc maintenant fermée. Les clients voient une page de fermeture et aucune commande n'arrive.`,
        wFr(`Tout est conservé jusqu'au ${day} : vos livres, commandes, clients et stocks. Connectez-vous, ouvrez les réglages (Settings), puis le forfait, et appuyez sur Télécharger votre boutique (Download your shop) : vous obtenez un seul fichier zip, prêt pour un autre système de boutique.`),
        `Après le ${day}, la boutique et tout son contenu seront supprimés pour de bon. Reprenez un forfait d'ici là et elle rouvrira telle que vous l'avez laissée.`,
      ],
      buttons: [["Voir votre forfait", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "shop-deletion-warning". */
  "shop-deletion-warning": ({ date, on, days, link }, { settings, pressName, wFr = sameFr }) => {
    if (days !== 30 && days !== 7) throw new Error("the deletion warning is sent 30 or 7 days before");
    const day = dateFr(on, date);
    return layout({
      subject: `${pressName} sera supprimée le ${day}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Dans ${days} jours, le ${day}, ${pressName} et tout son contenu seront supprimés : ${wFr("livres")}, commandes, clients et stocks. C'est irréversible.`,
        "Si ce n'est pas déjà fait, connectez-vous, ouvrez les réglages (Settings), puis le forfait, et appuyez sur Télécharger votre boutique (Download your shop).",
        `Pour garder la boutique, reprenez un forfait avant le ${day}.`,
      ],
      buttons: [["Voir votre forfait", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "shop-deleted". */
  "shop-deleted": (_data, { settings, pressName }) => layout({
    subject: `${pressName} a été supprimée`,
    greeting: "Bonjour,",
    paragraphs: [
      `Comme annoncé dans nos courriels précédents, ${pressName} et tout son contenu ont maintenant été supprimés de ${settings.platformName}.`,
      "Merci d'avoir créé votre boutique avec nous. Revenez quand vous voulez.",
    ],
    footer: signOff(settings),
  }),

  /** French twin of "app-closing-soon". */
  "app-closing-soon": ({ apps, closing, date, on, link, signIn = false }, { settings, pressName }) => {
    const what = appsWords(apps, closing || "une application");
    const many = appList(apps).length > 1;
    const day = dateFr(on, date);
    return layout({
      subject: `${capital(what)} de ${pressName} ${many ? "ferment" : "ferme"} le ${day}`,
      greeting: "Bonjour,",
      paragraphs: [
        `En changeant de forfait, vous avez retiré ${what}. ${many ? "Elles ferment" : "Elle ferme"} le ${day}, à la fin du mois déjà payé.`,
        `${signIn ? `Si vous vouliez ${many ? "les" : "la"} garder, un clic sur la page de votre forfait suffit.` : `Si vous vouliez ${many ? "les" : "la"} garder, le bouton ci-dessous s'en charge, sans avoir à vous connecter. Il fonctionne une seule fois, jusqu'au ${day}.`} Sinon, vous n'avez rien à faire : vous pourrez tout télécharger pendant 90 jours après la fermeture.`,
      ],
      buttons: [[signIn ? `${many ? "Les" : "La"} garder ou voir votre forfait` : `${many ? "Les" : "La"} garder`, safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "app-closed". */
  "app-closed": ({ apps, closing, date, on, link }, { settings, pressName }) => {
    const what = appsWords(apps, closing || "cette application");
    const many = appList(apps).length > 1;
    const day = dateFr(on, date);
    const holds = downloadHoldsFr(apps);
    const [elle, la] = many ? ["elles", "les"] : ["elle", "la"];
    return layout({
      subject: `${capital(what)} de ${pressName} ${many ? "sont fermées" : "est fermée"}. Téléchargez tout d'ici le ${day}`,
      greeting: "Bonjour,",
      paragraphs: [
        `Votre forfait ne comprend plus ${what} : ${elle} ${many ? "ont" : "a"} donc fermé aujourd'hui, à la fin du mois payé.`,
        `Tout ce qu'${many ? "elles contenaient" : "elle contenait"} est conservé jusqu'au ${day}. Pour en garder une copie, ouvrez votre compte et choisissez « Download all your data » (Télécharger toutes vos données) : nous vous enverrons par courriel un lien vers chaque fichier${holds ? `, avec ${holds}` : ""}.`,
        `Vous avez changé d'avis? Ajoutez-${la} de nouveau à votre forfait avant le ${day} et ${elle} ${many ? "rouvriront" : "rouvrira"} avec tout ${many ? "leur" : "son"} contenu.`,
      ],
      buttons: [["Télécharger vos données", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "app-download-ending". */
  "app-download-ending": ({ apps, closing, date, on, link }, { settings, pressName }) => {
    const what = appsWords(apps, closing || "l'application fermée");
    const day = dateFr(on, date);
    const holds = downloadHoldsFr(apps);
    return layout({
      subject: `Derniers jours pour télécharger ${what} de ${pressName}`,
      greeting: "Bonjour,",
      paragraphs: [
        `${capital(what)}, retirée de votre forfait, est fermée depuis un moment. Tout son contenu est conservé jusqu'au ${day}, puis supprimé pour de bon.`,
        `Pour en garder une copie, ouvrez votre compte et choisissez « Download all your data » (Télécharger toutes vos données) : nous vous enverrons par courriel un lien vers chaque fichier${holds ? `, avec ${holds}` : ""}. Pour continuer à l'utiliser, ajoutez-la de nouveau à votre forfait d'ici là.`,
      ],
      buttons: [["Télécharger vos données", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** French twin of "app-records-deleted". */
  "app-records-deleted": ({ apps, closing, link }, { settings, pressName }) => {
    const what = appsWords(apps, closing || "l'application retirée");
    return layout({
      subject: `Tout le contenu de ${what} de ${pressName} est maintenant supprimé`,
      greeting: "Bonjour,",
      paragraphs: [
        `Comme nous l'avions écrit, les 90 jours pour télécharger ${what} sont terminés : tout son contenu a donc été supprimé pour de bon.`,
        "Rien d'autre n'a été supprimé. Si vous en avez besoin un jour, vous pourrez l'ajouter de nouveau à votre forfait; elle repartira à vide.",
      ],
      buttons: [["Ouvrir votre compte", safeLink(link)]],
      footer: signOff(settings),
    });
  },
};
