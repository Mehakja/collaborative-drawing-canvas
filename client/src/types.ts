export type Point = { x: number; y: number };

export type Tool = "pen" | "eraser";

export type Stroke = {
  id: string;
  userId: string;
  color: string;
  width: number;
  tool: Tool;
  points: Point[];
};

export type RemoteCursor = {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
};
