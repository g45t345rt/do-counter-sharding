
export { }

declare global {
  interface EnvInterface {
    KV: KVNamespace
    COUNTER_DO: DurableObjectNamespace
  }
}
