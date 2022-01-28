type WriteInfo = {
  count: number
  shardName: string
  event: 'exceedMaxCount' | 'afterNoIncrement'
  timestamp: number
}

export class CounterDurableObject implements DurableObject {
  state: DurableObjectState
  env: EnvInterface

  static shardCount = 10 // 10 shards meaning we could handle 10*100 - 1000 requests per seconds
  maxCount = 100 // it's useless to put a number higher than 100 since a DO can't handle more than 100r/s
  writeIfNoIncrementAfter = 1000 * 5 // 5s - if a DO does not receive anymore increment after 5s it will write to the global counter
  timeoutId: number

  writes: WriteInfo[]
  count: number

  constructor(state: DurableObjectState, env: EnvInterface) {
    this.state = state
    this.env = env

    this.state.blockConcurrencyWhile(async () => {
      this.count = await this.state.storage.get('count') || 0
      this.writes = await this.state.storage.get('writes') || []
    })
  }

  static shardStub(env: EnvInterface, shardNumber?: number) {
    if (shardNumber === null || shardNumber === undefined) {
      shardNumber = Math.floor(Math.random() * CounterDurableObject.shardCount)
    }

    const id = env.COUNTER_DO.idFromName(`counter~shard${shardNumber}`)
    return env.COUNTER_DO.get(id)
  }

  static globalStub(env: EnvInterface) {
    const id = env.COUNTER_DO.idFromName(`counter~global`)
    return env.COUNTER_DO.get(id)
  }

  async incrementGlobal(event: string, shardName: string) {
    const holdCount = this.count
    this.count = 0
    this.state.storage.deleteAll()

    const writeInfo = {
      count: holdCount,
      event,
      shardName,
      timestamp: new Date().getTime()
    } as WriteInfo

    const globalStub = CounterDurableObject.globalStub(this.env)
    const res = await globalStub.fetch(`/incrementGlobalCount`, {
      method: 'POST',
      body: JSON.stringify(writeInfo)
    })

    if (!res.ok) {
      // was not able to write to global
      this.count += holdCount // we increment instead of equal because the DO might have received new request during the write global
      this.state.storage.put(`count`, this.count)
    }
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    const name = request.headers.get(`name`)
    const method = request.method
    const pathname = url.pathname

    if (method === 'POST') {
      if (pathname === '/incrementGlobalCount') {
        const writeInfo = await request.json<WriteInfo>()
        this.count += writeInfo.count
        this.state.storage.put(`count`, this.count)
        this.writes = [writeInfo, ...this.writes]
        this.state.storage.put(`writes`, this.writes)
        this.env.KV.put(`total`, JSON.stringify(this.count))
        return new Response(`Global saved.`)
      }

      if (pathname === '/resetGlobalCount') {
        this.count = 0
        this.state.storage.put(`count`, this.count)
        this.writes = []
        this.state.storage.put(`writes`, this.writes)
        this.env.KV.put(`total`, JSON.stringify(this.count))
        return new Response(`Global reset.`)
      }
    }

    if (method === 'GET') {
      if (pathname === '/increment') {
        if (this.timeoutId) clearTimeout(this.timeoutId)

        //@ts-ignore
        // Write to global if no increment after a certain amount of time
        this.timeoutId = setTimeout(async () => {
          console.log(`timeout write`)
          await this.incrementGlobal('afterNoIncrement', name) // the await is here is IMPORTANT
        }, this.writeIfNoIncrementAfter)

        this.count += 1
        // Directly write to global if it exceed to max amount in buffer
        if (this.count >= this.maxCount) {
          console.log(`max exceed write`)
          clearTimeout(this.timeoutId)
          await this.incrementGlobal('exceedMaxCount', name) // the await is here is also IMPORTANT
        } else {
          this.state.storage.put(`count`, this.count)
        }

        return new Response(name)
      }

      if (pathname === '/shards') {
        const counts = []
        for (let i = 0; i < CounterDurableObject.shardCount; i++) {
          const stub = CounterDurableObject.shardStub(this.env, i)
          const res = await stub.fetch(`/count`)
          counts[i] = await res.json()
        }

        return new Response(JSON.stringify(counts))
      }

      if (pathname === '/writes') {
        return new Response(JSON.stringify(this.writes, null, 2))
      }

      if (pathname === '/count') {
        return new Response(JSON.stringify(this.count))
      }
    }

    return new Response(`nothing`)
  }
}

export default {
  async fetch(request: Request, env: EnvInterface) {
    const url = new URL(request.url)
    if (url.pathname === '/total') {
      const count = await env.KV.get(`total`)
      return new Response(`${count || 0}`)
    }

    if (url.pathname === '/reset') {
      const globalStub = CounterDurableObject.globalStub(env)
      return globalStub.fetch(`/resetGlobalCount`, { method: 'POST' })
    }

    if (url.pathname === '/writes') {
      const globalStub = CounterDurableObject.globalStub(env)
      return globalStub.fetch(`/writes`)
    }

    const stubCounter = CounterDurableObject.shardStub(env)
    return stubCounter.fetch(request, { headers: { name: stubCounter.name } })
  }
}
