import { RouterProvider } from 'react-router-dom'
import { newRouter } from '../routing'
import { DatabaseConfig } from '@tome/database'
import { createContext, useEffect, useState } from 'react'

export const App = () => {
  const [databaseConfig, setDatabaseConfig] = useState<DatabaseConfig | undefined>()
  const databaseConfigContext = createContext(undefined)
  useEffect(() => {
    if (!databaseConfig) {

    }
  }, [databaseConfig])

  return <RouterProvider router={newRouter()}/>
}
