import { describe, test, expect } from 'bun:test'
import { AASClient } from '../client'

describe('AASClient constructor', () => {
  test('uses provided baseUrl', () => {
    const client = new AASClient('https://market.example.com')
    expect(client.baseUrl).toBe('https://market.example.com')
  })

  test('defaults to http://localhost:3000', () => {
    const client = new AASClient()
    expect(client.baseUrl).toBe('http://localhost:3000')
  })

  test('strips trailing slash from baseUrl', () => {
    const client = new AASClient('https://market.example.com/')
    expect(client.baseUrl).toBe('https://market.example.com')
  })
})
