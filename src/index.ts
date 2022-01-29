import { Router } from 'itty-router'
import CounterDurableObject from './counter'

const router = Router()

router.get(`/:prefix/total`, async (request: Request, env: EnvInterface) => {
  const { prefix } = request.params
  const total = await CounterDurableObject.kvTotal(env, prefix)
  return new Response(`${total}`)
})

router.get(`/:prefix/increment`, (request: Request, env: EnvInterface) => {
  const { prefix } = request.params
  const stubCounter = CounterDurableObject.shardStub(env, prefix)
  return stubCounter.fetch(`/increment`, request)
})

router.get(`/:prefix/global/:action`, (request: Request, env: EnvInterface) => {
  const { prefix, action } = request.params
  const globalStub = CounterDurableObject.globalStub(env, prefix)
  return globalStub.fetch(action, request)
})

router.get(`/:prefix/shard/:shardNumber/:action`, (request: Request, env: EnvInterface) => {
  const { prefix, shardNumber, action } = request.params
  const shardStub = CounterDurableObject.shardStub(env, prefix, Number(shardNumber))
  return shardStub.fetch(action, request)
})

router.all(`*`, () => new Response(`nothing`))

export { CounterDurableObject }

export default {
  fetch: router.handle
}
