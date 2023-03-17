import { RouterProvider } from 'react-router-dom'
import { newRouter } from '../routing'
import { DatabaseConfig } from '@tome/database'
import React, { createContext, useEffect, useState } from 'react'
import { cssTransition, ToastContainer, Zoom } from 'react-toastify'
import { NotificationContext, standardNotify } from '../notifications'
import 'react-toastify/dist/ReactToastify.css'
import { GlobalStyle } from './styling'

const fade = cssTransition({
  enter: 'Toastify--animate Tome__fade-enter',
  exit: 'Toastify--animate Tome__fade-exit',
})

export const App = () => {
  // None of this database context code is being used right now.
  const [databaseConfig, setDatabaseConfig] = useState<DatabaseConfig | undefined>()
  const databaseConfigContext = createContext(undefined)
  const z = Zoom
  useEffect(() => {
    if (!databaseConfig) {

    }
  }, [databaseConfig])

  return (
    <GlobalStyle>
      <NotificationContext.Provider value={standardNotify}>
        <RouterProvider router={newRouter()}/>
      </NotificationContext.Provider>
      <ToastContainer
        autoClose={3000}
        hideProgressBar={true}
        closeButton={false}
        transition={fade}
      />
    </GlobalStyle>
  )
}
