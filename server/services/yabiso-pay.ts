import { serverConfig } from '../config.js'
import https from 'node:https'

const YABISO_INITIATE_PATH = '/epay/V1/ws_request_payment'
const YABISO_STATUS_PATH = '/epay/V1/YabisoPay_Get_Statut_Transaction'
const YABISO_CONNECT_TIMEOUT_MS = 20_000
const YABISO_TIMEOUT_MS = 30_000

type JsonRecord = Record<string, unknown>

export type YabisoInitiatePayload = {
  merchantID: string
  MerchantName: string
  transID: string
  reference: string
  Msisdn: string
  Amount: number
  callback: string
}

export type YabisoStatusPayload = {
  TransID: string
  MerchantName: string
  MerchantID: string
}

export type YabisoInitiateResponse = {
  id?: string
  success?: boolean
  status?: string
  [key: string]: unknown
}

export type YabisoStatusResponse = {
  TransID?: string
  MerchantName?: string
  MerchantID?: string
  Montant?: number
  Statut?: string
  Message?: string
  IDTrans_Extern?: string
  [key: string]: unknown
}

const normalizeText = (value: unknown) => String(value || '').trim()

const asRecord = <T extends JsonRecord>(value: unknown, label: string): T => {
  if (value && typeof value === 'object') return value as T
  throw new Error(`Réponse YabisoPay invalide pour ${label}: ${formatYabisoResponse(value)}`)
}

export const eschoolBaseUrl = () => serverConfig.eschoolApiBaseUrl

const yabisoMerchant = () => {
  const merchantID = normalizeText(process.env.ESCHOOL_MERCHANT_ID)
  const MerchantName = normalizeText(process.env.ESCHOOL_MERCHANT_NAME)
  if (!merchantID || !MerchantName) {
    throw new Error('Configuration ESchoolAPI manquante: ESCHOOL_MERCHANT_ID et ESCHOOL_MERCHANT_NAME sont requis')
  }
  return { merchantID, MerchantName }
}

export const yabisoCallbackUrl = () => {
  const callbackUrl = normalizeText(process.env.ESCHOOL_CALLBACK_URL)
  if (!callbackUrl) return ''
  if (!/^https?:\/\//i.test(callbackUrl)) {
    throw new Error('ESCHOOL_CALLBACK_URL doit être une URL HTTP ou HTTPS')
  }
  if (!/\/api\/payments\/yabiso-callback\/?$/i.test(callbackUrl)) {
    throw new Error('ESCHOOL_CALLBACK_URL doit finir par /api/payments/yabiso-callback')
  }
  if (/localhost|127\.0\.0\.1/i.test(callbackUrl)) return callbackUrl
  if (!/^https:\/\//i.test(callbackUrl)) {
    throw new Error('ESCHOOL_CALLBACK_URL doit être HTTPS hors environnement local')
  }
  return callbackUrl
}

const normalizeAirtelMsisdn = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  const msisdn = digits.replace(/^242(?=0[45])/, '')
  if (!/^0[45]\d{7,}$/.test(msisdn)) {
    throw new Error('Le numéro Airtel doit commencer par 04 ou 05 et contenir au moins 9 chiffres.')
  }
  return msisdn
}

