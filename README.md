# SiteScope Pro

Une seule interface publique. L'utilisateur colle une URL, obtient un score gratuit
+ 6 catégories, et débloque le résumé exécutif + le plan d'action pour **$2** payés
en crypto via **NOWPayments**. La clé Gemini reste côté serveur (fonction Netlify),
jamais exposée au navigateur.

## Structure

```
public/index.html                    → l'appli (nav, hero, audit, sections marketing, footer)
netlify/functions/audit.js           → appelle Gemini avec la clé cachée côté serveur
netlify/functions/create-payment.js  → crée une facture NOWPayments de $2
netlify/functions/ipn-webhook.js     → reçoit et vérifie les callbacks NOWPayments
netlify/functions/check-payment.js   → l'appli interroge ce endpoint pour savoir si c'est payé
netlify.toml, package.json
```

## Déploiement sur Netlify

1. Pousse ce dossier sur un repo Git (GitHub/GitLab) et connecte-le à Netlify,
   ou utilise `netlify deploy` depuis la Netlify CLI.
2. Dans **Site settings → Environment variables**, ajoute :

   | Variable | Valeur |
   |---|---|
   | `GEMINI_API_KEY` | ta clé Gemini (aistudio.google.com/app/apikey) |
   | `NOWPAYMENTS_API_KEY` | ta clé API NOWPayments (Dashboard → API Settings) |
   | `NOWPAYMENTS_IPN_SECRET` | le secret IPN généré dans Dashboard → Payment Settings |
   | `SITE_URL` | l'URL finale de ton site, ex. `https://sitescope-pro.netlify.app` (sans slash final) |

