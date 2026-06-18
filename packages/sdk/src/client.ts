export type Result<T> = { data: T; error: null } | { data: null; error: string }

export class AASClient {
  readonly baseUrl: string

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }
}
