import { createSocket } from "../socket"
import { InboundMessage, InboundMessageType } from "../../message/inbound"
import { getActionTracesMessage } from "../../message/outbound"
import { WebSocketFactory } from "../../types/socket"

describe("socket", () => {
  let mockedWebSocket: WebSocketController
  let receivedMessages: InboundMessage[]
  const noopListener = () => null
  const accumulatingListener = (message: InboundMessage) => {
    receivedMessages.push(message)
  }

  beforeEach(() => {
    mockedWebSocket = mockWebSocket()
    receivedMessages = []
  })

  afterEach(() => {
    cleanupConnection(mockedWebSocket)
  })

  it("starts disconnected by default", () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    expect(socket.isConnected).toBeFalsy()
  })

  it("configures handlers on connect", () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    socket.connect(noopListener).then(() => {
      expect(mockedWebSocket.onclose).toBeDefined()
      expect(mockedWebSocket.onerror).toBeDefined()
      expect(mockedWebSocket.onopen).toBeDefined()
    })
  })

  it("switch to connected on successful connect", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => openConnection(mockedWebSocket), 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    expect(socket.isConnected).toBeTruthy()
  })

  it("calling connect twice without actual connections", async () => {
    let callCount = 0

    const socket = createSocket("any", {
      webSocketFactory: async () => {
        callCount++
        return Promise.resolve(mockedWebSocket)
      }
    })

    expect.hasAssertions()
    const promise1 = socket.connect(noopListener)
    const promise2 = socket.connect(noopListener)

    expect(callCount).toEqual(1)
    expect(promise2).toEqual(promise1)

    // Let both connect a chance to complete there work
    await waitFor(10)
  })

  it("handles connection error properly", async () => {
    const socket = createSocket("any", {
      webSocketFactory: async () => {
        return Promise.resolve(mockedWebSocket)
      }
    })

    setTimeout(() => rejectConnection(mockedWebSocket, { reason: "test" }), 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).rejects.toEqual({ reason: "test" })

    expect(socket.isConnected).toBeFalsy()
  })

  it("notifies onReconnect when reconnection", async () => {
    const onReconnect = jest.fn()
    const socket = createSocket("any", {
      reconnectDelayInMs: 0,
      onReconnect,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      closeConnection(mockedWebSocket, { code: 1001 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    await waitForReconnectionToTrigger()
    reopenConnection(mockedWebSocket)

    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(onReconnect).toHaveBeenCalledWith()
  })

  it("notifies onError when error occurred on connect", async () => {
    const onError = jest.fn()
    const socket = createSocket("any", {
      onError,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      rejectConnection(mockedWebSocket, "something")
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).rejects.toEqual("something")
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("something")
  })

  it("notifies onClose even when error occurs", async () => {
    const onError = jest.fn()
    const onClose = jest.fn()
    const socket = createSocket("any", {
      onError,
      onClose,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      rejectConnection(mockedWebSocket, "something")
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).rejects.toEqual("something")
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("something")

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith("something")
  })

  it("notifies onError when error occurred after succesfull connection", async () => {
    const onError = jest.fn()
    const socket = createSocket("any", {
      onError,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      rejectConnection(mockedWebSocket, "something")
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("something")
  })

  it("reconnects on abnormal close code ", async () => {
    const socket = createSocket("any", {
      reconnectDelayInMs: 0,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      closeConnection(mockedWebSocket, { code: 1001 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    await waitForReconnectionToTrigger()
    reopenConnection(mockedWebSocket)

    expect(socket.isConnected).toBeTruthy()
  })

  it("reconnects on abnormal close code even with other custom stream options ", async () => {
    const onError = jest.fn()
    const socket = createSocket("any", {
      reconnectDelayInMs: 0,
      onError,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      closeConnection(mockedWebSocket, { code: 1001 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    await waitForReconnectionToTrigger()
    reopenConnection(mockedWebSocket)

    expect(socket.isConnected).toBeTruthy()
  })

  it("doesn't try to reconnect on close code 1000 (normal closure)", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      closeConnection(mockedWebSocket, { code: 1000 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    reopenConnection(mockedWebSocket)

    expect(socket.isConnected).toBeFalsy()
  })

  it("doesn't try to reconnect on close code 1005 (no status code present)", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      closeConnection(mockedWebSocket, { code: 1005 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    reopenConnection(mockedWebSocket)

    expect(socket.isConnected).toBeFalsy()
  })

  it("doesn't try to reconnect when autoReconnect is false", async () => {
    const socket = createSocket("any", {
      autoReconnect: false,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
      closeConnection(mockedWebSocket, { code: 1001 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    reopenConnection(mockedWebSocket)

    expect(socket.isConnected).toBeFalsy()
  })

  it("notifies onClose even after disconnect has been called", async (done) => {
    const onError = jest.fn()
    const onClose = (event: any) => {
      expect(event).toEqual("something")
      done()
    }

    const socket = createSocket("any", {
      onError,
      onClose,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })
    setTimeout(() => {
      openConnection(mockedWebSocket, { code: 1000 })
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    socket.disconnect()

    expect(mockedWebSocket.close).toHaveBeenCalledTimes(1)
    closeConnection(mockedWebSocket, "something")
  })

  it("send message correctly when connected", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)
    await socket.send(getActionTracesMessage({ account: "test" }, { req_id: "test" }))

    expect(mockedWebSocket.send).toHaveBeenCalledTimes(1)
  })

  it("send waits for connect before sending", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    expect.hasAssertions()

    // Called asynchronously
    socket.connect(noopListener)
    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    await socket.send(getActionTracesMessage({ account: "test" }, { req_id: "test" }))
    expect(mockedWebSocket.send).toHaveBeenCalledTimes(1)
  })

  it("send correctly reconnects when not connected", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    await socket.send(getActionTracesMessage({ account: "test" }, { req_id: "test", listen: true }))

    expect(mockedWebSocket.send).toHaveBeenCalledTimes(1)
    expect(mockedWebSocket.send).toHaveBeenCalledWith(
      '{"type":"get_action_traces","req_id":"test","listen":true,"data":{"account":"test"}}'
    )
  })

  it("send pong message when keep alive sets to true", async () => {
    const socket = createSocket("any", {
      keepAlive: true,
      keepAliveIntervalInMs: 10,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })
    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()

    await expect(socket.connect(noopListener)).resolves.toBeUndefined()
    await waitFor(12)

    expect(mockedWebSocket.send).toHaveBeenCalledTimes(1)
    expect(mockedWebSocket.send).toHaveBeenCalledWith('{"type":"pong"}')
  })

  it("stop sending pong message when keep alive sets to true and disconnected", async () => {
    const socket = createSocket("any", {
      autoReconnect: false,
      keepAlive: true,
      keepAliveIntervalInMs: 4,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })
    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    setTimeout(() => {
      closeConnection(mockedWebSocket, { code: 1001 })
    }, 5)

    await waitFor(5)

    expect(mockedWebSocket.send).toHaveBeenCalledTimes(1)
    expect(mockedWebSocket.send).toHaveBeenCalledWith('{"type":"pong"}')
  })

  it("no pong messages when keep alive sets to false", async () => {
    const socket = createSocket("any", {
      keepAlive: false,
      keepAliveIntervalInMs: 1,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })
    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(noopListener)).resolves.toBeUndefined()

    await waitFor(3)

    expect(mockedWebSocket.send).toHaveBeenCalledTimes(0)
  })

  it("forwards received message to listener", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(accumulatingListener)).resolves.toBeUndefined()
    sendMessageToConnection(mockedWebSocket, { type: InboundMessageType.LISTENING, data: {} })

    expect(receivedMessages).toHaveLength(1)
    expect(receivedMessages[0]).toEqual({ type: InboundMessageType.LISTENING, data: {} })
  })

  it("notifies onInvalidMessage when message type is invalid", async () => {
    const onInvalidMessage = jest.fn()
    const socket = createSocket("any", {
      onInvalidMessage,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(accumulatingListener)).resolves.toBeUndefined()
    sendRawMessageToConnection(mockedWebSocket, {
      data: JSON.stringify({ type: "something else" })
    })

    expect(onInvalidMessage).toHaveBeenCalledTimes(1)
    expect(onInvalidMessage).toHaveBeenCalledWith({ type: "something else" })
  })

  it("does not forward received message to listener when invalid type", async () => {
    const socket = createSocket("any", {
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    setTimeout(() => {
      openConnection(mockedWebSocket)
    }, 0)

    expect.hasAssertions()
    await expect(socket.connect(accumulatingListener)).resolves.toBeUndefined()
    sendRawMessageToConnection(mockedWebSocket, {
      data: JSON.stringify({ type: "something else" })
    })

    expect(receivedMessages).toHaveLength(0)
  })

  it("performs a single connect on multiple send calls without being connected yet", async () => {
    const onReconnect = jest.fn()
    const socket = createSocket("any", {
      onReconnect,
      webSocketFactory: createWebSocketFactory(mockedWebSocket)
    })

    socket.connect(noopListener).then(() => {
      expect.hasAssertions()

      socket.send(getActionTracesMessage({ account: "test1" }, { req_id: "test1" }))
      socket.send(getActionTracesMessage({ account: "test2" }, { req_id: "test2" }))
      socket.send(getActionTracesMessage({ account: "test3" }, { req_id: "test3" }))

      openConnection(mockedWebSocket)

      expect(onReconnect).toHaveBeenCalledTimes(0)
    })
  })

  const createHandlerExecutor = (handlerName: string) => {
    return (localMockedWebSocket: WebSocketController, ...args: any[]) => {
      const handler = (localMockedWebSocket as any)[handlerName]
      if (handler) {
        return handler(...args)
      }

      throw new Error(`Cannot execute handler [${handlerName}] on mock socket, it does not exist.`)
    }
  }

  const openConnection = createHandlerExecutor("onopen")
  const reopenConnection = createHandlerExecutor("onopen")
  const closeConnection = createHandlerExecutor("onclose")
  const errorConnection = createHandlerExecutor("onerror")
  const sendRawMessageToConnection = createHandlerExecutor("onmessage")
  const sendMessageToConnection = (
    localMockedWebSocket: WebSocketController,
    message: InboundMessage
  ) => {
    sendRawMessageToConnection(localMockedWebSocket, { data: JSON.stringify(message) })
  }

  const rejectConnection = (localMockedWebSocket: WebSocketController, ...args: any) => {
    errorConnection(localMockedWebSocket, ...args)
    closeConnection(localMockedWebSocket, ...args)
  }

  const cleanupConnection = (localMockedWebSocket: WebSocketController) => {
    if (localMockedWebSocket && localMockedWebSocket.onclose) {
      return localMockedWebSocket.onclose({
        code: 1000,
        reason: "test clean up",
        wasClean: true
      } as any)
    }
  }
})

interface WebSocketController {
  receivedUrl: string

  close: jest.Mock<() => void>
  send: jest.Mock<(data: any) => void>

  onclose?: (event: any) => void
  onerror?: (event: any) => void
  onopen?: () => void
  onmessage?: (event: any) => void
}

class MockWebSocket implements WebSocketController {
  public receivedUrl: string

  constructor(url: string) {
    this.receivedUrl = url
  }

  public close = jest.fn<() => void>()
  public send = jest.fn<(data: any) => void>()
}

function mockWebSocket(): WebSocketController {
  return new MockWebSocket("any")
}

function createWebSocketFactory(mockedWebSocket: MockWebSocket) {
  return async () => {
    return Promise.resolve(mockedWebSocket)
  }
}

async function waitForReconnectionToTrigger() {
  return await waitFor(2)
}

function waitFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
