import 'isomorphic-fetch'
import inquirer from 'inquirer'

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const baseUrl = `http://localhost:8787`

const main = async () => {
  const answers = await inquirer.prompt([
    { name: 'endpoint', type: 'input', message: 'Url endpoint', default: baseUrl },
    { name: 'counterName', type: 'input', message: 'Counter name?' },
    { name: 'reset', type: 'confirm', message: 'Reset counter?', default: false },
    { name: 'maxCount', type: 'number', message: 'Number of /increment request to send?', default: 100 },
    { name: 'incrementAmount', type: 'number', message: 'Increment amount?', default: 1 }
  ])

  const { endpoint, reset, maxCount, counterName, incrementAmount } = answers

  let res = null

  if (reset) {
    res = await fetch(`${endpoint}/global/reset/${counterName}`, { method: 'POST' })
    if (!res.ok) {
      console.log(await res.text())
      throw res
    }
  }

  let requestCount = 0
  let failedRequestCount = 0
  const fetchIncrement = async () => {
    const res = await fetch(`${endpoint}/increment/${counterName}`, {
      method: 'POST',
      body: JSON.stringify(incrementAmount)
    })
    if (!res.ok) {
      console.log(await res.text())
      failedRequestCount++
    }
  }

  const requests = []
  while (requestCount < maxCount) {
    requests.push(fetchIncrement()) // don't await here send all the request right away (simulate a burst)
    requestCount++
  }

  await Promise.all(requests)

  console.log(`${requestCount} requests sent, ${failedRequestCount} failed, counter should be ${(requestCount * incrementAmount) - (failedRequestCount * incrementAmount)}.`)
}

main()
