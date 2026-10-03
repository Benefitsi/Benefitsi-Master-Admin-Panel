import { benefitIconGlyphs, type BenefitIconGlyph, type BenefitIconName } from "@/lib/benefit-icons"

/** Decorative icon; the adjacent benefit title supplies its accessible name. */
export function BenefitIcon({ name, size = 24, className }: {
  name: BenefitIconName
  size?: number
  className?: string
}) {
  const glyph: BenefitIconGlyph = benefitIconGlyphs[name]
  return <svg
    width={size}
    height={size}
    viewBox={glyph.viewBox}
    fill="currentColor"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <g transform={glyph.transform}>
      {glyph.paths.map((path, index) => <path key={index} d={path} />)}
    </g>
  </svg>
}
