import { HtmlProps } from './types'

export const htmlTemplate = ({ base, title, content }: HtmlProps) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="icon" href="data:,">
  <base href="${base}"/>
  <script type="module" src="/tome-client.js"></script>
</head>
<body>
${content}
<div id="app" />
</body>
</html>
`
