import { requireAdmin } from "@/lib/admin"
import { loadBookingOperations } from "@/lib/bookings/data"

function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export async function GET() {
  await requireAdmin()
  const data = await loadBookingOperations()
  const header = [
    "Referenz",
    "Angebot",
    "Anbieter",
    "Status",
    "Anzahl",
    "Brutto_Cent",
    "Benefitsi_Gebuehr_Cent",
    "Anbieteranteil_Cent",
    "Waehrung",
    "Erstellt",
  ]
  const lines = [
    header.map(csvCell).join(";"),
    ...data.bookings.map((booking) =>
      [
        booking.publicReference,
        booking.offerTitle,
        booking.providerName,
        booking.state,
        booking.quantity,
        booking.totalAmount,
        booking.applicationFeeAmount,
        booking.totalAmount - booking.applicationFeeAmount,
        booking.currency,
        booking.createdAt,
      ]
        .map(csvCell)
        .join(";"),
    ),
  ]
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="benefitsi-testbuchungen-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  })
}
