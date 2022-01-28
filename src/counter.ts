import { Router } from 'itty-router'
import { nanoid } from 'nanoid'

type WriteInfo = {
  count: number
  shardName: string
  event: 'exceedMaxCount' | 'afterNoIncrement' | 'writeToKV'
  timestamp: number
}

export default class CounterDurableObject implements DurableObject {
  state: DurableObjectState
  env: EnvInterface

  static shardCount = 10 // 10 shards meaning we could handle 10*100 - 1000 requests per seconds

  shardMinCountToGlobal = 100 // higher number will write to global less often
  shardWriteToGlobalAfter = 1000 * 5 // 5s - if a DO does not receive anymore increment after 5s it will write to the global counter
  shardWriteToGlobalTimeoutId: number

  globalMinWritesToKV = 100
  globalWriteToKVAfter = 1000 * 5
  globalWriteToKVTimeoutId: number

  writes = 0
  count: number

  constructor(state: DurableObjectState, env: EnvInterface) {
    this.state = state
    this.env = env

    this.state.blockConcurrencyWhile(async () => {
      this.count = await this.state.storage.get('count') || 0
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

  async writeToGlobal(event: string, shardName: string) {
    const holdCount = this.count // save the count in a temp variable just in case the global write does not work (we don't want to loose the value)
    this.count = 0
    this.state.storage.deleteAll()

    const writeInfo = {
      count: holdCount,
      event,
      shardName,
      timestamp: new Date().getTime()
    } as WriteInfo

    const globalStub = CounterDurableObject.globalStub(this.env)
    const res = await globalStub.fetch(`/global/write`, {
      method: 'POST',
      body: JSON.stringify(writeInfo)
    })

    if (!res.ok) {
      // hit here means that we were not able to write to global
      this.count += holdCount // we increment the temp value that was not added
      this.state.storage.put(`count`, this.count)
    }
  }

  async writeToKV() {
    this.env.KV.put(`total`, JSON.stringify(this.count))
    const writeInfo = { event: 'writeToKV', count: this.count, shardName: 'global', timestamp: new Date().getTime() } as WriteInfo
    this.putWriteInfo(writeInfo)
    this.writes = 0
  }

  putWriteInfo(writeInfo: WriteInfo) {
    const { timestamp } = writeInfo
    const id = nanoid()
    this.state.storage.put(`writes~${timestamp}~${id}`, writeInfo)
  }

  async fetch(_request: Request) {
    const router = Router()

    router.post(`/global/write`, async (request: Request) => {
      const writeInfo = await request.json<WriteInfo>()
      this.count += writeInfo.count
      this.writes++
      this.state.storage.put(`count`, this.count)
      this.putWriteInfo(writeInfo)

      if (this.globalWriteToKVTimeoutId) clearTimeout(this.globalWriteToKVTimeoutId)

      //@ts-ignore
      this.globalWriteToKVTimeoutId = setTimeout(() => {
        console.log(`timeout writeToKV`)
        this.writeToKV()
      }, this.globalWriteToKVAfter)

      if (this.writes > this.globalMinWritesToKV) {
        console.log(`max exceed writeToKV`)
        clearTimeout(this.globalWriteToKVTimeoutId)
        this.writeToKV()
      }

      return new Response(`Global saved.`)
    })

    router.get(`/global/reset`, () => {
      this.count = 0
      this.state.storage.deleteAll()
      this.env.KV.put(`total`, JSON.stringify(this.count))
      return new Response(`Global reset.`)
    })

    router.get(`/global/shards`, async () => {
      const counts = []
      for (let i = 0; i < CounterDurableObject.shardCount; i++) {
        const stub = CounterDurableObject.shardStub(this.env, i)
        const res = await stub.fetch(`/${i}/count`)
        counts[i] = await res.json()
      }

      return new Response(JSON.stringify(counts))
    })

    router.get(`/global/writes`, async (request: Request) => {
      const result = await this.state.storage.list<WriteInfo>({ prefix: `writes~`, reverse: true })
      const writes = [...result]

      return new Response(JSON.stringify(writes.map(([_, w]) => w), null, 2))
    })

    router.get(`/global/shardWrites`, async () => {
      const result = await this.state.storage.list<WriteInfo>({ prefix: `writes~`, reverse: true })
      const writes = [...result]
      const shardWrites = {}

      writes.map(([_, w]) => w).forEach((w) => {
        if (w.shardName === 'global') return
        if (!shardWrites[w.shardName]) {
          shardWrites[w.shardName] = {
            count: 0,
            write: 0
          }
        }

        shardWrites[w.shardName].count += w.count
        shardWrites[w.shardName].write++
      })

      let totalCount = 0, totalWrite = 0
      Object.keys(shardWrites).forEach((k) => {
        const sw = shardWrites[k]
        totalCount += sw.count
        totalWrite += sw.write
      })

      return new Response(JSON.stringify({
        shardWrites,
        totalCount,
        totalWrite
      }, null, 2))
    })

    router.get(`/increment`, async () => {
      const shardName = _request.headers.get(`shardName`)
      if (this.shardWriteToGlobalTimeoutId) clearTimeout(this.shardWriteToGlobalTimeoutId)

      //@ts-ignore
      // Write to global if no increment after a certain amount of time
      this.shardWriteToGlobalTimeoutId = setTimeout(async () => {
        console.log(`timeout writeToGlobal`)
        await this.writeToGlobal('afterNoIncrement', shardName) // the await is here is IMPORTANT
      }, this.shardWriteToGlobalAfter)

      this.count += 1
      // Directly write to global if it exceed to max amount in buffer
      if (this.count >= this.shardMinCountToGlobal) {
        console.log(`max exceed writeToGlobal`)
        clearTimeout(this.shardWriteToGlobalTimeoutId)
        await this.writeToGlobal('exceedMaxCount', shardName) // the await is here is also IMPORTANT
      } else {
        this.state.storage.put(`count`, this.count)
      }

      return new Response(shardName)
    })

    router.get(`/:do/count`, () => {
      return new Response(JSON.stringify(this.count))
    })

    router.all(`*`, () => new Response(`nothing`))

    return router.handle(_request)
  }
}
