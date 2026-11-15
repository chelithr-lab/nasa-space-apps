import { useId } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Serenity-style pill toggle built from native radio buttons (keyboard support comes free). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <span key={option.value} className="segmented__option">
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <label htmlFor={id}>{option.label}</label>
          </span>
        );
      })}
    </fieldset>
  );
}
