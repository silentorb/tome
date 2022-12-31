import fs from 'fs'
import path from 'path'

export function listFiles(directory: string) {
  return fs.promises.readdir(directory)
}

export const sanitizeFilePath = (filePath: string): string =>
  filePath.replace(/\\+/g, '/')

export function joinPaths(...args: string[]) {
  return sanitizeFilePath(path.join(...args))
}

export function readFile(filePath: string) {
  return fs.promises.readFile(filePath, 'utf8')
}

export function writeFile(filePath: string, content: string) {
  return fs.promises.writeFile(filePath, content, 'utf8')
}

export async function isExistingDirectory(filePath: string) {
  try {
    return (await fs.promises.lstat(filePath)).isDirectory()
  }
  catch {
    return false
  }
}
