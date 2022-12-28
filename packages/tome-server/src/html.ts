import { HtmlProps } from './types'

export const htmlTemplate = ({ base, title, content }: HtmlProps) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="icon" href="data:,">
  <base href="${base}"/>
  <script type="module" src="${process.env.VITE_DEV_SERVER}/@vite/client"></script>
  <script type="module" src="${process.env.VITE_DEV_SERVER}/src/index.ts"></script>
</head>
<body>
${content}
</body>
</html>
`
