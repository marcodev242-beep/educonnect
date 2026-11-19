import React, { useState } from 'react'
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { PaymentPolling } from './PaymentPolling'
import { apiUrl } from '../../lib/api'

export interface PaymentFlowModalProps {
  isOpen: boolean
  onClose: () => void
  documentIds: string[]
  phone: string
  operator: string
}

/**
 * Exemple de flux complet de paiement :
 * 1. L'utilisateur initie le paiement (POST /api/payments/initiate)
 * 2. Le backend crée des transactions PENDING et appelle YabisoPay
 * 3. On affiche le composant PaymentPolling qui vérifie toutes les 3 secondes
 * 4. Des que YabisoPay répond, on met à jour la BDD et on ferme la modal
 */
export const PaymentFlowModal: React.FC<PaymentFlowModalProps> = ({ isOpen, onClose, documentIds, phone, operator }) => {
  const [step, setStep] = useState<'form' | 'polling' | 'complete'>('form')
  const [transactionIds, setTransactionIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleInitiatePayment = async () => {
    setLoading(true)
    setErrorMsg(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/api/payments/initiate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone,
          operator,
          documentIds,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erreur lors de l\'initiation du paiement')
      }

      const data = await response.json()
      console.log('Paiement initié:', data)

      setTransactionIds(data.transactionIds || [])
      setStep('polling') // Passer au polling
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = () => {
    setStep('complete')
    setTimeout(() => {
      onClose() // Fermer après 2 secondes
    }, 2000)
  }

  const handlePaymentFailed = (message?: string) => {
    setErrorMsg(message || 'Le paiement a échoué. Veuillez réessayer.')
    setStep('form')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">
          {step === 'form' && 'Initier le paiement'}
          {step === 'polling' && 'Vérification du paiement'}
          {step === 'complete' && 'Paiement réussi'}
        </h2>

        <div className="space-y-4">
          {step === 'form' && (
            <>
              <div className="space-y-2 text-sm">
                <p className="text-gray-600">
                  <strong>Documents:</strong> {documentIds.length}
                </p>
                <p className="text-gray-600">
                  <strong>Téléphone:</strong> {phone}
                </p>
                <p className="text-gray-600">
                  <strong>Opérateur:</strong> {operator.toUpperCase()}
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{errorMsg}</div>
              )}

              <button
                onClick={handleInitiatePayment}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 rounded transition"
              >
                {loading ? 'Initiation en cours...' : 'Confirmer et payer'}
              </button>
            </>
          )}

          {step === 'polling' && (
            <>
              {transactionIds.map((txId) => (
                <PaymentPolling
                  key={txId}
                  transactionId={txId}
                  onSuccess={handlePaymentSuccess}
                  onFailed={handlePaymentFailed}
                  pollingIntervalMs={3000} // Vérifier toutes les 3 secondes
                />
              ))}
            </>
          )}

          {step === 'complete' && (
            <div className="p-4 bg-green-100 text-green-700 rounded text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
              <p className="font-medium">Paiement confirmé !</p>
              <p className="text-sm mt-2">Les documents sont maintenant disponibles.</p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-gray-600 hover:text-gray-800 py-2 text-sm"
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

