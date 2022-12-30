import { RouterProvider } from 'react-router-dom'
import { newRouter } from '../routing'

export const App = () => {
  const router = newRouter()

  return <RouterProvider router={router} />
}
