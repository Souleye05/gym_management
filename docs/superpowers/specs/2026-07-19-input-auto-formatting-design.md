# Auto-formatage des champs numéro de carte et numéro de téléphone — Design

**Date :** 2026-07-19
**Statut :** Approuvé

## Contexte

Le staff/admin doit pouvoir saisir uniquement les chiffres significatifs dans les champs numéro de carte et numéro de téléphone — sans taper `CARD-` ni l'indicatif pays (`+33`, `+221`). Les valeurs complètes sont reconstruites côté frontend avant l'appel API ; **le backend ne change pas** et continue d'exiger le format complet dans les deux cas :
- Numéro de carte : `^CARD-(\d+)$` (`server/clients/infrastructure/format-card-number.ts` — pas de padding obligatoire côté parsing, seul l'affichage généré serveur est paddé à 5 chiffres).
- Numéro de téléphone : E.164 complet, `/^\+\d{8,15}$/`, validé côté serveur par `server/auth/dto/client-otp.dto.ts` (connexion) et par la même regex dans `components/clients/client-form.tsx` (création/édition client).

Aucune liste d'indicatifs pays n'existe aujourd'hui dans le code (`+221` n'apparaît nulle part actuellement, seul `+33` figure dans les données de test/seed) — ce chantier introduit la première.

## Décisions retenues (validées en session)

- **Sélecteur d'indicatif** : menu déroulant à côté du champ numéro local (pas un indicatif par défaut simplement éditable en texte libre).
- **Indicatifs supportés** : `+221` (Sénégal) et `+33` (France) uniquement — liste courte, pas de pays limitrophes ajoutés pour l'instant.
- **Indicatif par défaut** : `+221`, sur les 3 formulaires téléphone (création/édition client, connexion, séance visiteur).
- **`components/sessions/visitor-session-form.tsx`** gagne la validation E.164 stricte en plus du formatage — actuellement ce formulaire n'a aucune validation de format (juste "non vide"), et l'enregistrement de séance reste mocké côté backend (pas d'appel API réel pour l'instant), mais la cohérence avec les 3 autres formulaires et la préparation du futur branchement CRUD staff l'emportent sur le minimalisme strict de périmètre.
- **`components/sessions/client-search.tsx`** et la barre de recherche de `app/(staff)/clients/page.tsx` sont explicitement **hors scope** — ce sont des champs de recherche libre (nom OU téléphone), pas des champs de saisie stricte d'un numéro complet, et ne doivent pas être touchés.
- **Création de client (staff)** : le numéro de carte n'est jamais saisi à la création — il est généré côté serveur. Seul le flux d'identification pour l'enregistrement de séance (`/seances`, via `ClientIdentification`) est concerné par l'auto-formatage carte.

## Architecture

Deux formatages indépendants, chacun localisé au plus près de son usage :

1. **Numéro de carte** — traité entièrement dans `components/scan/client-identification.tsx` (seul fichier concerné, deux champs y partagent déjà le même state `cardNumberInput`). Pas de nouveau composant : un préfixe visuel inline suffit.
2. **Numéro de téléphone** — un nouveau composant partagé, `<PhoneNumberInput>`, réutilisé par les 3 formulaires téléphone. Composant contrôlé value/onChange : il prend et renvoie toujours la chaîne E.164 complète, comme un `<Input>` classique — aucun changement à la gestion d'état, la validation ou la soumission des formulaires qui l'utilisent, seul le rendu du champ change.

## `<PhoneNumberInput>` — composant

**Fichier :** `components/ui/phone-number-input.tsx` (à côté des autres primitives `components/ui/input.tsx` — ce n'est pas un composant métier "client"/"séance", c'est une primitive de saisie réutilisable au même titre que `Input`).

**API :**
```ts
function PhoneNumberInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string
  value: string            // toujours la chaîne E.164 complète, ex "+221771234567"
  onChange: (value: string) => void  // reçoit la chaîne E.164 complète reconstruite
  placeholder?: string      // placeholder du champ numéro local uniquement (ex "771234567")
}): JSX.Element
```

