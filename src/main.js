import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="spectator-page">
    <header class="page-header">
      <h1>Oẳn Tù Tì Cờ Vua</h1>
      <p>Giao diện theo dõi trận đấu</p>
    </header>

    <section class="connection-panel">
      <label for="room-id">Mã phòng</label>

      <div class="room-controls">
        <input
          id="room-id"
          type="text"
          value="room-01"
          placeholder="Nhập mã phòng"
        />

        <button id="connect-button" type="button">
          Theo dõi
        </button>
      </div>

      <p id="connection-status">Chưa kết nối</p>
    </section>

    <section class="game-panel">
      <h2>Trạng thái trận đấu</h2>
      <pre id="game-state">Chưa có dữ liệu trận đấu.</pre>
    </section>

    <section class="message-panel">
      <h2>Thông báo từ server</h2>
      <ul id="message-log"></ul>
    </section>
  </main>
`

const roomInput = document.querySelector('#room-id')
const connectButton = document.querySelector('#connect-button')
const connectionStatus = document.querySelector('#connection-status')
const gameState = document.querySelector('#game-state')
const messageLog = document.querySelector('#message-log')

let socket = null

function addLog(message) {
  const item = document.createElement('li')
  item.textContent = message
  messageLog.prepend(item)
}

function connectToRoom() {
  const roomId = roomInput.value.trim()

  if (!roomId) {
    connectionStatus.textContent = 'Vui lòng nhập mã phòng.'
    return
  }

  if (socket) {
    socket.close()
    socket = null
  }

  connectionStatus.textContent = 'Đang kết nối...'

  socket = new WebSocket(
  `ws://${window.location.hostname}:3000/spectator`
)

  socket.addEventListener('open', () => {
    connectionStatus.textContent = 'Đã kết nối, đang tham gia phòng...'

    socket.send(JSON.stringify({
      type: 'join',
      roomId: roomId
    }))
  })

  socket.addEventListener('message', (event) => {
    let message

    try {
      message = JSON.parse(event.data)
    } catch {
      addLog('Server gửi dữ liệu không phải JSON hợp lệ.')
      return
    }

    addLog(JSON.stringify(message))

    if (message.type === 'joined') {
      connectionStatus.textContent =
        `Đang theo dõi phòng ${message.roomId}`
    }

    if (message.type === 'game_state') {
      gameState.textContent = JSON.stringify(message, null, 2)
    }

    if (message.type === 'game_over') {
      gameState.textContent = JSON.stringify(message, null, 2)
    }

    if (message.type === 'error') {
      connectionStatus.textContent =
        `Lỗi: ${message.code ?? 'UNKNOWN_ERROR'}`
    }
  })

  socket.addEventListener('close', () => {
    connectionStatus.textContent = 'Đã ngắt kết nối.'
  })

  socket.addEventListener('error', () => {
    connectionStatus.textContent =
      'Không thể kết nối. Hãy kiểm tra server game.'
  })
}

connectButton.addEventListener('click', connectToRoom)