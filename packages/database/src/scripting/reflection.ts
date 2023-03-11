export const reflectFunctionParameters = (f: any): string[] =>
  f
    .toString()
    .replace(/[\r\n\s]+/g, ' ')
    .match(/(?:function\s*\w*)?\s*(?:\((.*?)\)|(\S+))/)
    .slice(1, 3)
    .join('')
    .split(/\s*,\s*/)
