const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() || ''

export const apiUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/, '')

  if (!configuredApiUrl) {
    return `/${normalizedPath}`
  }

  return `${configuredApiUrl.replace(/\/$/, '')}/${normalizedPath}`
}
