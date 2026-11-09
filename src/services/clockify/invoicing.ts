import { z } from 'zod'

import { clockifyReports } from './client'
import { type ClockifyScope } from './entry-cache'
import { formatClockifyEntryFilterDate } from './ranges'

// Clockify's JSON response uses timeentries/_id, unlike its published schema.
const InvoiceReport = z.object({ timeentries: z.array(z.object({ _id: z.string().min(1) })) })

export async function getInvoicedClockifyEntryIds(
  scope: ClockifyScope,
  start: Date,
  end: Date,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const ids = new Set<string>()
  const pageSize = 100
  for (let page = 1; ; page++) {
    const response = await clockifyReports.generateDetailedReport(
      {
        dateRangeStart: formatClockifyEntryFilterDate(start, timeZone).slice(0, -1),
        dateRangeEnd: formatClockifyEntryFilterDate(end, timeZone).slice(0, -1),
        dateRangeType: 'ABSOLUTE',
        exportType: 'JSON',
        invoicingState: 'INVOICED',
        rounding: false,
        timeZone,
        users: { ids: [scope.userId], contains: 'CONTAINS', status: 'ALL' },
        detailedFilter: { page, pageSize, sortColumn: 'ID', options: { totals: 'EXCLUDE' } },
      },
      { params: { workspaceId: scope.workspaceId } },
    )
    const { timeentries } = InvoiceReport.parse(response)
    for (const entry of timeentries) ids.add(entry._id)
    if (timeentries.length < pageSize) return ids
  }
}
