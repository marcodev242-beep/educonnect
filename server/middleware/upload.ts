import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'

export const uploadDirectory = path.resolve(process.env.UPLOADS_DIR || 'uploads')
fs.mkdirSync(uploadDirectory, { recursive: true })
export const resolveUploadPath = (storedPath: string) => {
  const directPath = path.resolve(storedPath)
  if (directPath.startsWith(`${uploadDirectory}${path.sep}`)) return directPath
  // Existing database rows store relative paths such as uploads/<file>.
  return path.join(uploadDirectory, path.basename(storedPath))
}

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_req, file, cb) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
    cb(null, `${crypto.randomUUID()}${extension}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    cb(null, allowed.has(file.mimetype))
  },
})
