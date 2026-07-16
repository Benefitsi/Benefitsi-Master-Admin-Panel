import Image from "next/image"

export function BrandLogo({
  surface = "light",
  className = "h-auto w-44",
  priority = false,
}: {
  surface?: "light" | "dark"
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src={
        surface === "dark"
          ? "/benefitsi-logo-on-dark.svg"
          : "/benefitsi-logo-on-light.svg"
      }
      alt="Benefitsi"
      width={175}
      height={35}
      priority={priority}
      className={className}
    />
  )
}
