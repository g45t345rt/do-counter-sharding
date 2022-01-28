//@ts-ignore
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))

const main = async () => {
  let counter = 0
  while(counter < 1000) {
    const res =await fetch(`http://localhost:8787`)
    counter++
  }

  console.log(counter)
}

main()
