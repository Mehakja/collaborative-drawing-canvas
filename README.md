
# Real-Time Collaborative Drawing Canvas

A React + TypeScript + HTML Canvas + Node.js + Socket.IO R&D assignment.

##  Live Demo

 https://collaborative-drawing-canvas-client-pi.vercel.app

##  GitHub Repository

 https://github.com/Mehakja/collaborative-drawing-canvas

## Features

- Real-time multi-user drawing
- Room-based collaboration
- Pen and eraser
- Brush size and color
- Undo / redo
- Clear canvas
- Live remote cursors
- WebSocket synchronization
- `requestAnimationFrame` based drawing updates
- Responsive UI
- Touch/stylus-friendly canvas

## Requirements

- Node.js 20+
- npm 10+

## Run

From the project root:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The app creates a room automatically, for example:

```text
http://localhost:5173/room/AB12CD
```

Open that URL in a second browser tab/window to test collaboration.

## Architecture

```text
React + Canvas
      |
      | Socket.IO / WebSocket
      v
Node.js + Express
      |
      v
Room state in memory
```

## R&D points

### 1. Event throttling / batching

Pointer events can fire much faster than necessary for network synchronization. The client uses `requestAnimationFrame` to limit rendering/state updates to browser frames.

### 2. Layered rendering

The drawing canvas and cursor canvas are separate. Remote cursor updates do not require modifying the actual drawing layer.

### 3. Operation-oriented synchronization

The server stores strokes rather than repeatedly sending complete canvas screenshots.

### 4. Performance evaluation

For the final report, benchmark:

- 2, 5, 10, 25 users
- messages/second
- synchronization latency
- browser FPS
- CPU usage
- memory usage
- canvas stroke count

## Suggested future improvements

- Redis adapter for multiple server instances
- PostgreSQL persistence
- compressed/binary stroke messages
- per-user undo instead of global undo
- conflict-free replicated data types (CRDT)
- authentication
- room access control
- PNG/SVG export
- WebRTC experiments
