import { RouterProvider } from 'react-router-dom'
import { newRouter } from '../routing'
import { DatabaseConfig } from '@tome/database'
import { createContext, useEffect, useState } from 'react'
import styled from 'styled-components'

const GlobalStyle = styled.div`
  font-family: Roboto, HelveticaNeue-Light, Helvetica Neue Light, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif;
`

export const App = () => {
  const [databaseConfig, setDatabaseConfig] = useState<DatabaseConfig | undefined>()
  const databaseConfigContext = createContext(undefined)
  useEffect(() => {
    if (!databaseConfig) {

    }
  }, [databaseConfig])

  return (
    <GlobalStyle>
      <RouterProvider router={newRouter()}/>
    </GlobalStyle>
  )
}
