// Customer emails in French (code plan 25.9). A shopper whose browser was in French at checkout (the order's `locale`,
// saved by checkoutPayment.js) gets their order emails in French. The owner edits both versions in Settings ›
// Notifications: the French words are saved beside the English ones, as `<template>.fr` ({ subject, body, buttonText,
// signoff }); an empty French field falls back to the French default here, never to English. The switch (`enabled`)
// is shared, so turning an email off turns off both. Emails with no order behind them (welcome, contact reply,
// abandoned cart) have no order language to go by: they follow the shop's own language (Studio › Text & labels ›
// Shop language), so a shop written in French sends them in French.
"use strict";

/** "fr" when the shop is written in French (settings/website design.language), else "en". Never throws. */
async function shopLanguage(db) {
  const website = await db.collection("settings").doc("website").get().then(d => d.data?.() || {}).catch(() => ({}));
  return website?.design?.language === "fr" ? "fr" : "en";
}

/** "fr" for an order placed in French, else "en". */
function emailLanguage(order) {
  return /^fr\b/i.test(String(order?.locale || "")) ? "fr" : "en";
}

const SIGN = "Merci,\nL'équipe {{shop_name}}";
const SIGN_BEST = "Bonne journée,\nL'équipe {{shop_name}}";

/** The French default words of every customer email. Same placeholders as the English ones. */
const DEFAULT_NOTIFICATIONS_FR = Object.freeze({
  order_confirmation: {
    subject: "Commande confirmée : {{order_id}}",
    body: "Bonjour {{customer_name}},\n\nMerci pour votre achat! Nous avons bien reçu votre commande et nous la préparons pour l'envoi. Nous vous écrirons de nouveau dès qu'elle sera expédiée.",
    buttonText: "Voir votre commande",
    signoff: SIGN,
  },
  shipping_confirmation: {
    subject: "Votre commande est en route!",
    body: "Bonjour {{customer_name}},\n\nBonne nouvelle! Votre commande {{order_id}} a été expédiée avec {{tracking_carrier}} et elle est en route.\n\nNuméro de suivi : {{tracking_number}}\n\nUtilisez le bouton ci-dessous pour suivre votre colis sur le site du transporteur.",
    buttonText: "Suivre votre colis",
    signoff: SIGN_BEST,
  },
  order_cancelled: {
    subject: "Commande annulée : {{order_id}}",
    body: "Bonjour {{customer_name}},\n\nVotre commande a été annulée et vous ne serez pas débité. Si vous avez des questions, écrivez-nous.",
    buttonText: "",
    signoff: SIGN_BEST,
  },
  order_pending_payment: {
    subject: "Commande reçue, paiement requis : {{order_id}}",
    body: "Bonjour {{customer_name}},\n\nMerci pour votre commande! Elle vous est réservée, mais elle n'est pas encore payée. Veuillez payer {{total_price}} par {{payment_method}} en suivant les instructions ci-dessous. Nous vous confirmerons par courriel dès que votre paiement sera arrivé, puis nous préparerons votre commande.",
    buttonText: "Voir votre commande",
    signoff: SIGN,
  },
  order_refunded: {
    subject: "Commande remboursée : {{order_id}}",
    body: "Bonjour {{customer_name}},\n\nNous avons remboursé {{total_price}} pour votre commande. Le montant devrait revenir sur votre moyen de paiement d'origine d'ici 5 à 10 jours ouvrables.",
    buttonText: "",
    signoff: SIGN_BEST,
  },
  gift_card: {
    subject: "Vous avez reçu une carte-cadeau de {{amount}}",
    body: "Bonjour {{recipient_name}},\n\n{{sender_name}} vous a envoyé une carte-cadeau de {{amount}} pour {{shop_name}}.\n\n{{message}}\n\nVotre code de carte-cadeau : {{code}}\n\nEntrez-le dans la case Carte-cadeau au moment de payer. {{expires}}",
    buttonText: "Magasiner",
    signoff: "Au plaisir,\nL'équipe {{shop_name}}",
  },
  payment_link_reminder: {
    subject: "Rappel : votre commande {{order_id}} est prête à payer",
    body: "Bonjour {{customer_name}},\n\nUn petit rappel : votre commande chez {{shop_name}} attend son paiement. Le total est de {{total_price}}, et le lien de paiement reste ouvert jusqu'au {{expires_on}}.",
    buttonText: "Payer maintenant",
    signoff: SIGN,
  },
  part_shipped: {
    subject: "Une partie de votre commande {{order_id}} est en route",
    body: "Bonjour {{customer_name}},\n\nUne partie de votre commande {{order_id}} a été expédiée avec {{tracking_carrier}} :\n\n{{items_list}}\n\nNuméro de suivi : {{tracking_number}}\n\nLe reste de votre commande suivra dans un autre colis, et nous vous écrirons lors de son envoi.",
    buttonText: "Suivre ce colis",
    signoff: SIGN_BEST,
  },
  carrier_delivery_update: {
    subject: "Votre commande {{order_id}} est {{status}}",
    body: "Bonjour {{customer_name}},\n\nVotre commande {{order_id}} est {{status}}.\n\nTransporteur : {{tracking_carrier}}\nNuméro de suivi : {{tracking_number}}",
    buttonText: "Suivre votre colis",
    signoff: SIGN_BEST,
  },
  request_received: {
    subject: "Nous avons reçu votre demande pour la commande {{order_id}}",
    body: "Bonjour {{customer_name}},\n\nMerci de nous avoir prévenus. Nous avons bien reçu votre demande pour {{request}} la commande {{order_id}}, et nous vous répondrons bientôt par courriel avec les prochaines étapes.",
    buttonText: "Voir votre commande",
    signoff: SIGN_BEST,
  },
  payment_failed: {
    subject: "Le paiement de votre commande {{order_id}} n'est pas passé",
    body: "Bonjour {{customer_name}},\n\nVotre banque nous a indiqué que le paiement de {{total_price}} pour la commande {{order_id}} n'est pas passé : la commande n'est donc pas encore payée.\n\nSi vous la voulez toujours, répondez à ce courriel et nous vous aiderons à payer autrement.",
    buttonText: "Voir votre commande",
    signoff: SIGN,
  },
  delivery_update: {
    subject: "Suivi de livraison : votre commande est {{status}}",
    body: "Bonjour {{customer_name}},\n\nLe suivi de votre colis a changé : {{status}}.\n\nTransporteur : {{tracking_carrier}}\nSuivi : {{tracking_number}}",
    buttonText: "Suivre le colis",
    signoff: SIGN_BEST,
  },
  order_picked_up: {
    subject: "Merci d'être passé chercher votre commande {{order_id}}",
    body: "Bonjour {{customer_name}},\n\nVous avez récupéré votre commande {{order_id}}. Merci de magasiner chez {{shop_name}}! Gardez ce courriel comme preuve d'achat.",
    buttonText: "Voir votre commande",
    signoff: SIGN,
  },
  customer_welcome: {
    subject: "Bienvenue chez {{shop_name}}!",
    body: "Bonjour {{customer_name}},\n\nMerci d'avoir créé un compte chez {{shop_name}}! Vous pouvez maintenant vous connecter pour voir vos commandes, enregistrer vos adresses de livraison et télécharger vos achats numériques.",
    buttonText: "Aller à votre compte",
    signoff: "Chaleureusement,\nL'équipe {{shop_name}}",
  },
  contact_reply: {
    subject: "Nous avons bien reçu votre message",
    body: "Bonjour {{customer_name}},\n\nMerci d'avoir écrit à {{shop_name}}! Nous avons bien reçu votre message et nous vous répondrons dès que possible.",
    buttonText: "",
    signoff: "Chaleureusement,\nL'équipe {{shop_name}}",
  },
  abandoned_cart: {
    subject: "Vous avez oublié quelque chose?",
    body: "Bonjour {{customer_name}},\n\nVous avez laissé des articles dans votre panier. Nous les avons gardés pour vous : vous pouvez terminer votre achat quand vous voulez!",
    buttonText: "Reprendre mon achat",
    signoff: SIGN,
  },
  review_request: {
    subject: "Comment trouvez-vous votre livre?",
    body: "Bonjour {{customer_name}},\n\nNous espérons que les livres de votre commande {{order_id}} sont bien arrivés. Si vous avez un moment, nous aimerions savoir ce que vous en pensez : un court avis aide d'autres lecteurs à trouver leur prochain livre. Chaque titre ci-dessous ouvre sa page, où se trouve le formulaire d'avis.",
    buttonText: "Écrire un avis",
    signoff: "Merci de nous lire,\nL'équipe {{shop_name}}",
  },
});

