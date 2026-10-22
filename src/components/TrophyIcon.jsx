/** Shared illustrated cup image for awards and tournament UI. */
export default function TrophyIcon({ className = "", size = "1.35em" }) {
  return (
    <img
      className={`trophy-icon ${className}`.trim()}
      src="/theme/fx/trophy.png"
      alt=""
      aria-hidden="true"
      draggable="false"
      style={{ width:size, height:size, objectFit:"contain", flexShrink:0 }}
    />
  );
}
