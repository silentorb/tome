import * as React from 'react'
import { useLoaderData } from 'react-router-dom'
import { ReactNode } from 'react'

export function withData(Element: React.ComponentType<any>): ReactNode {
  const DataComponent = () => {
    const data = useLoaderData() as object
    return <Element {...data}/>
  }

  return <DataComponent/>
}
