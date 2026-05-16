/**
 * Professional print utility — opens a new window with print-specific HTML.
 * Never use window.print() directly — it prints the entire SPA including sidebar.
 */
export function printDocument(
  title: string,
  bodyHtml: string,
  options?: { width?: number; height?: number }
) {
  const printWin = window.open(
    "",
    "_blank",
    `width=${options?.width || 800},height=${options?.height || 600}`
  );
  if (!printWin) {
    alert("Please allow popups to print documents");
    return;
  }

  const html = `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 40px; margin: 0; font-size: 13px; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px;
       text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .header { border-bottom: 2px solid #1A2F5A; padding-bottom: 16px; margin-bottom: 20px; }
  .header h1 { font-size: 18px; color: #1A2F5A; margin: 0; }
  .header p { font-size: 11px; color: #64748b; margin: 4px 0 0; }
  .footer { border-top: 1px dashed #cbd5e1; margin-top: 24px; padding-top: 8px;
            font-size: 10px; color: #94a3b8; text-align: center; }
  .amount { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .label { color: #64748b; font-size: 11px; }
  .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold;
               font-size: 15px; border-top: 2px solid #1A2F5A; padding-top: 8px; margin-top: 8px; }
  .section-title { font-size: 14px; font-weight: 700; color: #1A2F5A; margin: 16px 0 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px;
           font-weight: 600; background: #f1f5f9; color: #475569; }
  pre { white-space: pre-wrap; font-family: inherit; }
  @media print { body { padding: 20px; } }
</style>
</head><body>${bodyHtml}
<div class="footer">Computer generated document — Powered by Aumrti HMS</div>
</body></html>`;

  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 300);
}

/**
 * Build a standard hospital header for printed documents.
 */
export function printHeader(hospitalName: string, subtitle?: string, extras?: string): string {
  return `<div class="header">
  <h1>${escapeHtml(hospitalName)}</h1>
  ${subtitle ? `<p style="font-size:13px;color:#334155;margin-top:4px;">${escapeHtml(subtitle)}</p>` : ""}
  ${extras || ""}
</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format currency in Indian locale for print.
 */
export function printAmount(n: number): string {
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
