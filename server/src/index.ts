import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

type Point = { x: number; y: number };
type Stroke = {
  id: string;
  userId: string;
  color: string;
  width: number;
  tool: "pen" | "eraser";
  points: Point[];
};

type Room = {
  strokes: Stroke[];
  redoStack: Stroke[];
  users: Set<string>;
};

const app = express();
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "collab-canvas-server" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
  origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { strokes: [], redoStack: [], users: new Set() };
    rooms.set(roomId, room);
  }
  return room;
}

io.on("connection", socket => {
  socket.on("room:join", ({ roomId, name, color }) => {
    const room = getRoom(roomId);
    socket.join(roomId);
    room.users.add(socket.id);

    socket.data.roomId = roomId;
    socket.data.name = name;
    socket.data.color = color;

    socket.emit("room:state", {
      strokes: room.strokes,
      users: room.users.size
    });

    io.to(roomId).emit("room:users", room.users.size);
  });

  socket.on("stroke:start", ({ roomId, stroke }) => {
    const room = getRoom(roomId);
    room.strokes.push(stroke);
    room.redoStack = [];
    socket.to(roomId).emit("stroke:start", stroke);
  });

  socket.on("stroke:update", ({ roomId, strokeId, points }) => {
    const room = getRoom(roomId);
    const stroke = room.strokes.find(s => s.id === strokeId);
    if (!stroke) return;

    stroke.points.push(...points);
    socket.to(roomId).emit("stroke:update", { strokeId, points });
  });

  socket.on("stroke:end", ({ roomId, stroke }) => {
    const room = getRoom(roomId);
    const index = room.strokes.findIndex(s => s.id === stroke.id);
    if (index >= 0) room.strokes[index] = stroke;
    socket.to(roomId).emit("stroke:end", stroke);
  });

  socket.on("cursor:move", ({ roomId, x, y, name, color }) => {
    socket.to(roomId).emit("cursor:update", {
      userId: socket.id,
      name,
      color,
      x,
      y
    });
  });

  socket.on("canvas:undo", ({ roomId }) => {
    const room = getRoom(roomId);
    const stroke = room.strokes.pop();
    if (!stroke) return;

    room.redoStack.push(stroke);
    io.to(roomId).emit("canvas:state", { strokes: room.strokes });
  });

  socket.on("canvas:redo", ({ roomId }) => {
    const room = getRoom(roomId);
    const stroke = room.redoStack.pop();
    if (!stroke) return;

    room.strokes.push(stroke);
    io.to(roomId).emit("canvas:state", { strokes: room.strokes });
  });

  socket.on("canvas:clear", ({ roomId }) => {
    const room = getRoom(roomId);
    room.strokes = [];
    room.redoStack = [];
    io.to(roomId).emit("canvas:state", { strokes: [] });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | undefined;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(socket.id);
    io.to(roomId).emit("room:users", room.users.size);

    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`CollabDraw server running on http://localhost:${PORT}`);
});
