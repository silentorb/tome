import React from 'react'
import {
  createBrowserRouter, Navigate,
} from 'react-router-dom'
import { NodePage } from './components/NodePage'
import { loadNodeContainer } from './services'
import { withRequestId } from './services/utility'
import { withData } from './services/with-data'

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
