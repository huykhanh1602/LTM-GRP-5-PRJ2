import { useState, useEffect } from "react";
import "../styles/hero.css";

const BANNER_SLIDES = [
  { id: 1, src: "/mascot_1.png", alt: "Thế giới game cùng bot!" },
  { id: 2, src: "/mascot_2.png", alt: "Đấu trường bot sôi động!" },
  { id: 3, src: "/mascot_3.png", alt: "Chinh phục đỉnh cao ELO!" },
];

export default function HeroBanner({ onStart }) {
  const [current, setCurrent] = useState(0);

  // Tự động lướt banner mỗi 4 giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % BANNER_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  function handlePrev() {
    setCurrent((prev) => (prev - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length);
  }

  function handleNext() {
    setCurrent((prev) => (prev + 1) % BANNER_SLIDES.length);
  }

  return (
    <div className="banner-slider-container">
      {/* ── Khung Banner chính dạng ảnh đúng kích thước ── */}
      <div
        className="banner-slider-track"
        onClick={onStart}
        title="Bấm để bắt đầu chơi ngay!"
        role="button"
        tabIndex={0}
      >
        {BANNER_SLIDES.map((slide, idx) => (
          <div
            key={slide.id}
            className={`banner-slide ${idx === current ? "active" : ""}`}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              className="banner-full-img"
              loading={idx === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}

        {/* Nút lùi / tiến khi di chuột */}
        <button
          className="slider-arrow slider-arrow--prev"
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          aria-label="Banner trước"
        >
          ‹
        </button>
        <button
          className="slider-arrow slider-arrow--next"
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          aria-label="Banner tiếp theo"
        >
          ›
        </button>
      </div>

      {/* ── Các chấm chỉ báo chuyển slide ── */}
      <div className="banner-dots">
        {BANNER_SLIDES.map((slide, idx) => (
          <button
            key={slide.id}
            className={`banner-dot ${idx === current ? "active" : ""}`}
            onClick={() => setCurrent(idx)}
            aria-label={`Chuyển tới banner ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
