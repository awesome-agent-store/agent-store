import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

test('createReadlinePrompter reads multiple answers from piped stdin', () => {
  const script = `
    import { createReadlinePrompter } from './src/utils/prompt'

    const prompter = createReadlinePrompter()
    console.log(JSON.stringify(await prompter('Q1> ')))
    console.log(JSON.stringify(await prompter('Q2> ')))
    prompter.close?.()
  `

  const result = spawnSync('bun', ['--eval', script], {
    cwd: process.cwd(),
    input: 'first-answer\nsecond-answer\n',
    encoding: 'utf8',
  })

  expect(result.status).toBe(0)
  expect(result.stdout).toContain('"first-answer"')
  expect(result.stdout).toContain('"second-answer"')
})