export const parseYabisoResponse = async (response: Response) => {
  const body = await response.text()
  if (!body) return null
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

export const formatYabisoResponse = (data: unknown) => {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

const describeFetchError = (error: unknown) => {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as Error & { cause?: unknown }).cause
  const causeMessage = cause instanceof Error ? ` (${cause.message})` : ''
  if (error.name === 'AbortError') return 'délai d’attente dépassé'
  return `${error.message}${causeMessage}`
}

const logExchange = (label: string, direction: 'ENVOI' | 'REPONSE', data: unknown) => {
  if (data && typeof data === 'object' && 'payload' in data) {
    const exchange = data as { payload?: JsonRecord; [key: string]: unknown }
    const payload = exchange.payload
    if (payload && typeof payload === 'object' && typeof payload.Msisdn === 'string') {
      const digits = payload.Msisdn.replace(/\D/g, '')
      console.log(`[YabisoPay] ${label} ${direction}: ${formatYabisoResponse({
        ...exchange,
        payload: { ...payload, Msisdn: digits.length > 2 ? `***${digits.slice(-2)}` : '***' },
      })}`)
      return
    }
  }
  console.log(`[YabisoPay] ${label} ${direction}: ${formatYabisoResponse(data)}`)
}

const postToYabiso = async <T>(label: string, path: string, payload: JsonRecord): Promise<T> => {
  const url = `${eschoolBaseUrl()}${path}`
  const requestUrl = new URL(url)

  logExchange(label, 'ENVOI', { url, payload })
  try {
    const requestBody = JSON.stringify(payload)
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = https.request(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      }, incoming => {
        let body = ''
        incoming.setEncoding('utf8')
        incoming.on('data', chunk => { body += chunk })
        incoming.on('end', () => resolve({ status: incoming.statusCode || 0, body }))
        incoming.on('error', reject)
      })
      let connected = false
      const connectTimeout = setTimeout(() => {
        request.destroy(new Error(`Connect Timeout Error (timeout: ${YABISO_CONNECT_TIMEOUT_MS}ms)`))
      }, YABISO_CONNECT_TIMEOUT_MS)
      const requestTimeout = setTimeout(() => {
        request.destroy(new Error(`Request Timeout Error (timeout: ${YABISO_TIMEOUT_MS}ms)`))
      }, YABISO_TIMEOUT_MS)

      request.on('socket', socket => {
        if (!socket.connecting) {
          connected = true
          clearTimeout(connectTimeout)
          return
        }
        socket.once('connect', () => {
          connected = true
          clearTimeout(connectTimeout)
        })
      })
      request.on('error', error => {
        clearTimeout(connectTimeout)
        clearTimeout(requestTimeout)
        reject(error)
      })
      request.on('close', () => {
        clearTimeout(connectTimeout)
        clearTimeout(requestTimeout)
      })
      request.on('response', () => {
        if (!connected) clearTimeout(connectTimeout)
      })
      request.end(requestBody)
    })
    let data: unknown = response.body
    if (response.body) {
      try {
        data = JSON.parse(response.body) as unknown
      } catch {
        // Certaines réponses du fournisseur ne sont pas au format JSON.
      }
    } else {
      data = null
    }
    logExchange(label, 'REPONSE', { httpStatus: response.status, body: data })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`YabisoPay HTTP ${response.status}: ${formatYabisoResponse(data)}`)
    }
    return data as T
  } catch (error) {
    if (error instanceof Error && /^YabisoPay HTTP/.test(error.message)) throw error
    const details = describeFetchError(error)
    throw new Error(`YabisoPay est injoignable via ${url}: ${details}`)
  }
}

export const buildYabisoInitiatePayload = (
  transID: string,
  reference: string,
  amount: number,
  phone: string,
): YabisoInitiatePayload => {
  if (!/^[A-Za-z0-9]{4,64}$/.test(reference)) {
    throw new Error('La référence YabisoPay doit contenir entre 4 et 64 caractères alphanumériques.')
  }
  const merchant = yabisoMerchant()
  return {
    merchantID: merchant.merchantID,
    MerchantName: merchant.MerchantName,
    transID,
    reference,
    Msisdn: normalizeAirtelMsisdn(phone),
    Amount: amount,
    callback: yabisoCallbackUrl(),
  }
}

export const buildYabisoStatusPayload = (transID: string): YabisoStatusPayload => {
  const merchant = yabisoMerchant()
  return {
    TransID: transID,
    MerchantName: merchant.MerchantName,
    MerchantID: merchant.merchantID,
  }
}

