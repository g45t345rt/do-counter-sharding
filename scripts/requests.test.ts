import 'isomorphic-fetch'
import inquirer from 'inquirer'

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const baseUrl = `http://localhost:8787`

const main = async () => {
  const answers = await inquirer.prompt([
    { name: 'endpoint', type: 'input', message: 'Url endpoint', default: baseUrl },
    { name: 'reset', type: 'confirm', message: 'Reset global count?', default: true },
    { name: 'maxCount', type: 'number', message: 'Number of /increment request to send', default: 100 }
  ])

  const { endpoint, reset, maxCount } = answers

  let res = null

  if (reset) {
    let res = await fetch(`${endpoint}/global/reset`)
    if (!res.ok) throw res
  }

  let counter = 0
  let failedIncrement = 0
  const fetchIncrement = async () => {
    const res = await fetch(`${endpoint}/increment`)
    if (!res.ok) {
      console.log(res.statusText)
      failedIncrement++
    }
  }

  while (counter < maxCount) {
    fetchIncrement() // don't await to send faster
    counter++
  }

  console.log(`${counter} requests sent.`)
}

main()
