import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";
import type { Point, RemoteCursor, Stroke, Tool } from "./types";

const COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

function getRoomId() {
  const match = window.location.pathname.match(/\/room\/([^/]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const generated = Math.random().toString(36).slice(2, 8).toUpperCase();
  window.history.replaceState({}, "", `/room/${generated}`);
  return generated;
}

function App() {
  const roomId = useMemo(getRoomId, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const rafRef = useRef<number | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map());

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [connected, setConnected] = useState(socket.connected);
  const [users, setUsers] = useState(1);
  const [copied, setCopied] = useState(false);

  const clientId = socket.id ?? "local";
  const userColor = "#2563eb";
  const userName = "You";

  useEffect(() => {
    strokesRef.current = strokes;
    drawAll();
  }, [strokes]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      socket.emit("room:join", { roomId, name: userName, color: userColor });
    };

    const onDisconnect = () => setConnected(false);

    const onRoomState = (data: { strokes: Stroke[]; users: number }) => {
      setStrokes(data.strokes);
      setUsers(data.users);
    };

    const onStrokeStart = (stroke: Stroke) => {
      setStrokes(prev => [...prev, stroke]);
    };

    const onStrokeUpdate = (data: { strokeId: string; points: Point[] }) => {
      setStrokes(prev =>
        prev.map(s => s.id === data.strokeId
          ? { ...s, points: [...s.points, ...data.points] }
          : s
        )
      );
    };

    const onStrokeEnd = (stroke: Stroke) => {
      setStrokes(prev => {
        const exists = prev.some(s => s.id === stroke.id);
        return exists ? prev.map(s => s.id === stroke.id ? stroke : s) : [...prev, stroke];
      });
    };

    const onCanvasState = (data: { strokes: Stroke[] }) => setStrokes(data.strokes);

    const onCursor = (cursor: RemoteCursor) => {
      remoteCursorsRef.current.set(cursor.userId, cursor);
      setCursors([...remoteCursorsRef.current.values()]);
    };

    const onUserCount = (count: number) => setUsers(count);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.on("stroke:start", onStrokeStart);
    socket.on("stroke:update", onStrokeUpdate);
    socket.on("stroke:end", onStrokeEnd);
    socket.on("canvas:state", onCanvasState);
    socket.on("cursor:update", onCursor);
    socket.on("room:users", onUserCount);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
      socket.off("stroke:start", onStrokeStart);
      socket.off("stroke:update", onStrokeUpdate);
      socket.off("stroke:end", onStrokeEnd);
      socket.off("canvas:state", onCanvasState);
      socket.off("cursor:update", onCursor);
      socket.off("room:users", onUserCount);
    };
  }, [roomId]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  function resizeCanvas() {
    const canvas = canvasRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    if (!canvas || !cursorCanvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    for (const c of [canvas, cursorCanvas]) {
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      const ctx = c.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    drawAll();
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (!stroke.points.length) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";

    const first = stroke.points[0];
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    if (stroke.points.length === 1) {
      ctx.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAll() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    drawCursors();
  }

  function drawCursors() {
    const canvas = cursorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    for (const cursor of cursors) {
      ctx.save();
      ctx.fillStyle = cursor.color;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "12px Inter, sans-serif";
      const labelWidth = ctx.measureText(cursor.name).width + 12;
      ctx.fillRect(cursor.x + 9, cursor.y - 19, labelWidth, 22);
      ctx.fillStyle = "#fff";
      ctx.fillText(cursor.name, cursor.x + 15, cursor.y - 4);
      ctx.restore();
    }
  }

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;

    const point = getPoint(e);
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      userId: clientId,
      color,
      width,
      tool,
      points: [point]
    };

    currentStrokeRef.current = stroke;
    setStrokes(prev => [...prev, stroke]);
    socket.emit("stroke:start", { roomId, stroke });
  }

  function updateStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(e);

    socket.emit("cursor:move", { roomId, x: point.x, y: point.y, name: userName, color: userColor });

    if (!drawingRef.current || !currentStrokeRef.current) return;

    currentStrokeRef.current.points.push(point);

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        const stroke = currentStrokeRef.current;
        if (!stroke) return;

        const last = stroke.points.slice(-1);
        setStrokes(prev => prev.map(s => s.id === stroke.id ? { ...s, points: [...stroke.points] } : s));
        socket.emit("stroke:update", { roomId, strokeId: stroke.id, points: last });
        rafRef.current = null;
      });
    }
  }

  function endStroke() {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    drawingRef.current = false;

    const stroke = currentStrokeRef.current;
    socket.emit("stroke:end", { roomId, stroke });
    currentStrokeRef.current = null;
  }

  function undo() {
    socket.emit("canvas:undo", { roomId });
  }

  function redo() {
    socket.emit("canvas:redo", { roomId });
  }

  function clearCanvas() {
    socket.emit("canvas:clear", { roomId });
  }

  async function shareRoom() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="brand">Collab<span>Draw</span></div>
          <div className="subtitle">Real-time collaborative drawing</div>
        </div>

        <div className="room">
          <span>Room</span>
          <strong>{roomId}</strong>
          <button onClick={shareRoom}>{copied ? "Copied!" : "Share"}</button>
        </div>

        <div className="status">
          <span className={connected ? "dot online" : "dot"} />
          {connected ? "Connected" : "Reconnecting"}
          <span className="users">👥 {users}</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="toolbar">
          <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}>✎</button>
          <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}>⌫</button>
          <div className="separator" />
          <button onClick={undo}>↶</button>
          <button onClick={redo}>↷</button>
          <button onClick={clearCanvas}>⌫</button>
        </aside>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            className="canvas"
            onPointerDown={beginStroke}
            onPointerMove={updateStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => {}}
          />
          <canvas ref={cursorCanvasRef} className="cursor-canvas" />
          <div className="canvas-hint">Draw here • Share the room link with another user</div>
        </div>
      </section>

      <footer className="controls">
        <label>
          Brush
          <input
            type="range"
            min="1"
            max="30"
            value={width}
            onChange={e => setWidth(Number(e.target.value))}
          />
          <b>{width}px</b>
        </label>

        <label className="colors">
          Color
          {COLORS.map(c => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              className={color === c ? "color selected" : "color"}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </label>

        <div className="legend">
          <span>⚡ WebSocket</span>
          <span>🎨 Canvas</span>
          <span>🚀 RAF optimized</span>
        </div>
      </footer>
    </main>
  );
}

export default App;
