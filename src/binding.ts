import type ittyRouter from 'itty-router'

export { }

declare global {
  interface Request extends ittyRouter.Request { }

  interface EnvInterface {
    KV: KVNamespace
    COUNTER_DO: DurableObjectNamespace
  }
}
