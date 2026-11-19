# Guide: Polling Frontend pour Paiements YabisoPay

## Architecture

```
Frontend (React 5173)          Backend (Express 5000)         YabisoPay API
   |                                |                             |
   +--initiate payment --------->   +--create transactions    
   |                                |
   |                            +----> ws_request_payment
   |<------transactionIds------+
   |
   +--polling loop----------->   (GET /api/payments/:reference/status)
   |                                |
  |                            +----> YabisoPay_Get_Statut_Transaction
   |<------{status: PENDING}---+
   |
   | (répète toutes les 3 sec)
   |
   +--polling loop----------->   (GET /api/payments/:reference/status)
   |                                |
   |                            +----> YabisoPay_Get_Statut_Transaction
   |                                | (Statut: "2" ou "3")
   |<------{status: SUCCESS}---+
   |                                |
   |                            [UPDATE BDD + Créditer prof]
   |
```

## 1. Frontend - Initier le paiement

```jsx
import { PaymentFlowModal } from '@/app/components/PaymentFlowModal'

export function MyComponent() {
  const [paymentOpen, setPaymentOpen] = useState(false)

  return (
    <>
      <button onClick={() => setPaymentOpen(true)}>
        Acheter les documents
      </button>

      <PaymentFlowModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        documentIds={['doc-uuid-1', 'doc-uuid-2']}
        phone="243812345678"
        operator="airtel"
      />
    </>
  )
}
```

## 2. Backend - Endpoints

### POST /api/payments/initiate
```bash
curl -X POST http://www.eschoolapi.com/api/payments/initiate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "243812345678",
    "operator": "airtel",
    "documentIds": ["uuid1", "uuid2"]
  }'
```

**Réponse:**
```json
{
  "status": "PENDING",
  "transactionIds": ["txn-uuid-1", "txn-uuid-2"]
}
```

### GET /api/payments/:reference/status
```bash
curl -X GET http://localhost:5000/api/payments/txn-uuid-1/status \
  -H "Authorization: Bearer TOKEN"
```

**Réponses possibles:**
```json
// En attente
{"status": "PENDING", "message": "Vérification en cours..."}

// Succès
{"status": "SUCCESS", "message": "Paiement confirmé"}

// Échec (statut YabisoPay = "3")
{"status": "FAILED", "message": "Paiement refusé par YabisoPay"}
```

## 3. Flux Complet

### Étape 1: Utilisateur clique sur "Payer"
- Modal `PaymentFlowModal` s'ouvre
- Form affiche: documents, téléphone, opérateur

### Étape 2: Utilisateur clique "Confirmer et payer"
- Frontend envoie: `POST /api/payments/initiate`
- Backend crée transactions PENDING + appelle YabisoPay
- Frontend reçoit `transactionIds`
- Passe à `step='polling'`

### Étape 3: Polling automatique
- Composant `PaymentPolling` s'active pour chaque transaction
- Appel: `GET /api/payments/:reference/status` toutes les **3 secondes**
- Backend vérifie l'état chez YabisoPay

### Étape 4a: YabisoPay répond "Statut: 2" (Succès)
- Backend: `UPDATE transactions SET statut_paiement = 'SUCCESS'`
- Backend: Crédite le prof de 70% du montant
- Frontend reçoit: `{status: "SUCCESS"}`
- Callback `onSuccess()` déclenché
- Modal ferme après 2s

### Étape 4b: YabisoPay répond "Statut: 3" (Échec)
- Backend: `UPDATE transactions SET statut_paiement = 'FAILED'`
- Frontend reçoit: `{status: "FAILED"}`
- Callback `onFailed()` déclenché
- Retour au formulaire

## 4. Avantages du Polling

✅ **Pas d'URL HTTPS publique nécessaire** en dev (pas de ngrok)  
✅ **Pas de webhook** compliqué à configurer  
✅ **Idempotent** - Peut vérifier plusieurs fois sans risque  
✅ **Statut "3" automatiquement reconnu** comme FAILED (plus de boucle !)  
✅ **Frontend reste responsif** (polling côté client, pas côté serveur)

## 5. Configuration

Vérifiez les variables d'environnement:

```bash
ESCHOOL_MERCHANT_ID=YABISO
ESCHOOL_MERCHANT_NAME=YABISO
ESCHOOL_BASE_URL=https://www.eschoolapi.com
ESCHOOL_CALLBACK_URL=https://votre-domaine.com/api/payments/yabiso-callback  # Pour production
```

## 6. Logs de Debug

### Frontend
```javascript
// Dans console navigateur
console.log(`[Payment Polling] txn-123: PENDING`)
console.log(`[Payment Polling] txn-123: SUCCESS`)
```

### Backend
```
[Paiement] Ref Interne: TRX123... | Ref Externe: ABC | Statut: PENDING
[YabisoPay] Vérification TRX123: HTTP 200 | Réponse: {"Statut":"2"}
[Paiement] Ref Interne: TRX123... | Ref Externe: ABC | Statut: SUCCESS
```

## 7. Transition en Production

1. Configurer `ESCHOOL_CALLBACK_URL` avec URL publique HTTPS
2. Garder le polling frontend (meilleur UX)
3. Ajouter le webhook backend comme **backup asynchrone**
4. Webhook met à jour la BDD automatiquement si le polling a échoué

**Résultat:** Robustesse maximale + UX optimale !
