import 'isomorphic-fetch'
import inquirer from 'inquirer'

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const baseUrl = `http://localhost:8787`

const main = async () => {
  const answers = await inquirer.prompt([
    { name: 'endpoint', type: 'input', message: 'Url endpoint', default: baseUrl },
    { name: 'counterName', type: 'input', message: 'Counter name' },
    { name: 'reset', type: 'confirm', message: 'Reset all counters?', default: false },
    { name: 'maxCount', type: 'number', message: 'Number of /increment request to send', default: 100 }
  ])

  const { endpoint, reset, maxCount, counterName } = answers

  let res = null

  if (reset) {
    res = await fetch(`${endpoint}/global/reset`)
    if (!res.ok) throw res
  }

  let counter = 0
  let failedIncrement = 0
  const fetchIncrement = async () => {
    const res = await fetch(`${endpoint}/increment/${counterName}`)
    if (!res.ok) {
      console.log(res)
      failedIncrement++
    }
  }

  const requests = []
  while (counter < maxCount) {
    requests.push(fetchIncrement()) // don't await here send all the request right away (simulate a burst)
    counter++
  }

  await Promise.all(requests)

  console.log(`${counter} requests sent, ${failedIncrement} failed, counter should be ${counter - failedIncrement}.`)
}

main()
