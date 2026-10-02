import { PartnerStatisticsToolbar } from "@/components/partner/partner-statistics-toolbar";
import { PartnerDashboard } from "@/components/partner/partner-dashboard";
import { PartnerStatistics } from "@/components/partner/partner-statistics";
import { partnerPageContext } from "@/lib/partners/page-context";
import { dashboardWindow, readDashboard } from "@/lib/partners/analytics";
export const dynamic = "force-dynamic";
export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams,
    ctx = await partnerPageContext(query.partner),
    preset = query.period ?? "last30";
  let data,
    failed = false;
  try {
    data = await readDashboard(
      ctx.client,
      ctx.partnerId,
      dashboardWindow(preset, new Date(), query.from, query.to),
      preset === "month",
    );
  } catch {
    failed = true;
  }
  const advanced = ctx.rights.features["analytics.advanced"] === true,
    exportable = ctx.rights.features["analytics.export"] === true;
  return (
    <PartnerDashboard {...ctx} active="statistics">
      <PartnerStatisticsToolbar
        partnerId={ctx.partnerId}
        preset={preset}
        advanced={advanced}
        exportable={exportable}
        from={query.from}
        to={query.to}
      />
      {preset === "month" && (
        <p className="mb-4 text-sm font-semibold">
          Monatsbericht im Dashboard · letzter abgeschlossener Berliner
          Kalendermonat. Keine automatische E-Mail.
        </p>
      )}
      {failed ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          Die Statistik konnte für diesen Zeitraum nicht geladen werden. Bitte
          prüfe deinen Tarif und den Zeitraum oder versuche es erneut.{" "}
          <a
            href={`/partner/statistics?partner=${ctx.partnerId}`}
            className="underline"
          >
            Zurück zu 30 Tagen
          </a>
        </div>
      ) : (
        data && <PartnerStatistics data={data} />
      )}
    </PartnerDashboard>
  );
}
