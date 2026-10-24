import { useEffect, useRef, useState } from "react";
import { easeInOut, lerpPoints } from "../utils/snakeShape.js";
import "../styles/snake.css";

const MOVE_MS = 260;
const BODY_WIDTH = 0.74; // bề ngang thân (đơn vị: ô)
const TAIL_WIDTH = 0.74;
const HEAD_RADIUS = 0.45;

const asPath = (points) => points.map((p) => `${p.x},${p.y}`).join(" ");

// Hiệu ứng trượt: nội suy từng điểm của đường rắn từ vị trí đang hiển thị tới vị trí mới.
// Vì cả con rắn là một đường nối các điểm nên không bao giờ bị đứt khúc khi đang chuyển động.
function useTweenedShapes(targets) {
  const [display, setDisplay] = useState(targets);
  const displayRef = useRef(targets);
  const key = JSON.stringify(targets);

  useEffect(() => {
    const from = displayRef.current;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      displayRef.current = targets;
      setDisplay(targets);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / MOVE_MS);
      const eased = easeInOut(t);
      const next = targets.map((shape) => {
        const previous = from.find((item) => item.owner === shape.owner);
        return { ...shape, points: previous ? lerpPoints(previous.points, shape.points, eased) : shape.points };
      });
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return display;
}

function Eyes({ head, neck }) {
  // Nhìn theo hướng đang đi: từ đốt thứ hai tới đầu.
  let dx = 0;
  let dy = -1;
  if (neck) {
    dx = head.x - neck.x;
    dy = head.y - neck.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
  }
  const px = -dy;
  const py = dx;
  return [-1, 1].map((side) => {
    const cx = head.x + dx * 0.14 + px * 0.19 * side;
    const cy = head.y + dy * 0.14 + py * 0.19 * side;
    return (
      <g key={side}>
        <circle cx={cx} cy={cy} r={0.12} fill="#fff" />
        <circle cx={cx + dx * 0.04} cy={cy + dy * 0.04} r={0.06} fill="#111" />
      </g>
    );
  });
}

export default function SnakeLayer({ shapes, width, height }) {
  const display = useTweenedShapes(shapes);
  return (
    <svg className="snake-layer" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {display.map((shape) => {
        const { points } = shape;
        if (!points.length) return null;
        const bodyPoints = points.length > 1 ? points.slice(0, -1) : [];
        return (
          <g key={shape.owner} className={`snake snake-${shape.owner} ${shape.alive ? "" : "dead"}`}>
            {bodyPoints.length > 1 && (
              <polyline className="snake-body" points={asPath(bodyPoints)} strokeWidth={BODY_WIDTH} />
            )}
            {points.length > 1 && (
              <polyline
                className="snake-body"
                points={asPath(points.slice(-2))}
                strokeWidth={TAIL_WIDTH}
              />
            )}
            <circle className="snake-head" cx={points[0].x} cy={points[0].y} r={HEAD_RADIUS} />
            <Eyes head={points[0]} neck={points[1]} />
          </g>
        );
      })}
    </svg>
  );
}

export function SnakeFood() {
  return <div className="snake-food" title="Mồi" />;
}