/** Status and request words that fill {{status}} and {{request}}, in French. */
const VALUES_FR = Object.freeze({
  "out for delivery": "en cours de livraison",
  delivered: "livrée",
  "ready to collect": "prête à être récupérée",
  return: "retourner",
  cancel: "annuler",
});

/** The fixed words the server adds around an order email (headings, totals, delivery lines), in French. */
const PHRASES_FR = Object.freeze({
  Subtotal: "Sous-total",
  Shipping: "Livraison",
  Tax: "Taxes",
  Total: "Total",
  Discount: "Rabais",
  "Free gift": "Cadeau",
  "Gift card": "Carte-cadeau",
  "Gift cards": "Cartes-cadeaux",
  Pickup: "Cueillette",
  "Local delivery": "Livraison locale",
  "We'll email you when your order is ready to collect.": "Nous vous écrirons quand votre commande sera prête à être récupérée.",
  "We'll email your tracking number as soon as it ships.": "Nous vous enverrons votre numéro de suivi dès l'expédition.",
  "Expected delivery:": "Livraison prévue :",
  "Digital Library Access": "Votre bibliothèque numérique",
  "Your downloads": "Vos téléchargements",
  "Download File": "Télécharger",
  "Available once the book is released": "Disponible à la sortie du livre",
  "Available once it is released": "Disponible à sa sortie",
  "Available from": "Disponible à partir du",
  "Payment Verified": "Paiement vérifié",
  "Payment Instructions": "Instructions de paiement",
  "Pre-order": "Précommande",
  "Sold by": "Vendu par",
  "Keep this email as your record of the sale.": "Gardez ce courriel comme preuve de la vente.",
  "Returns and cancellations": "Retours et annulations",
  "Terms of sale": "Conditions de vente",
  Privacy: "Confidentialité",
  Includes: "Comprend :",
  For: "Pour",
  "This is a partial refund. The rest of your order is unchanged.": "Il s'agit d'un remboursement partiel. Le reste de votre commande ne change pas.",
  "You asked for your digital items to be available straight away and agreed that this ends your 14-day right to cancel them. Your right to cancel any printed or physical items is not affected.":
    "Vous avez demandé que vos articles numériques soient disponibles tout de suite et accepté que cela mette fin à votre droit de les annuler dans les 14 jours. Votre droit d'annuler les articles imprimés ou physiques n'est pas touché.",
});

