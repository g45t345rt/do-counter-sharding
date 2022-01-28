import { Router } from 'itty-router'
import CounterDurableObject from './counter'

const router = Router()

router.get(`/total`, async (_, env: EnvInterface) => {
  const count = await env.KV.get(`total`)
  return new Response(`${count || 0}`)
})

router.get(`/increment`, (request: Request, env: EnvInterface) => {
  const stubCounter = CounterDurableObject.shardStub(env)
  return stubCounter.fetch(request, { headers: { shardName: stubCounter.name } })
})

router.get(`/global/:action`, (request: Request, env: EnvInterface) => {
  const globalStub = CounterDurableObject.globalStub(env)
  return globalStub.fetch(request)
})

router.get(`/:shardNumber/:action`, (request: Request, env: EnvInterface) => {
  const { shardNumber } = request.params
  const shardStub = CounterDurableObject.shardStub(env, Number(shardNumber))
  return shardStub.fetch(request, { headers: { shardName: shardStub.name } })
})

router.all(`*`, () => new Response(`nothing`))

export { CounterDurableObject }

export default {
  fetch: router.handle
}
