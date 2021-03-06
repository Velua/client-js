import { DFUSE_API_KEY, runMain, prettifyJson, DFUSE_API_NETWORK } from "../config"
import { createDfuseClient } from "@dfuse/client"

async function main(): Promise<void> {
  const client = createDfuseClient({ apiKey: DFUSE_API_KEY, network: DFUSE_API_NETWORK })

  try {
    const response = await client.stateAbi("eosio.forum")

    console.log("State ABI response", prettifyJson(response))
  } catch (error) {
    console.log("An error occurred", error)
  }

  client.release()
}

runMain(main)
