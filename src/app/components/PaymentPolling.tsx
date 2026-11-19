import React, { useState, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { apiUrl } from '../../lib/api'

export interface PaymentPollingProps {
  transactionId: string
  onSuccess?: () => void
  onFailed?: (message?: string) => void
  pollingIntervalMs?: number
}

export const PaymentPolling: React.FC<PaymentPollingProps> = ({
  transactionId,
  onSuccess,
  onFailed,
  pollingIntervalMs = 3000,
}) => {
  const [status, setStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | 'ERROR'>('PENDING')
  const [message, setMessage] = useState('Vérification du paiement en cours...')
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkPaymentStatus = async () => {
      try {
        const token = localStorage.getItem('token') // Récupérer le token d'auth
        const response = await fetch(apiUrl(`/api/payments/${transactionId}/status`), {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Paiement introuvable`)
        }

        const data = await response.json()
        const providerStatus = String(data.status)
        const newStatus = providerStatus === '200' || providerStatus === 'SUCCESS'
          ? 'SUCCESS'
          : providerStatus === '3' || providerStatus === 'FAILED'
            ? 'FAILED'
            : providerStatus === 'ERROR' ? 'ERROR' : 'PENDING'

        console.log(`[Payment Polling] ${transactionId}: ${newStatus}`)

        if (newStatus === 'SUCCESS') {
          setStatus('SUCCESS')
          setMessage('Paiement réussi ! 🎉')
          if (intervalRef.current) clearInterval(intervalRef.current)
          if (onSuccess) onSuccess()
        } else if (newStatus === 'FAILED') {
          setStatus('FAILED')
          setMessage(data.message || 'Paiement refusé. Vérifiez votre numéro ou réessayez.')
          if (intervalRef.current) clearInterval(intervalRef.current)
          if (onFailed) onFailed(data.message || 'Paiement refusé. Vérifiez votre numéro ou réessayez.')
        } else {
          setStatus('PENDING')
          const pendingMessage = data.message || 'Paiement en attente de confirmation.'
          setMessage(pendingMessage)
        }
      } catch (err) {
        console.error('[Payment Polling] Erreur:', err)
        setStatus('ERROR')
        setError(err instanceof Error ? err.message : 'Erreur lors de la vérification')
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }

    // Appel initial
    checkPaymentStatus()

    // Mise en place du polling - SAUF si déjà SUCCESS ou FAILED
    if (status === 'PENDING') {
      intervalRef.current = setInterval(checkPaymentStatus, pollingIntervalMs)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [transactionId, status, onSuccess, onFailed, pollingIntervalMs])

  return (
    <div className="w-full max-w-md mx-auto p-4 rounded-lg border">
      {status === 'PENDING' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-blue-600">
            <Clock className="h-5 w-5 animate-spin" />
            <span className="font-medium">En attente de confirmation</span>
          </div>
          <p className="text-sm text-gray-600">{message}</p>
          <div className="text-xs text-gray-500">
            Vérification toutes les {Math.round(pollingIntervalMs / 1000)} secondes...
          </div>
        </div>
      )}

      {status === 'SUCCESS' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Paiement confirmé</span>
          </div>
          <p className="text-sm text-gray-600">{message}</p>
        </div>
      )}

      {status === 'FAILED' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Paiement refusé</span>
          </div>
          <p className="text-sm text-gray-600">{message}</p>
        </div>
      )}

      {status === 'ERROR' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Erreur</span>
          </div>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      )}
    </div>
  )
}
