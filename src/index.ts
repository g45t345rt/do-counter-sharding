import { Router } from 'itty-router'
import { CounterDurableObject } from './counter'

class Metrics extends CounterDurableObject {
  static doNamespace = `METRICS_DO` // binding name of your wrangler.toml
  static kvPrefix = `metrics` // prefix used when storing counters to KV
  static shardCount = 2 // number of shards that you want - can be change anytime - this should handle 200requests/s

  static shardMinRequestToGlobal = 100  // higher number will write to global less often
  static globalMinWritesToKV = 100 // higher number will write to KV less often

  // setting 0 here will disable the write timeout
  static shardWriteToGlobalAfter = 1000 * 5 // 5s in ms - if the DO does not receive anymore increment after 5s it will write to the global counter
  static globalWriteToKVAfter = 1000 * 5// 5s in ms - if the DO does not receive anymore write from shards after 5s it will write to KV
}

const router = Router()

router.get(`/counters`, async (request: Request, env: EnvInterface) => {
  const counters = await Metrics.kvCounters(env)
  return new Response(JSON.stringify(counters))
})

router.get(`/increment/:counter`, (request: Request, env: EnvInterface) => {
  const { counter } = request.params
  const stubCounter = Metrics.shardStub(env)
  return stubCounter.fetch(`/increment/${counter}`, request)
})

router.get(`/global/:action`, (request: Request, env: EnvInterface) => {
  const { action } = request.params
  const globalStub = Metrics.globalStub(env)
  return globalStub.fetch(action, request)
})

router.get(`/shard/:shardNumber/:action`, (request: Request, env: EnvInterface) => {
  const { shardNumber, action } = request.params
  const shardStub = Metrics.shardStub(env, Number(shardNumber))
  return shardStub.fetch(action, request)
})

router.all(`*`, () => new Response(`nothing`))

export { Metrics }

export default {
  fetch: router.handle
}
