# SiteScope Pro

Interface unique. L'utilisateur colle une URL, obtient un score gratuit + 6
catégories + points forts, et débloque le résumé exécutif, les quick wins et
le plan d'action complet pour **$5** payés en crypto via **NOWPayments**. Une
fois payé, il peut **télécharger un PDF bien structuré** du rapport complet —
une fois téléchargé, le lien devient inactif (les données sont supprimées
côté serveur) et un nouvel audit + paiement est nécessaire pour un nouveau
rapport. Aucun email, aucun compte requis. La clé Gemini reste côté serveur
(fonction Netlify), jamais exposée au navigateur.

## Structure

```
public/index.html                    → l'appli (nav, hero, audit, PDF export, sections marketing, footer)
netlify/functions/audit.js           → appelle Gemini avec la clé cachée côté serveur (données enrichies)
netlify/functions/create-payment.js  → crée une facture NOWPayments de $5
netlify/functions/ipn-webhook.js     → reçoit et vérifie les callbacks NOWPayments
netlify/functions/check-payment.js   → l'appli interroge ce endpoint pour savoir si c'est payé
netlify/functions/get-report.js      → recharge un rapport payé via son orderId (tant qu'il n'a pas été téléchargé)
netlify/functions/consume-report.js  → supprime la commande une fois le PDF téléchargé (usage unique)
netlify/functions/_lib/blob-store.js → wrapper Netlify Blobs avec identifiants manuels en secours
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
   | `NETLIFY_SITE_ID` | l'ID de ton site (Site configuration → General → Site details) |
   | `NETLIFY_BLOBS_TOKEN` | un Personal Access Token Netlify (User settings → Applications → Personal access tokens) |
   | `NOWPAYMENTS_API_BASE` *(optionnel)* | `https://api-sandbox.nowpayments.io/v1` pour tester en sandbox ; à retirer ou laisser vide en production |

   Les deux dernières variables (`NETLIFY_SITE_ID` / `NETLIFY_BLOBS_TOKEN`)
   servent de secours manuel : Netlify Blobs est censé injecter ces
   identifiants automatiquement, mais ce comportement est connu pour être
   parfois défaillant en production (`MissingBlobsEnvironmentError`). Le code
   utilise systématiquement ce secours via `_lib/blob-store.js`.

3. Redéploie après chaque changement de variable
   (**Deploys → Trigger deploy → Clear cache and deploy site**).

## Comment ça marche

1. L'utilisateur colle une URL → le front appelle `/.netlify/functions/audit`,
   qui interroge Gemini avec la clé serveur et renvoie un JSON enrichi :
   score global, **note en lettre**, résumé, **points forts**, **quick wins**,
   6 catégories détaillées, et un plan d'action avec **impact/effort** par
   recommandation.
2. Le score, la note, les catégories et les points forts s'affichent en
   clair ; les quick wins, le résumé exécutif et le plan d'action sont flous
   avec un bandeau "Unlock Full Report — $5".
3. Clic sur "Unlock" → `create-payment.js` crée une facture NOWPayments de $5
   et enregistre le JSON complet de l'audit dans Netlify Blobs sous
   l'`orderId`. La page de paiement NOWPayments s'ouvre dans un nouvel onglet.
4. Le front interroge `check-payment.js` toutes les 3 secondes. Dès que le
   paiement est confirmé (callback IPN vérifié par signature HMAC-SHA512
   dans `ipn-webhook.js`), le flou disparaît automatiquement et un bandeau
   "Download PDF Report" apparaît, avec un lien permanent de secours
   (`?order_id=...`) si l'utilisateur ferme l'onglet avant de télécharger.
5. Clic sur "Download PDF Report" → le PDF est généré **entièrement côté
   navigateur** (bibliothèque jsPDF, aucun serveur impliqué dans la mise en
   page) avec une structure soignée : en-tête, score, résumé, points forts,
   catégories, quick wins, plan d'action paginé. Juste après le
   téléchargement, `consume-report.js` **supprime la commande** de Netlify
   Blobs — le lien `?order_id=...` renvoie alors une erreur "report not
   found" si quelqu'un tente de le rouvrir. Un nouvel audit + paiement est
   nécessaire pour un nouveau rapport.

## Ajuster le prix

Le prix ($5 par défaut) est défini à deux endroits qu'il faut garder
synchronisés :
- `netlify/functions/create-payment.js` → constante `PRICE_USD`
- `public/index.html` → constante JS `REPORT_PRICE` (en haut du `<script>`)

$2 s'est révélé **inférieur au minimum accepté par NOWPayments** pour
plusieurs cryptomonnaies (les minimums dépendent des frais réseau propres à
chaque devise). $5 passe confortablement pour la grande majorité des
cryptos proposées au checkout. Pour connaître le minimum exact d'une devise
donnée, NOWPayments expose l'endpoint `GET /v1/min-amount` ou une page de
statut sur leur site.

## Tester sans dépenser de vraie crypto (sandbox)

1. Crée un compte séparé sur [account-sandbox.nowpayments.io](https://account-sandbox.nowpayments.io)
2. Génère une clé API + IPN secret **sandbox** dans ce dashboard
3. Sur Netlify, remplace temporairement `NOWPAYMENTS_API_KEY` /
   `NOWPAYMENTS_IPN_SECRET` par les valeurs sandbox, et ajoute
   `NOWPAYMENTS_API_BASE=https://api-sandbox.nowpayments.io/v1`
4. Redéploie, teste, puis remets les vraies valeurs de production et retire
   `NOWPAYMENTS_API_BASE` une fois terminé

## Limites à connaître

- **Lien à usage unique, pas de compte** : l'accès au rapport payé se fait
  par lien `order_id` (comme un lien Google Docs), valable jusqu'au premier
  téléchargement du PDF. Il n'y a pas de système de comptes/emails — c'est
  volontairement simple pour un MVP. Si quelqu'un partage son lien avant de
  télécharger, la première personne à cliquer "Download" consomme le rapport.
- **PDF généré côté navigateur** : la mise en page dépend de la bibliothèque
  jsPDF chargée depuis un CDN (cdnjs). Si le CDN est bloqué par l'utilisateur
  (bloqueur de script agressif), le téléchargement échouera — un message
  d'erreur s'affiche dans ce cas.
- **Sandbox NOWPayments** : avant de passer en production, teste avec l'API
  sandbox pour valider tout le flux sans dépenser de vraie crypto.
