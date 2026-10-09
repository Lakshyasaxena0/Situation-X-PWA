/** "Situation X" with a small "Powered by Faraksh" line under it. */
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <div className={`leading-tight ${className}`}>
      <div className="font-semibold text-foreground tracking-tight">Situation X</div>
      <div className="text-[8px] text-muted-foreground tracking-wide">Powered by Faraksh</div>
    </div>
  );
}
