export default function Media({ src, fallback, className, loop = true }) {
  if (!src) return <span className={className}>{fallback}</span>;
  if (/\.(webm|mp4)$/i.test(src))
    return <video className={className} src={src} autoPlay muted loop={loop} playsInline />;
  return <img className={className} src={src} alt="" draggable={false} />;
}