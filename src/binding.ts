import type ittyRouter from 'itty-router'

export { }

declare global {
  interface Request extends ittyRouter.Request { }

  interface EnvInterface {
    KV: KVNamespace
    METRICS_DO: DurableObjectNamespace
  }
}
