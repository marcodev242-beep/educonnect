import React from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  readOnly?: boolean;
  onChange?: (value: number) => void;
  size?: number;
  disabled?: boolean;
}

export function StarRating({
  value,
  readOnly = false,
  onChange,
  size = 20,
  disabled = false,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = React.useState<number | null>(null);
  const displayValue = readOnly ? value : hoverValue ?? value;

  const handleClick = (newValue: number) => {
    if (disabled || readOnly) return;
    onChange?.(newValue);
  };

  const handleMouseEnter = (newValue: number) => {
    if (disabled || readOnly) return;
    setHoverValue(newValue);
  };

  const handleMouseLeave = () => {
    if (disabled || readOnly) return;
    setHoverValue(null);
  };

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={handleMouseLeave}
      role="radiogroup"
      aria-label="Notation"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const isFilled = n <= displayValue;
        const isHovered = !readOnly && !disabled && hoverValue !== null && n <= hoverValue;
        return (
          <button
            key={n}
            type="button"
            onClick={() => handleClick(n)}
            onMouseEnter={() => handleMouseEnter(n)}
            onMouseLeave={handleMouseLeave}
            disabled={disabled || readOnly}
            className="p-0 bg-none border-none text-[14px] sm:text-[20px] transition-colors"
            aria-checked={isFilled}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
          >
            <Star
              size={size}
              className={`
                transition-colors duration-200
                ${isFilled || isHovered ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-300"}
              `}
            />
          </button>
        );
      })}
    </div>
  );
}