import { ServerConfig } from 'tome-server/src/types'
import { joinPaths } from 'tome-database/src/file-operations'

export const capitalizeFirstLetter = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)
