/**
 * The French words of every customer email (code plan 25.9), for Settings › Notifications.
 * A copy of functions/emailFrench.js DEFAULT_NOTIFICATIONS_FR (the server sends those; parity in emailFrenchDefaults.test.ts).
 * An order placed with the shop in French gets these, or the owner's own French words saved as `<template>.fr`. Emails with no
 * order behind them (welcome, contact reply, abandoned cart) use them when the shop itself is written in French.
 */

import type { TemplateFields } from "./emailTemplateChecks";

export type FrenchFields = Omit<TemplateFields, "enabled">;

export const FRENCH_DEFAULTS: Record<string, FrenchFields> = {
  "order_confirmation": {
    "subject": "Commande confirmée : {{order_id}}",
    "body": "Bonjour {{customer_name}},\n\nMerci pour votre achat! Nous avons bien reçu votre commande et nous la préparons pour l'envoi. Nous vous écrirons de nouveau dès qu'elle sera expédiée.",
    "buttonText": "Voir votre commande",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "shipping_confirmation": {
    "subject": "Votre commande est en route!",
    "body": "Bonjour {{customer_name}},\n\nBonne nouvelle! Votre commande {{order_id}} a été expédiée avec {{tracking_carrier}} et elle est en route.\n\nNuméro de suivi : {{tracking_number}}\n\nUtilisez le bouton ci-dessous pour suivre votre colis sur le site du transporteur.",
    "buttonText": "Suivre votre colis",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "order_cancelled": {
    "subject": "Commande annulée : {{order_id}}",
    "body": "Bonjour {{customer_name}},\n\nVotre commande a été annulée et vous ne serez pas débité. Si vous avez des questions, écrivez-nous.",
    "buttonText": "",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "order_pending_payment": {
    "subject": "Commande reçue, paiement requis : {{order_id}}",
    "body": "Bonjour {{customer_name}},\n\nMerci pour votre commande! Elle vous est réservée, mais elle n'est pas encore payée. Veuillez payer {{total_price}} par {{payment_method}} en suivant les instructions ci-dessous. Nous vous confirmerons par courriel dès que votre paiement sera arrivé, puis nous préparerons votre commande.",
    "buttonText": "Voir votre commande",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "order_refunded": {
    "subject": "Commande remboursée : {{order_id}}",
    "body": "Bonjour {{customer_name}},\n\nNous avons remboursé {{total_price}} pour votre commande. Le montant devrait revenir sur votre moyen de paiement d'origine d'ici 5 à 10 jours ouvrables.",
    "buttonText": "",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "gift_card": {
    "subject": "Vous avez reçu une carte-cadeau de {{amount}}",
    "body": "Bonjour {{recipient_name}},\n\n{{sender_name}} vous a envoyé une carte-cadeau de {{amount}} pour {{shop_name}}.\n\n{{message}}\n\nVotre code de carte-cadeau : {{code}}\n\nEntrez-le dans la case Carte-cadeau au moment de payer. {{expires}}",
    "buttonText": "Magasiner",
    "signoff": "Au plaisir,\nL'équipe {{shop_name}}"
  },
  "payment_link": {
    "subject": "Votre commande {{order_id}} chez {{shop_name}} est prête à payer",
    "body": "Bonjour {{customer_name}},\n\nVotre commande chez {{shop_name}} est prête. Le total est de {{total_price}}, et vous pouvez payer par carte jusqu'au {{expires_on}}.\n\n{{note}}",
    "buttonText": "Payer maintenant",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "payment_link_reminder": {
    "subject": "Rappel : votre commande {{order_id}} est prête à payer",
    "body": "Bonjour {{customer_name}},\n\nUn petit rappel : votre commande chez {{shop_name}} attend son paiement. Le total est de {{total_price}}, et le lien de paiement reste ouvert jusqu'au {{expires_on}}.",
    "buttonText": "Payer maintenant",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "part_shipped": {
    "subject": "Une partie de votre commande {{order_id}} est en route",
    "body": "Bonjour {{customer_name}},\n\nUne partie de votre commande {{order_id}} a été expédiée avec {{tracking_carrier}} :\n\n{{items_list}}\n\nNuméro de suivi : {{tracking_number}}\n\nLe reste de votre commande suivra dans un autre colis, et nous vous écrirons lors de son envoi.",
    "buttonText": "Suivre ce colis",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "carrier_delivery_update": {
    "subject": "Votre commande {{order_id}} est {{status}}",
    "body": "Bonjour {{customer_name}},\n\nVotre commande {{order_id}} est {{status}}.\n\nTransporteur : {{tracking_carrier}}\nNuméro de suivi : {{tracking_number}}",
    "buttonText": "Suivre votre colis",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "request_received": {
    "subject": "Nous avons reçu votre demande pour la commande {{order_id}}",
    "body": "Bonjour {{customer_name}},\n\nMerci de nous avoir prévenus. Nous avons bien reçu votre demande pour {{request}} la commande {{order_id}}, et nous vous répondrons bientôt par courriel avec les prochaines étapes.",
    "buttonText": "Voir votre commande",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "payment_failed": {
    "subject": "Le paiement de votre commande {{order_id}} n'est pas passé",
    "body": "Bonjour {{customer_name}},\n\nVotre banque nous a indiqué que le paiement de {{total_price}} pour la commande {{order_id}} n'est pas passé : la commande n'est donc pas encore payée.\n\nSi vous la voulez toujours, répondez à ce courriel et nous vous aiderons à payer autrement.",
    "buttonText": "Voir votre commande",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "delivery_update": {
    "subject": "Suivi de livraison : votre commande est {{status}}",
    "body": "Bonjour {{customer_name}},\n\nLe suivi de votre colis a changé : {{status}}.\n\nTransporteur : {{tracking_carrier}}\nSuivi : {{tracking_number}}",
    "buttonText": "Suivre le colis",
    "signoff": "Bonne journée,\nL'équipe {{shop_name}}"
  },
  "order_picked_up": {
    "subject": "Merci d'être passé chercher votre commande {{order_id}}",
    "body": "Bonjour {{customer_name}},\n\nVous avez récupéré votre commande {{order_id}}. Merci de magasiner chez {{shop_name}}! Gardez ce courriel comme preuve d'achat.",
    "buttonText": "Voir votre commande",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "customer_welcome": {
    "subject": "Bienvenue chez {{shop_name}}!",
    "body": "Bonjour {{customer_name}},\n\nMerci d'avoir créé un compte chez {{shop_name}}! Vous pouvez maintenant vous connecter pour voir vos commandes, enregistrer vos adresses de livraison et télécharger vos achats numériques.",
    "buttonText": "Aller à votre compte",
    "signoff": "Chaleureusement,\nL'équipe {{shop_name}}"
  },
  "contact_reply": {
    "subject": "Nous avons bien reçu votre message",
    "body": "Bonjour {{customer_name}},\n\nMerci d'avoir écrit à {{shop_name}}! Nous avons bien reçu votre message et nous vous répondrons dès que possible.",
    "buttonText": "",
    "signoff": "Chaleureusement,\nL'équipe {{shop_name}}"
  },
  "abandoned_cart": {
    "subject": "Vous avez oublié quelque chose?",
    "body": "Bonjour {{customer_name}},\n\nVous avez laissé des articles dans votre panier. Nous les avons gardés pour vous : vous pouvez terminer votre achat quand vous voulez!",
    "buttonText": "Reprendre mon achat",
    "signoff": "Merci,\nL'équipe {{shop_name}}"
  },
  "review_request": {
    "subject": "Comment trouvez-vous votre livre?",
    "body": "Bonjour {{customer_name}},\n\nNous espérons que les livres de votre commande {{order_id}} sont bien arrivés. Si vous avez un moment, nous aimerions savoir ce que vous en pensez : un court avis aide d'autres lecteurs à trouver leur prochain livre. Chaque titre ci-dessous ouvre sa page, où se trouve le formulaire d'avis.",
    "buttonText": "Écrire un avis",
    "signoff": "Merci de nous lire,\nL'équipe {{shop_name}}"
  }
};