export const requestYabisoPayment = async (
  transId: string,
  reference: string,
  amount: number,
  phone: string,
  operator: string,
) => {
  if (operator !== 'airtel') throw new Error('Seul Airtel Money est configuré pour le moment')

  const payload = buildYabisoInitiatePayload(transId, reference, amount, phone)
  const rawData = await postToYabiso<unknown>('INITIATION', YABISO_INITIATE_PATH, payload)
  const data = asRecord<YabisoInitiateResponse>(rawData, 'INITIATION')

  if (data.success !== true) {
    throw new Error(`YabisoPay a refusé l’initiation: ${formatYabisoResponse(data)}`)
  }

  const providerReference = normalizeText(data.id) || findYabisoReference(data)
  if (!providerReference) {
    throw new Error(`YabisoPay n’a pas retourné de référence: ${formatYabisoResponse(data)}`)
  }
  return providerReference
}

export const getYabisoStatus = async (reference: string) => {
  const payload = buildYabisoStatusPayload(reference)
  const rawData = await postToYabiso<unknown>('STATUT', YABISO_STATUS_PATH, payload)
  return asRecord<YabisoStatusResponse>(rawData, 'STATUT')
}

export const findYabisoMessage = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') return undefined
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && /^(message|status|detail)$/i.test(key) && value.trim()) return value.trim()
    const nestedMessage = findYabisoMessage(value)
    if (nestedMessage) return nestedMessage
  }
  return undefined
}

export const findYabisoCode = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') return undefined
  for (const [key, value] of Object.entries(data)) {
    if ((typeof value === 'string' || typeof value === 'number') && /^(statut|response_code|result_code|code)$/i.test(key)) {
      const code = String(value).trim()
      if (code) return code
    }
    const nestedCode = findYabisoCode(value)
    if (nestedCode) return nestedCode
  }
  return undefined
}

export const findYabisoStatus = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') return undefined
  for (const [key, value] of Object.entries(data)) {
    if (/^(statut|status)$/i.test(key) && (typeof value === 'string' || typeof value === 'number')) {
      return String(value).trim()
    }
    const nestedStatus = findYabisoStatus(value)
    if (nestedStatus) return nestedStatus
  }
  return undefined
}

export const findYabisoReference = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') return undefined
  const preferredKeys = /^(id|transid|trans_id|transactionid|transaction_id|idtrans_?extern|reference|ref)$/i
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && preferredKeys.test(key) && value.trim()) {
      return value.trim()
    }
    const nestedReference = findYabisoReference(value)
    if (nestedReference) return nestedReference
  }
  return undefined
}

export const isPendingYabisoStatus = (data: unknown) => {
  const status = (findYabisoStatus(data) || '').trim().toUpperCase()
  return ['1', 'PENDING', 'IN_PROGRESS', 'PROCESSING', 'WAITING', 'EN_ATTENTE'].includes(status)
}

export const isSuccessfulYabisoStatus = (data: unknown) => {
  const status = (findYabisoStatus(data) || '').trim().toUpperCase()
  if (isPendingYabisoStatus(data)) return false
  return ['200', 'SUCCESS', 'SUCCES', 'SUCCÈS', 'REUSSI', 'RÉUSSI'].includes(status)
}

export const isFailedYabisoStatus = (data: unknown) => {
  const status = (findYabisoStatus(data) || '').trim().toUpperCase()
  const code = (findYabisoCode(data) || '').trim().toUpperCase()
  const message = (findYabisoMessage(data) || '').trim()
  const failedValues = ['3', '0', '4', '400', '401', '403', '404', '500', 'FAILED', 'FAILED_PAYMENT', 'CANCEL', 'CANCELLED', 'REFUSED', 'DECLINED', 'REJECTED', 'ERROR']
  if (isPendingYabisoStatus(data)) return false
  return failedValues.includes(status) || failedValues.includes(code) || /échec|echec|refus|failed|cancel|insufficient|solde|error|erreur|rejet|expired|expiré/i.test(message)
}
