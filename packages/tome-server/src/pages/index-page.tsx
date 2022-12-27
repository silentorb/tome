import * as React from 'react'
import { ResourcePageProps } from '../types'
import { listFiles } from '../file-operations'
import { IndexPage } from 'tome-common/src/pages/index-page'
import { capitalizeFirstLetter } from '../string-formatting'
import path from 'path'
import { renderElement } from '../rendering'

const newChildLink = (file: string) => {
  const shortPath = file
    .replace(/^\//, '')
    .replace(/\.md$/, '')

  return {
    path: shortPath,
    title: capitalizeFirstLetter(shortPath),
  }
}

export const renderIndexPage = async (props: ResourcePageProps) => {
  const { filePath, urlPath } = props
  const files = await listFiles(filePath)
  const items = files.map(newChildLink)

  const includeParentNavigation = urlPath != ''
  const element = <IndexPage items={items} includeParentNavigation={includeParentNavigation}/>
  return {
    title: capitalizeFirstLetter(path.basename(urlPath)),
    content: renderElement(element),
  }
}
