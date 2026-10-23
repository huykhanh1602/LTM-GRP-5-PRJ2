import "../styles/snake.css";

// Mỗi đốt rắn là một khối vuông bo góc. Cạnh nào nối với đốt kề thì bỏ khoảng hở và bỏ bo góc,
// nhờ vậy các đốt liền thành một con rắn thay vì các bong bóng rời nhau.
const GAP = 12; // % khoảng hở quanh đốt thân
const HEAD_GAP = 4;
const TAIL_SIDE_GAP = 26; // đuôi thon hơn hai bên

function insets(role, links) {
  const gap = role === "head" ? HEAD_GAP : GAP;
  const base = { top: gap, right: gap, bottom: gap, left: gap };
  if (role === "tail") {
    // Đuôi thon: hẹp hơn theo chiều vuông góc với hướng nối.
    if (links.has("up") || links.has("down")) { base.left = TAIL_SIDE_GAP; base.right = TAIL_SIDE_GAP; }
    else if (links.has("left") || links.has("right")) { base.top = TAIL_SIDE_GAP; base.bottom = TAIL_SIDE_GAP; }
  }
  for (const side of links) base[side] = 0; // cạnh nối với đốt kề thì liền, không hở
  return base;
}

function radius(links, role) {
  const full = role === "head" ? "45%" : role === "tail" ? "50%" : "26%";
  const corner = (a, b) => (links.has(a) || links.has(b) ? "0" : full);
  return `${corner("up", "left")} ${corner("up", "right")} ${corner("down", "right")} ${corner("down", "left")}`;
}

const EYES = {
  up: [{ left: "24%", top: "26%" }, { right: "24%", top: "26%" }],
  down: [{ left: "24%", bottom: "26%" }, { right: "24%", bottom: "26%" }],
  left: [{ left: "26%", top: "24%" }, { left: "26%", bottom: "24%" }],
  right: [{ right: "26%", top: "24%" }, { right: "26%", bottom: "24%" }],
};

export default function SnakeSegment({ piece, layout }) {
  const { role, links, facing } = layout;
  const inset = insets(role, links);
  const style = {
    top: `${inset.top}%`,
    right: `${inset.right}%`,
    bottom: `${inset.bottom}%`,
    left: `${inset.left}%`,
    borderRadius: radius(links, role),
  };
  return (
    <div
      className={`snake-seg snake-${role} ${piece.alive ? "" : "dead"}`}
      style={style}
      title={`${piece.owner} · ${role}`}
    >
      {role === "head" && EYES[facing].map((pos, i) => <span key={i} className="snake-eye" style={pos} />)}
    </div>
  );
}

export function SnakeFood() {
  return <div className="snake-food" title="Mồi" />;
}
