const ignoredWords = [
  'a',
  'an',
  'the',
]

const invalidCharacters = /[^\w\- ]+/g

export const idFromTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(invalidCharacters, '')
    .trim()
    .split(/ +/g)
    .filter(word => !ignoredWords.includes(word))
    .join('-')
