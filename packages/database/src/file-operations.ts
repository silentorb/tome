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

export function getRelativePath(from: string, to: string) {
  return sanitizeFilePath(path.relative(from, to))
}

export function readFileOrError(filePath: string) {
  return fs.promises.readFile(filePath, 'utf8')
}

export function readFileOrErrorSync(filePath: string) {
  return fs.readFileSync(filePath, 'utf8')
}

export function readFile(filePath: string) {
  return readFileOrError(filePath)
    .catch(async _ => undefined)
}

export function writeFile(filePath: string, content: string) {
  return fs.promises.writeFile(filePath, content, 'utf8')
}

export async function isExistingDirectory(filePath: string) {
  try {
    return (await fs.promises.lstat(filePath)).isDirectory()
  } catch {
    return false
  }
}

// Part of the purpose of this function is to centralize any unbound concurrent processing,
// because currently this is a naive implementation that runs everything at once and probably should eventually should
// be replaced with a more robust batching implementation, such as 20 concurrent processes at a time.
export async function batchProcess<Input, Output>(items: Input[], functor: (item: Input) => Promise<Output>): Promise<Output[]> {
  return Promise.all(
    items.map(functor)
  )
}