3. Dans ton compte NOWPayments, active les **Instant Payment Notifications** et
   assure-toi que l'URL de callback pointe vers
   `https://TON-SITE/.netlify/functions/ipn-webhook` (la fonction l'envoie déjà
   automatiquement à chaque création de facture — cette étape sert surtout à
   vérifier que rien n'est bloqué côté NOWPayments).
4. Netlify Blobs ne demande aucune configuration supplémentaire : il est
   disponible automatiquement dans les fonctions dès que le site est déployé.

## Authentification légère par email

Le lien `order_id` ne suffit plus à lui seul à voir un rapport débloqué :

1. **Avant de payer**, l'utilisateur doit indiquer son email dans la modale de
   paiement. Il est stocké (normalisé en minuscules) avec la commande dans
   Netlify Blobs, et indexé dans un store séparé `email-index` (email → liste
   d'`orderId`).
2. **Dès que le paiement est confirmé** (webhook IPN), `ipn-webhook.js` envoie
   automatiquement un email — via l'API [Resend](https://resend.com) — contenant
   le lien permanent `?order_id=...`. Le lien n'est plus affiché nulle part
   ailleurs que dans cet email et, pour la session en cours, dans la bannière
   sur la page.
3. **Pour rouvrir un rapport** via ce lien (nouveau navigateur, autre appareil,
   plus tard), la page affiche d'abord un écran "🔒 Confirm your email to view
   this report". `get-report.js` compare l'email saisi à celui enregistré pour
   la commande et ne renvoie le contenu complet qu'en cas de correspondance
   (sinon : erreur générique `email_mismatch`, sans révéler si la commande
   existe ou à qui elle appartient).
4. **Email oublié** : un lien "Forgot which email you used?" ouvre un petit
   formulaire qui appelle `/.netlify/functions/resend-link`. Cette fonction
   cherche dans l'index toutes les commandes payées associées à l'email fourni
   et renvoie l'email d'accès si une correspondance existe — la réponse
   affichée à l'utilisateur est **toujours la même** ("If that email has an
   unlocked report, we've sent the access link to it."), qu'une correspondance
   existe ou non, pour ne jamais révéler quels emails ont acheté un rapport.

### Nouvelle variable d'environnement à configurer

| Variable | Valeur |
|---|---|
| `RESEND_API_KEY` | ta clé API Resend (dashboard Resend → API Keys) |
| `RESEND_FROM` *(optionnel)* | adresse d'expédition, ex. `SiteScope Pro <rapports@tondomaine.com>` — nécessite un domaine vérifié dans Resend ; sinon ça retombe sur `onboarding@resend.dev` (fonctionne seulement en test) |

Si `RESEND_API_KEY` n'est pas configurée, l'envoi d'email est simplement
ignoré (le paiement et le déblocage continuent de fonctionner normalement dans
la session en cours) — mais la fonctionnalité "rouvrir plus tard / sur un
autre appareil" ne sera plus utilisable puisque personne ne recevra jamais le
lien par email.

## Comment ça marche

1. L'utilisateur colle une URL → le front appelle `/.netlify/functions/audit`,
   qui interroge Gemini avec la clé serveur et renvoie le JSON de l'audit.
2. Le score global et les 6 catégories s'affichent en clair ; le résumé et les
   recommandations sont flous avec un bandeau "Unlock Full Report — $2".
3. Clic sur "Unlock" → l'utilisateur saisit son email → `create-payment.js`
   crée une facture NOWPayments de $2 **et enregistre le JSON complet de
   l'audit + l'email** dans Netlify Blobs, sous la clé `orderId`. La page de
   paiement NOWPayments s'ouvre dans un nouvel onglet.
4. Le front interroge `check-payment.js` toutes les 3 secondes. Dès que
   NOWPayments confirme le paiement (via son callback IPN, vérifié par
   signature HMAC-SHA512 dans `ipn-webhook.js`), le statut de la commande
   passe à `paid`, l'email d'accès part automatiquement, et le flou disparaît
   dans la session en cours — sans que l'utilisateur ait besoin de rafraîchir.

## Persistance du rapport (lien permanent + email requis)

Dès qu'un rapport est débloqué, l'appli affiche un encart "🔖 This link is
yours to keep" avec une URL du type :

```
https://ton-site.netlify.app/?order_id=<uuid-de-la-commande>
```

Cette URL est aussi automatiquement poussée dans la barre d'adresse
(`history.replaceState`) et envoyée par email. Quand quelqu'un l'ouvre — même
après avoir fermé le navigateur, même sur un autre appareil — la page demande
d'abord de confirmer l'email utilisé à l'achat avant d'appeler
`/.netlify/functions/get-report`, qui ne renvoie le contenu que si l'email
correspond à celui stocké pour cette commande.

Note vie privée : le contenu de l'audit (URL du site analysé, score, résumé,
recommandations) et l'email associé restent conservés côté serveur tant que la
commande existe dans Netlify Blobs — il n'y a pas d'expiration automatique
configurée. Je peux ajouter une fonction planifiée de purge après X jours si
besoin.

## Limites à connaître

- **Prix minimum par crypto** : NOWPayments applique un minimum de paiement
  différent selon la cryptomonnaie choisie par le client. $2 fonctionne pour la
  plupart des stablecoins/cryptos courants, mais vérifie les minimums sur ton
  dashboard NOWPayments si tu actives beaucoup de devises.
- **Authentification par email, pas par mot de passe/compte** : c'est un
  contrôle simple ("connaître l'email utilisé à l'achat"), pas un vrai système
  de comptes avec mot de passe. C'est volontairement léger pour un MVP ; pour
  quelque chose de plus robuste (sessions, changement d'email, etc.), il
  faudrait un vrai fournisseur d'authentification (ex. Auth0, Clerk, Supabase
  Auth).
- **Domaine d'envoi Resend** : sans domaine vérifié dans Resend, les emails
  partent depuis `onboarding@resend.dev`, ce qui fonctionne pour tester mais
  n'est pas recommandé en production (délivrabilité, image de marque). Vérifie
  ton propre domaine dans Resend et configure `RESEND_FROM` en conséquence.
- **Sandbox NOWPayments** : avant de passer en production, teste avec l'API
  sandbox de NOWPayments (`https://api-sandbox.nowpayments.io`) pour valider
  tout le flux sans dépenser de vraie crypto.
