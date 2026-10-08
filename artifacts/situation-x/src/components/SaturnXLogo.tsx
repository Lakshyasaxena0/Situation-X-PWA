interface SaturnXLogoProps {
  size?: number;
  className?: string;
}

const base = import.meta.env.BASE_URL;

/** Small logo: just the compass mark, on its own light tile so it reads on any background. */
export function SaturnXLogo({ size = 48, className = "" }: SaturnXLogoProps) {
  return (
    <img
      src={`${base}logo-mark.png`}
      width={size}
      height={size}
      alt="Situation X"
      draggable={false}
      className={`rounded-[22%] object-cover select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Full logo: the "SITUATION" wordmark with the compass. Use where there is room for it. */
export function SituationFullLogo({ width = 360, className = "" }: { width?: number; className?: string }) {
  return (
    <img
      src={`${base}logo-full.jpg`}
      alt="Situation X"
      draggable={false}
      className={`rounded-2xl select-none ${className}`}
      style={{ width: "100%", maxWidth: width, height: "auto" }}
    />
  );
}
