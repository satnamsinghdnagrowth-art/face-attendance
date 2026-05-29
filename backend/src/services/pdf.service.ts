import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComplianceReportData {
  exam: {
    id: string;
    title: string;
    exam_code: string;
    scheduled_start: string;
    scheduled_end: string;
    duration_mins: number;
    status: string;
    institution_name?: string;
  };
  stats: {
    total_enrolled: number;
    verified: number;
    flagged: number;
    rejected: number;
    no_show: number;
    proxy_suspects: number;
  };
  halls: Array<{
    id: string;
    hall_name: string;
    building?: string;
    floor?: string;
    invigilator_name?: string;
  }>;
  events: Array<{
    student_name: string;
    verdict: string;
    confidence_score: number;
    scan_type: string;
    scanned_at: string;
    seat_number?: string;
    review_decision?: string;
    review_note?: string;
  }>;
  reportHash: string;
  generatedAt: string;
}

// ─── Colours ──────────────────────────────────────────────────────────────────

const COLOR_PRIMARY  = '#2563EB'; // blue
const COLOR_SUCCESS  = '#16A34A'; // green
const COLOR_DANGER   = '#DC2626'; // red
const COLOR_WARNING  = '#D97706'; // amber
const COLOR_MUTED    = '#6B7280'; // grey
const COLOR_BLACK    = '#111827';
const COLOR_ROW_ALT  = '#F3F4F6'; // light grey row stripe

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verdictColor(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case 'verified':       return COLOR_SUCCESS;
    case 'flagged':        return COLOR_WARNING;
    case 'rejected':       return COLOR_DANGER;
    case 'proxy_suspect':  return COLOR_DANGER;
    case 'no_show':        return COLOR_MUTED;
    default:               return COLOR_BLACK;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtPct(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PDFService {
  /**
   * Generate a compliance PDF report for an exam.
   * Returns the PDF as a Buffer ready to stream or store.
   */
  async generateCompliancePDF(data: ComplianceReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true });
        const pass = new PassThrough();
        const chunks: Buffer[] = [];

        pass.on('data', (chunk: Buffer) => chunks.push(chunk));
        pass.on('end', () => resolve(Buffer.concat(chunks)));
        pass.on('error', reject);

        doc.pipe(pass);

        // ── Page event: footer on every page ──────────────────────────────────
        const addFooter = (pageNum: number) => {
          const bottom = doc.page.height - 40;
          doc
            .save()
            .fontSize(8)
            .fillColor(COLOR_MUTED)
            .text(
              `Generated: ${fmtDate(data.generatedAt)}   |   Hash: ${data.reportHash.slice(0, 16)}...   |   CONFIDENTIAL`,
              50,
              bottom,
              { align: 'center', width: doc.page.width - 100 }
            )
            .text(`Page ${pageNum}`, 50, bottom, {
              align: 'right',
              width: doc.page.width - 100,
            })
            .restore();
        };

        let pageNum = 1;
        doc.on('pageAdded', () => {
          pageNum++;
          addFooter(pageNum);
        });

        // ── SECTION 1: Title Page ─────────────────────────────────────────────
        this._drawTitleSection(doc, data);
        addFooter(1);

        // ── SECTION 2: Summary Stats ──────────────────────────────────────────
        this._drawStatsSection(doc, data.stats);

        // ── SECTION 3: Hall Overview ──────────────────────────────────────────
        this._drawHallsSection(doc, data.halls);

        // ── SECTION 4: Verification Log ───────────────────────────────────────
        this._drawEventsSection(doc, data.events);

        doc.end();
      } catch (err) {
        logger.error('PDF generation error', { error: err });
        reject(err);
      }
    });
  }

  // ── Title section ──────────────────────────────────────────────────────────

  private _drawTitleSection(doc: PDFKit.PDFDocument, data: ComplianceReportData): void {
    const { exam } = data;

    // Header bar
    doc
      .rect(0, 0, doc.page.width, 8)
      .fill(COLOR_PRIMARY);

    doc
      .moveDown(1)
      .fontSize(22)
      .fillColor(COLOR_PRIMARY)
      .text('Exam Compliance Report', { align: 'center' })
      .moveDown(0.4)
      .fontSize(16)
      .fillColor(COLOR_BLACK)
      .text(exam.title, { align: 'center' })
      .moveDown(0.3)
      .fontSize(11)
      .fillColor(COLOR_MUTED)
      .text(`Exam Code: ${exam.exam_code}`, { align: 'center' });

    if (exam.institution_name) {
      doc
        .fontSize(11)
        .fillColor(COLOR_MUTED)
        .text(exam.institution_name, { align: 'center' });
    }

    doc.moveDown(0.8);

    // Info grid
    const left  = 80;
    const right = 320;
    const rowH  = 18;
    let   y     = doc.y;

    const infoRows: [string, string][] = [
      ['Start',    fmtDate(exam.scheduled_start)],
      ['End',      fmtDate(exam.scheduled_end)],
      ['Duration', `${exam.duration_mins} minutes`],
      ['Status',   exam.status.toUpperCase()],
    ];

    infoRows.forEach(([label, value]) => {
      doc
        .fontSize(10)
        .fillColor(COLOR_MUTED)
        .text(label, left, y)
        .fillColor(COLOR_BLACK)
        .text(value, right, y);
      y += rowH;
    });

    doc.y = y + 10;

    // Divider
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor(COLOR_PRIMARY)
      .lineWidth(1)
      .stroke();

    doc.moveDown(1);
  }

  // ── Stats section ───────────────────────────────────────────────────────────

  private _drawStatsSection(
    doc: PDFKit.PDFDocument,
    stats: ComplianceReportData['stats']
  ): void {
    doc
      .fontSize(13)
      .fillColor(COLOR_PRIMARY)
      .text('Verification Summary', { underline: false })
      .moveDown(0.5);

    const cols = [
      { label: 'Enrolled',       value: stats.total_enrolled, color: COLOR_BLACK   },
      { label: 'Verified',       value: stats.verified,       color: COLOR_SUCCESS  },
      { label: 'Flagged',        value: stats.flagged,         color: COLOR_WARNING  },
      { label: 'Rejected',       value: stats.rejected,        color: COLOR_DANGER   },
      { label: 'No-Show',        value: stats.no_show,         color: COLOR_MUTED    },
      { label: 'Proxy Suspects', value: stats.proxy_suspects,  color: COLOR_DANGER   },
    ];

    const cellW = (doc.page.width - 100) / cols.length;
    const startX = 50;
    const boxH   = 48;
    const y      = doc.y;

    cols.forEach((col, i) => {
      const x = startX + i * cellW;
      doc
        .rect(x, y, cellW - 4, boxH)
        .fillAndStroke('#FFFFFF', '#E5E7EB');

      doc
        .fontSize(18)
        .fillColor(col.color)
        .text(String(col.value), x, y + 6, { width: cellW - 4, align: 'center' });

      doc
        .fontSize(8)
        .fillColor(COLOR_MUTED)
        .text(col.label, x, y + 28, { width: cellW - 4, align: 'center' });
    });

    doc.y = y + boxH + 16;
    doc.moveDown(0.5);
  }

  // ── Halls section ───────────────────────────────────────────────────────────

  private _drawHallsSection(
    doc: PDFKit.PDFDocument,
    halls: ComplianceReportData['halls']
  ): void {
    doc
      .fontSize(13)
      .fillColor(COLOR_PRIMARY)
      .text('Hall Overview')
      .moveDown(0.4);

    if (halls.length === 0) {
      doc.fontSize(10).fillColor(COLOR_MUTED).text('No halls assigned.').moveDown(0.5);
      return;
    }

    const headers = ['Hall Name', 'Building', 'Floor', 'Invigilator'];
    const colW    = [(doc.page.width - 100) * 0.35, (doc.page.width - 100) * 0.25,
                     (doc.page.width - 100) * 0.15, (doc.page.width - 100) * 0.25];
    const startX  = 50;
    const rowH    = 18;

    // Header row
    let x = startX;
    let y = doc.y;
    doc.rect(startX, y, doc.page.width - 100, rowH).fill(COLOR_PRIMARY);
    headers.forEach((h, i) => {
      doc.fontSize(9).fillColor('#FFFFFF').text(h, x + 4, y + 4, { width: colW[i] - 8 });
      x += colW[i];
    });
    y += rowH;

    halls.forEach((hall, idx) => {
      const rowColor = idx % 2 === 0 ? '#FFFFFF' : COLOR_ROW_ALT;
      doc.rect(startX, y, doc.page.width - 100, rowH).fill(rowColor);

      const cells = [
        hall.hall_name,
        hall.building  ?? '—',
        hall.floor     ?? '—',
        hall.invigilator_name ?? '—',
      ];
      x = startX;
      cells.forEach((cell, i) => {
        doc.fontSize(9).fillColor(COLOR_BLACK).text(cell, x + 4, y + 4, { width: colW[i] - 8 });
        x += colW[i];
      });
      y += rowH;
    });

    doc.y = y + 12;
    doc.moveDown(0.5);
  }

  // ── Events section ──────────────────────────────────────────────────────────

  private _drawEventsSection(
    doc: PDFKit.PDFDocument,
    events: ComplianceReportData['events']
  ): void {
    doc
      .fontSize(13)
      .fillColor(COLOR_PRIMARY)
      .text('Detailed Verification Log')
      .moveDown(0.4);

    if (events.length === 0) {
      doc.fontSize(10).fillColor(COLOR_MUTED).text('No verification events recorded.').moveDown(0.5);
      return;
    }

    const headers = ['Student', 'Seat', 'Verdict', 'Confidence', 'Scan Type', 'Time', 'Review'];
    const totalW  = doc.page.width - 100;
    const colW    = [
      totalW * 0.20,
      totalW * 0.07,
      totalW * 0.12,
      totalW * 0.09,
      totalW * 0.10,
      totalW * 0.20,
      totalW * 0.22,
    ];
    const startX  = 50;
    const rowH    = 16;

    const drawTableHeader = (yPos: number) => {
      let x = startX;
      doc.rect(startX, yPos, totalW, rowH).fill(COLOR_PRIMARY);
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor('#FFFFFF').text(h, x + 3, yPos + 3, { width: colW[i] - 6 });
        x += colW[i];
      });
      return yPos + rowH;
    };

    let y = drawTableHeader(doc.y);

    events.forEach((ev, idx) => {
      // Page break if needed (leave room for footer)
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = drawTableHeader(doc.y);
      }

      const rowColor = idx % 2 === 0 ? '#FFFFFF' : COLOR_ROW_ALT;
      doc.rect(startX, y, totalW, rowH).fill(rowColor);

      const cells: Array<{ text: string; color: string }> = [
        { text: ev.student_name,                         color: COLOR_BLACK   },
        { text: ev.seat_number ?? '—',                   color: COLOR_MUTED   },
        { text: ev.verdict,                              color: verdictColor(ev.verdict) },
        { text: fmtPct(ev.confidence_score),             color: COLOR_BLACK   },
        { text: ev.scan_type,                            color: COLOR_MUTED   },
        { text: fmtDate(ev.scanned_at),                  color: COLOR_BLACK   },
        { text: ev.review_decision
            ? `${ev.review_decision}${ev.review_note ? ': ' + ev.review_note : ''}`
            : '—',
          color: COLOR_MUTED },
      ];

      let x = startX;
      cells.forEach((cell, i) => {
        doc
          .fontSize(7.5)
          .fillColor(cell.color)
          .text(cell.text, x + 3, y + 3, { width: colW[i] - 6, ellipsis: true });
        x += colW[i];
      });

      y += rowH;
    });

    doc.y = y + 12;
  }

  // ── CSV export ──────────────────────────────────────────────────────────────

  /**
   * Generate a CSV string from compliance report data.
   * Includes two sections: summary stats and the full verification event log.
   */
  generateCSV(data: ComplianceReportData): string {
    const lines: string[] = [];

    // Header metadata
    lines.push(`"Exam Compliance Report"`);
    lines.push(`"Title","${data.exam.title}"`);
    lines.push(`"Exam Code","${data.exam.exam_code}"`);
    lines.push(`"Institution","${data.exam.institution_name ?? 'N/A'}"`);
    lines.push(`"Start","${fmtDate(data.exam.scheduled_start)}"`);
    lines.push(`"End","${fmtDate(data.exam.scheduled_end)}"`);
    lines.push(`"Duration (mins)","${data.exam.duration_mins}"`);
    lines.push(`"Status","${data.exam.status}"`);
    lines.push(`"Generated At","${fmtDate(data.generatedAt)}"`);
    lines.push(`"Report Hash","${data.reportHash}"`);
    lines.push('');

    // Summary stats
    lines.push('"Summary Statistics"');
    lines.push('"Metric","Value"');
    lines.push(`"Total Enrolled","${data.stats.total_enrolled}"`);
    lines.push(`"Verified","${data.stats.verified}"`);
    lines.push(`"Flagged","${data.stats.flagged}"`);
    lines.push(`"Rejected","${data.stats.rejected}"`);
    lines.push(`"No-Show","${data.stats.no_show}"`);
    lines.push(`"Proxy Suspects","${data.stats.proxy_suspects}"`);
    lines.push('');

    // Halls
    lines.push('"Hall Overview"');
    lines.push('"Hall Name","Building","Floor","Invigilator"');
    data.halls.forEach(h => {
      lines.push(
        [
          `"${h.hall_name}"`,
          `"${h.building ?? ''}"`,
          `"${h.floor ?? ''}"`,
          `"${h.invigilator_name ?? ''}"`,
        ].join(',')
      );
    });
    lines.push('');

    // Events
    lines.push('"Verification Log"');
    lines.push('"Student Name","Seat","Verdict","Confidence %","Scan Type","Scanned At","Review Decision","Review Note"');
    data.events.forEach(ev => {
      const csvRow = [
        `"${ev.student_name}"`,
        `"${ev.seat_number ?? ''}"`,
        `"${ev.verdict}"`,
        `"${(ev.confidence_score * 100).toFixed(1)}"`,
        `"${ev.scan_type}"`,
        `"${fmtDate(ev.scanned_at)}"`,
        `"${ev.review_decision ?? ''}"`,
        `"${(ev.review_note ?? '').replace(/"/g, '""')}"`,
      ];
      lines.push(csvRow.join(','));
    });

    return lines.join('\r\n');
  }
}

export const pdfService = new PDFService();
export default pdfService;
