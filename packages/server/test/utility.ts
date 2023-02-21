import fs from 'fs'
import path from 'path'

export const loadTestResource = (testScriptDir: string, subFolder: string) => (filename: string) =>
  fs.readFileSync(path.resolve(testScriptDir, subFolder, filename), 'utf8')
