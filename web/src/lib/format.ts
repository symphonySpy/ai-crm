/** Presentation helpers. Kept out of the service layer: formatting is a view concern. */

export const formatTHB = (value: number) =>
  new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(value);

/** A10: stored in UTC, read in Bangkok. */
export const formatDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(iso))
    : '—';

export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(
        new Date(iso),
      )
    : '—';
