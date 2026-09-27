import { Fragment, type ReactNode } from "react"
import { publicMicrositeUrl } from "@/lib/public-microsite-contract"
import type { EditorialPost } from "@/lib/editorial-types"

export type EditorialPreviewPost = Pick<EditorialPost, "scope" | "title" | "excerpt" | "eyebrow" | "content" | "sources" | "related_links" | "image_url" | "image_alt" | "updated_at">

// Internal article links must resolve on the website, never under the Admin host.
function websiteUrl(value: unknown, kind: "link" | "asset" = "link") {
  const safe = publicMicrositeUrl(value, kind)
  if (!/^(https?:\/\/|\/(?!\/))/.test(safe)) return ""
  const base = publicMicrositeUrl(process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL) || "https://benefitsi.de"
  return new URL(safe, base).href
}

/** Match the city article's deliberately small format: links/emphasis, never HTML. */
function InlineText({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  const tokens = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g
  let cursor = 0
  for (const match of text.matchAll(tokens)) {
    const start = match.index
    if (start > cursor) nodes.push(text.slice(cursor, start))
    if (match[1] !== undefined) {
      const href = websiteUrl(match[2])
      nodes.push(href ? <a key={start} href={href} target="_blank" rel="noreferrer" className="font-semibold text-[#086fcc] underline underline-offset-4"><InlineText text={match[1]} /></a> : match[0])
    } else if (match[3] !== undefined) nodes.push(<strong key={start} className="font-bold text-[#061829]"><InlineText text={match[3]} /></strong>)
    else nodes.push(<em key={start}><InlineText text={match[4]} /></em>)
    cursor = start + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</>
}

/** Article-only preview of the saved/unsaved content, without publication side effects. */
export function EditorialPreview({ post, embedded = false }: { post: EditorialPreviewPost; embedded?: boolean }) {
  const city = post.scope === "city"
  const partner = post.scope === "partner"
  const Title = embedded ? "h2" : "h1"
  const Heading = embedded ? "h3" : "h2"
  const image = post.image_alt?.trim() ? websiteUrl(post.image_url, "asset") : ""
  const date = new Date(post.updated_at)
  const dateLabel = Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(date)
  const minutes = Math.max(1, Math.ceil(post.content.flatMap(section => section.paragraphs).join(" ").trim().split(/\s+/).length / 190))
  const sources = post.sources.flatMap(source => { const href = websiteUrl(source.url); return href ? [{ ...source, href }] : [] })
  const links = post.related_links.flatMap(link => { const href = websiteUrl(link.href); return href ? [{ ...link, href }] : [] })

  return (
    <article className="@container/editorial min-w-0 bg-white text-[#061829] [overflow-wrap:anywhere]">
      <header className={partner ? "mx-auto max-w-3xl px-5 pt-10 pb-8 @3xl/editorial:px-8" : "border-b border-[#d5cfc3] bg-[#061829] py-8 text-white @3xl/editorial:py-10"}>
        <div className={partner ? "" : "mx-auto max-w-[1000px] px-5 @3xl/editorial:px-8"}>
          <p className={partner ? "text-sm text-[#516477]" : `text-xs font-black uppercase tracking-[.2em] ${city ? "text-[#ffb400]" : "text-[#17d4d7]"}`}>{partner ? "Benefitsi Magazin" : post.eyebrow} · {minutes} Min. Lesezeit</p>
          <Title className={partner ? "mt-3 text-3xl font-bold leading-tight tracking-tight @3xl/editorial:text-4xl" : "mt-5 max-w-[24ch] text-[clamp(1.875rem,4cqw,2.625rem)] leading-[1.08] font-black tracking-[-.045em]"}>{post.title || "Beitrag ohne Titel"}</Title>
          {city && dateLabel ? <p className="mt-4 text-sm leading-6 text-white/80">Von Benefitsi · Stand: <time dateTime={date.toISOString()}>{dateLabel}</time></p> : null}
          <p className={partner ? "mt-4 text-lg leading-8 text-[#516477]" : "mt-7 max-w-[60ch] text-lg leading-8 text-white/72"}>{post.excerpt}</p>
          {partner && dateLabel ? <p className="mt-4 text-xs text-[#516477]">Stand: <time dateTime={date.toISOString()}>{dateLabel}</time></p> : null}
        </div>
      </header>
      <div className={partner ? "mx-auto max-w-3xl px-5 pb-12 @3xl/editorial:px-8" : "mx-auto grid max-w-[1180px] grid-cols-1 gap-12 px-5 py-12 @3xl/editorial:px-8 @3xl/editorial:py-16 @5xl/editorial:grid-cols-[minmax(0,1fr)_280px]"}>
        <div className={partner ? "space-y-8" : "min-w-0 space-y-12"}>
          {(city || partner) && image ? (
            // Use the same public URL policy and 3:2 treatment as the website.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={post.image_alt ?? ""} width={1200} height={800} className="aspect-[3/2] h-auto w-full rounded-2xl object-cover" referrerPolicy="no-referrer" decoding="async" />
          ) : null}
          {post.content.map((section, index) => (
            <section key={index}>
              <Heading className={partner ? "text-xl leading-tight font-bold tracking-tight @3xl/editorial:text-2xl" : "text-[clamp(1.375rem,3cqw,1.75rem)] leading-[1.15] font-black tracking-[-.035em]"}>{section.heading}</Heading>
              <div className={partner ? "mt-3 space-y-4 leading-7 text-[#405467]" : "mt-5 space-y-5 text-base leading-8 text-[#586778]"}>
                {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{city ? <InlineText text={paragraph} /> : paragraph}</p>)}
              </div>
            </section>
          ))}
          {links.length ? <nav aria-label="Weiterlesen" className="border-t border-[#dbe4ee] pt-8">
            <Heading className="text-xs font-black uppercase tracking-[.16em] text-[#086fcc]">Weiterlesen</Heading>
            <div className="mt-5 grid gap-3 @xl/editorial:grid-cols-2">{links.map((link, index) => <a key={index} href={link.href} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-between gap-3 border border-[#dbe4ee] px-4 py-3 text-sm font-black hover:border-[#118cff]"><span>{link.label}</span><span aria-hidden="true" className="text-[#118cff]">→</span></a>)}</div>
          </nav> : null}
        </div>
        {sources.length ? <aside aria-label="Quellen und weitere Informationen" className={`h-fit border-t-2 border-[#118cff] bg-[#f3f5f7] p-5 ${partner ? "mt-10 rounded-2xl" : ""}`}>
          <Heading className="text-xs font-black uppercase tracking-[.16em] text-[#086fcc]">{city ? "Quellen" : "Weiterführend"}</Heading>
          {city ? <p className="mt-3 text-sm leading-6 text-[#586778]">Benefitsi fasst die verlinkten Quellen zur Orientierung zusammen. Prüfe veränderliche Angaben wie Termine, Fahrpläne und Öffnungszeiten vor deinem Besuch bei der zuständigen Stelle.</p> : null}
          <ul className="mt-5 space-y-3">{sources.map((source, index) => <li key={index}><a href={source.href} target="_blank" rel="noreferrer" className="text-sm font-bold leading-5 underline decoration-[#118cff] underline-offset-4">{source.label}</a></li>)}</ul>
          {dateLabel ? <p className="mt-6 text-[11px] leading-5 text-[#586778]">Stand: {dateLabel}</p> : null}
        </aside> : null}
      </div>
    </article>
  )
}
