const API_URL = import.meta.env.VITE_API_URL?.trim() || ''

export default API_URL

export const apiUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/, '')

  if (!API_URL) {
    return `/${normalizedPath}`
  }

  return `${API_URL.replace(/\/$/, '')}/${normalizedPath}`
}