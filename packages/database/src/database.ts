import { DatabaseConfig, DataSource } from './types'

// TODO: This is a temporary function that can be removed once full multi-datasource support is implemented.
export function getDefaultDataSource(config: DatabaseConfig): DataSource {
  const { sources } = config
  return sources[Object.keys(sources)[0]]
}
