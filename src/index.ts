const BATCH_SIZE = 10

export class CounterDurableObject implements DurableObject {
  state: DurableObjectState
  env: EnvInterface
  count: number

  constructor(state: DurableObjectState, env: EnvInterface) {
    this.state = state
    this.env = env

    this.state.blockConcurrencyWhile(async () => {
      this.count = await this.state.storage.get('count') || 0
    })
  }

  static Stub(env: EnvInterface, name: string) {
    const id = env.COUNTER_DO.idFromName(name)
    return env.COUNTER_DO.get(id)
  }

  getGlobalStub() {
    const id = this.env.COUNTER_DO.idFromName(`global`)
    return this.env.COUNTER_DO.get(id)
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const method = request.method

    if (url.pathname === '/increment') {
      this.count += 1
      if (this.count > BATCH_SIZE) {
        const globalStub = this.getGlobalStub()
        globalStub.fetch(`/incrementGlobalCount`, {
          method: 'POST',
          body: JSON.stringify(this.count)
        })
        this.count = 0
      }

      this.state.storage.put(`count`, this.count)
    }

    if (method === 'POST' && url.pathname === '/incrementGlobalCount') {
      const count = await request.json<number>()
      this.count += count
      console.log(`incrementGlobalCount`)
      this.state.storage.put(`count`, this.count)
      this.env.KV.put(`total`, JSON.stringify(this.count))
    }

    if (url.pathname === '/count') {
      return new Response(JSON.stringify(this.count))
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

    // count every request with sharding - add another id in the list to handle more request
    const ids = [`counterA`, `counterB`] // this should handle 200/rs right?

    if (url.pathname === '/counters') {
      const counts = {}
      for (let i = 0; i < ids.length; i++) {
        const counterName = ids[i]
        const stubCounter = CounterDurableObject.Stub(env, counterName)
        const res = await stubCounter.fetch(new Request(`http://internal/count`))
        counts[counterName] = await res.json()
      }
      return new Response(JSON.stringify(counts))
    }

    const rand = Math.floor(Math.random() * ids.length)
    const counterName = ids[rand]
    const stubCounter = CounterDurableObject.Stub(env, counterName)
    stubCounter.fetch(new Request(`http://internal/increment`))

    return new Response(counterName)
  }
}