/** A function that turns the server's fixed English words into the email's language: `say("Subtotal")`. */
function sayer(language) {
  if (language !== "fr") return (text) => text;
  return (text) => PHRASES_FR[text] ?? text;
}

/**
 * The words to send for `templateId` in `language`: the owner's French (`settings[templateId].fr`), each empty
 * field filled from the French default, or null when this email has no French version (send the English).
 */
function frenchTemplate(templateId, settings) {
  const fallback = DEFAULT_NOTIFICATIONS_FR[templateId];
  if (!fallback) return null;
  const saved = settings?.[templateId]?.fr || {};
  const pick = (field) => (typeof saved[field] === "string" && (saved[field].trim() || field === "buttonText") ? saved[field] : fallback[field]);
  return { subject: pick("subject"), body: pick("body"), buttonText: pick("buttonText"), signoff: pick("signoff") };
}

/** {{status}} and {{request}} in French for a French email; every other value as it was. */
function frenchValues(vars) {
  const out = { ...vars };
  for (const key of ["status", "request"]) if (typeof out[key] === "string" && VALUES_FR[out[key]]) out[key] = VALUES_FR[out[key]];
  return out;
}

module.exports = { DEFAULT_NOTIFICATIONS_FR, PHRASES_FR, VALUES_FR, emailLanguage, shopLanguage, frenchTemplate, frenchValues, sayer };
