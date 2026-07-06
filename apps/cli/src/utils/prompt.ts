import { createInterface } from 'readline'

export type Prompter = (question: string) => Promise<string>
export type ClosablePrompter = Prompter & { close?: () => void }

function createPipedPrompter(): ClosablePrompter {
  let cursor = 0
  const answersPromise = new Promise<string[]>((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => {
      const normalized = data.replace(/\r\n/g, '\n')
      const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
      resolve(trimmed === '' ? [''] : trimmed.split('\n'))
    })
    process.stdin.on('error', reject)
    process.stdin.resume()
  })

  return (async (question: string) => {
    process.stdout.write(question)
    const answers = await answersPromise
    const answer = answers[cursor] ?? ''
    cursor += 1
    return answer
  }) as ClosablePrompter
}

export function createReadlinePrompter(): ClosablePrompter {
  if (!process.stdin.isTTY) {
    return createPipedPrompter()
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const prompter = ((question: string): Promise<string> =>
    new Promise(resolve => {
      rl.question(question, answer => {
        resolve(answer)
      })
    })) as ClosablePrompter

  prompter.close = () => rl.close()
  return prompter
}
