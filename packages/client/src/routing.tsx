import React from 'react'
import { createBrowserRouter, Navigate, } from 'react-router-dom'
import { NodePage } from './components'
import { loadNodeContainer, withData, withRequestId } from './services'

export const getAbsoluteResourceUrl = (path: string) =>
  new URL(path, new URL('data/', document.location.origin)).pathname

export function newRouter() {
  return createBrowserRouter([
    {
      path: '/data/*',
      element: withData(NodePage),
      loader: withRequestId(loadNodeContainer),
      // loader: async (args: any) => ({ testing: 'wow' })
    },
    {
      path: '/',
      element: <Navigate to="/data"/>,
    },
  ])
}
