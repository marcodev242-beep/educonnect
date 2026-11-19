import type { NextFunction, Request, Response } from 'express'

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route introuvable',
    path: req.originalUrl,
  })
}

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Erreur serveur non gérée:', error)
  if (res.headersSent) return
  res.status(500).json({ error: 'Une erreur interne est survenue' })
}
