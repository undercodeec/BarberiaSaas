<div
  class="pb-liquid"
  role="progressbar"
  aria-valuenow="68"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="Storage used"
>
  <span class="pb-liquid-fill" style="--pb-liquid-level: 68%">
    <svg
      class="pb-liquid-wave w1"
      viewBox="0 0 200 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V 20 H 0 Z" fill="currentColor" />
    </svg>
    <svg
      class="pb-liquid-wave w2"
      viewBox="0 0 200 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 10 Q 25 20 50 10 T 100 10 T 150 10 T 200 10 V 20 H 0 Z" fill="currentColor" />
    </svg>
  </span>
  <span class="pb-liquid-label"><strong>68%</strong> storage used</span>
</div>

<style>

    .pb-liquid {
  position: relative;
  width: 220px;
  height: 88px;
  border-radius: 14px;
  background: linear-gradient(180deg, #0f172a, #1e293b);
  border: 1px solid rgba(56, 189, 248, 0.25);
  overflow: hidden;
  box-shadow: 0 12px 30px -10px rgba(56, 189, 248, 0.25);
  font-family: system-ui, sans-serif;
}
.pb-liquid-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--pb-liquid-level, 0%);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.85) 0%, rgba(14, 165, 233, 0.95) 100%);
  color: rgba(56, 189, 248, 0.85);
  transition: height 0.6s cubic-bezier(0.5, 0, 0.3, 1.2);
}
.pb-liquid-wave {
  position: absolute;
  left: 0;
  bottom: 100%;
  width: 200%;
  height: 18px;
}
.pb-liquid-wave.w1 {
  animation: pbLiquidWave 4s linear infinite;
  opacity: 0.85;
}
.pb-liquid-wave.w2 {
  animation: pbLiquidWave 6s linear infinite reverse;
  opacity: 0.55;
}
.pb-liquid-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #f0f9ff;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  z-index: 1;
}
.pb-liquid-label strong {
  font-size: 20px;
  font-weight: 700;
}
@media (prefers-reduced-motion: reduce) {
  .pb-liquid-wave {
    animation: none;
  }
}
@keyframes pbLiquidWave {
  to {
    transform: translateX(-50%);
  }
}

</style>