**Comportement :**
- Rendu : un `<select>` d'indicatif (`+221` / `+33`) collé à gauche d'un `<Input>` texte pour le numéro local, dans un conteneur `flex gap-2` — même schéma visuel que les groupes `Input`+`Button` déjà présents dans l'app (ex. le champ numéro de carte).
- État interne : le composant maintient sa propre paire `(countryCode, localNumber)`, dérivée de `value` à chaque rendu (pas de `useEffect` de synchronisation — dérivation pure à chaque appel, `value` reste la seule source de vérité pour le parent).
- **Reverse-parsing de `value`** : si `value` commence par un indicatif connu (`+221` ou `+33`), on sépare `countryCode` (l'indicatif trouvé) et `localNumber` (le reste de la chaîne). Sinon (chaîne vide à la création, ou un indicatif non listé sur une donnée existante) : `countryCode = DEFAULT_COUNTRY_CODE ('+221')`, `localNumber = ''` — jamais de crash, jamais de perte silencieuse de la valeur d'origine (elle reste dans `value` côté parent tant que l'utilisateur n'a pas retapé quoi que ce soit).
- **Filtrage à la saisie** : le champ numéro local ne garde que les chiffres tapés (`onChange` local filtre `e.target.value` via `.replace(/\D/g, '')` avant de reconstruire). Aucune limite de longueur imposée côté champ — la validation finale (regex `/^\+\d{8,15}$/`) reste entièrement du ressort du formulaire appelant, inchangée.
- **Changement d'indicatif en cours de saisie** : si le staff a déjà tapé un numéro local puis change l'indicatif via le `<select>`, le numéro local est conservé — seul le préfixe change dans la valeur reconstruite envoyée à `onChange`.
- Chaque frappe (numéro local) ou changement de sélection (indicatif) reconstruit `${countryCode}${localNumber}` et appelle `onChange` avec cette chaîne complète — le parent n'a jamais à connaître la séparation interne indicatif/local.

## Numéro de carte — `components/scan/client-identification.tsx`

Deux champs concernés, tous deux dans le flux d'identification client pour l'enregistrement de séance :
- Repli caméra indisponible (~L109-117)
- Onglet dédié "Numéro de carte" (~L123-136)

Les deux partagent déjà `cardNumberInput` (state) et `handleCardNumberSubmit` (handler). Changements :
- `cardNumberInput` ne stocke désormais que les chiffres tapés (plus jamais le préfixe `CARD-`).
- Rendu : un préfixe visuel non-éditable `CARD-` (`<span>` avec bordure, dans un conteneur `flex` groupant visuellement préfixe + `<Input>`), suivi du champ qui filtre à la saisie pour ne garder que les chiffres (même logique de filtrage que `PhoneNumberInput`, `.replace(/\D/g, '')`).
- `handleCardNumberSubmit` reconstruit `CARD-${cardNumberInput}` avant d'appeler `resolveCardNumber`.
- Le bouton "Valider" est désactivé (`disabled`) tant qu'aucun chiffre n'a été saisi (`cardNumberInput.length === 0`) — évite d'envoyer `CARD-` seul, qui échouerait silencieusement côté backend puisque `^CARD-(\d+)$` exige au moins un chiffre après le préfixe.
- Placeholder simplifié à `00001` (le préfixe étant désormais affiché séparément, plus besoin de le répéter dans le placeholder).

## Formulaires téléphone — intégration

Chacun remplace son `<Input type="tel">` actuel par `<PhoneNumberInput>`, sans autre changement à sa logique de state/validation/soumission :

- **`components/clients/client-form.tsx`** : `phone` (déjà une chaîne E.164 complète en mode édition via `initialValues.phone`) devient la `value` de `<PhoneNumberInput>`. La validation existante (`/^\+\d{8,15}$/` sur `values.phone.trim()`, ligne 21) est inchangée.
- **`app/connexion/page.tsx`** : `phone` devient la `value` de `<PhoneNumberInput>`. Aucun changement à `requestClientOtp`.
- **`components/sessions/visitor-session-form.tsx`** : `phoneNumber` devient la `value` de `<PhoneNumberInput>`. **Nouveau** : `handleSubmit` gagne la même validation E.164 (`/^\+\d{8,15}$/`) que `client-form.tsx`, avec un état d'erreur dédié au téléphone (actuellement ce formulaire n'a qu'un message d'erreur générique "Le nom et le téléphone sont obligatoires." — ce message reste pour le cas nom/téléphone vide, un second message distinct s'ajoute pour un téléphone non-vide mais invalide).

## Gestion des erreurs et cas limites

| Cas | Comportement |
|---|---|
| Numéro de carte : aucun chiffre saisi | Bouton "Valider" désactivé, aucune requête envoyée |
| Numéro de carte : chiffres saisis, client non trouvé | Inchangé — message "Carte non reconnue." déjà en place |
| Téléphone : `value` initiale vide (création) | Indicatif `+221` pré-sélectionné, numéro local vide |
| Téléphone : `value` initiale avec un indicatif non listé (donnée existante hors `+221`/`+33`) | Indicatif `+221` pré-sélectionné par défaut, numéro local vide — pas de crash ; si le staff ne retouche rien et soumet, la regex `/^\+\d{8,15}$/` peut échouer si le résultat reconstruit ne correspond pas à la donnée d'origine, ce qui est acceptable : aucune donnée existante connue n'est actuellement hors `+221`/`+33` (voir Contexte), ce cas est une protection défensive, pas un flux attendu |
| Téléphone : changement d'indicatif après saisie du numéro local | Numéro local conservé, seul le préfixe change |
| `visitor-session-form.tsx` : téléphone non-vide mais invalide | Nouveau message d'erreur dédié, soumission bloquée (même pattern que `client-form.tsx`) |

## Hors scope

- `components/sessions/client-search.tsx` et la barre de recherche de `app/(staff)/clients/page.tsx` — champs de recherche libre, non des champs de saisie stricte.
- Validation de longueur du numéro local spécifique par pays (ex. exactement 9 chiffres pour la France) — la regex globale `/^\+\d{8,15}$/` reste la seule validation, pas de table de longueurs par indicatif (YAGNI, le backend ne l'exige pas).
- Ajout d'autres indicatifs pays au-delà de `+221`/`+33`.
- Toute modification du contrat backend (`format-card-number.ts`, `client-otp.dto.ts`, `client.dto.ts`) — inchangés.
- Numéro de carte à la création de client staff — généré côté serveur, jamais saisi.
