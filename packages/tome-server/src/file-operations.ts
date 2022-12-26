import * as fs from 'fs'
import * as path from 'path'

export function listFiles(directory: string) {
  return fs.promises.readdir(directory)
}

export const sanitizeDirectoryPath = (path: string): string =>
  path.replace(/\\+/g, '/')

export function joinPaths(...args: string[]) {
  return sanitizeDirectoryPath(path.join(...args))
}
