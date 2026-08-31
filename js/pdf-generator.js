/* ============================================================
   AZEE HARDWARE — Invoice PDF Engine
   Uses jsPDF + jspdf-autotable (bundled locally, works fully offline).
   Produces a real, selectable-text, properly structured A4 PDF —
   never a screenshot. Tables auto-paginate with repeated headers.

   NOTE ON CURRENCY SYMBOL: the standard PDF core fonts (Helvetica)
   do not include a glyph for the Indian Rupee sign (₹). To guarantee
   the PDF always renders correctly on every device without bundling
   an extra font file, PDF output uses "Rs." as the currency marker.
   The in-app screens use the real ₹ symbol since HTML/WebView fonts
   support it natively.
   ============================================================ */
(function (global) {

  function rs(num) {
    return 'Rs. ' + Utils.toIndianNumber(num);
  }

  async function buildInvoicePdf({ work, invoice, logs, materials, expenses, business }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 40;
    let y = 40;

    const totalAmount = Number(invoice.labourTotal || 0) + Number(invoice.materialsTotal || 0) +
      Number(invoice.expensesTotal || 0) + Number(invoice.additionalCharges || 0) - Number(invoice.discount || 0);
    const balance = totalAmount - Number(invoice.paidAmount || 0);

    // ---------- Header ----------
    if (business && business.logoDataUrl) {
      try {
        doc.addImage(business.logoDataUrl, 'JPEG', marginX, y, 54, 54, undefined, 'FAST');
      } catch (e) { /* ignore bad image */ }
    }
    const textX = (business && business.logoDataUrl) ? marginX + 66 : marginX;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(20, 20, 25);
    doc.text(business?.businessName || 'Business Name Not Set', textX, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80, 80, 85);
    let hy = y + 32;
    if (business?.address) { doc.text(wrapText(doc, business.address, 300), textX, hy); hy += 12 * lineCount(doc, business.address, 300); }
    const contactBits = [business?.phone ? 'Ph: ' + business.phone : '', business?.email || '', business?.gst ? 'GSTIN: ' + business.gst : ''].filter(Boolean).join('   ');
    if (contactBits) { doc.text(contactBits, textX, hy); hy += 12; }

    // Invoice meta box (right aligned)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 30, 30);
    doc.text('INVOICE', pageW - marginX, 46, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80, 80, 85);
    doc.text(`No: ${invoice.invoiceNumber}`, pageW - marginX, 60, { align: 'right' });
    doc.text(`Date: ${Utils.fmtDate(invoice.invoiceDate)}`, pageW - marginX, 72, { align: 'right' });

    y = Math.max(y + 66, hy + 10);
    doc.setDrawColor(220, 220, 225); doc.setLineWidth(1);
    doc.line(marginX, y, pageW - marginX, y);
    y += 18;

    // ---------- Bill To / Work Details (two columns) ----------
    const colW = (pageW - marginX * 2 - 20) / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
    doc.text('BILL TO', marginX, y);
    doc.text('WORK DETAILS', marginX + colW + 20, y);
    y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 60, 65);

    const billLines = [
      work.customerName || work.companyName || '—',
      work.companyName && work.customerName ? work.companyName : '',
      work.address || '',
      work.phone ? 'Ph: ' + work.phone : ''
    ].filter(Boolean);
    const workLines = [
      'Work: ' + work.name,
      'Type: ' + (work.type || '—'),
      work.buildingNo ? 'Building No: ' + work.buildingNo : '',
      'Start: ' + (Utils.fmtDate(work.startDate) || '—')
    ].filter(Boolean);

    let leftY = y, rightY = y;
    billLines.forEach(line => { doc.text(wrapText(doc, line, colW), marginX, leftY); leftY += 12 * lineCount(doc, line, colW); });
    workLines.forEach(line => { doc.text(wrapText(doc, line, colW), marginX + colW + 20, rightY); rightY += 12 * lineCount(doc, line, colW); });

    y = Math.max(leftY, rightY) + 14;

    // ---------- Labour Table ----------
    if (logs && logs.length) {
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Date', 'Time', 'Hours', 'Workers', 'Description', 'Amount']],
        body: logs.map(l => {
          const mins = (l.startTime && l.endTime) ? Utils.minutesBetween(l.startTime, l.endTime) : null;
          return [
            Utils.fmtDate(l.date),
            (l.startTime ? Utils.fmtTime12(l.startTime) : '') + (l.endTime ? ' - ' + Utils.fmtTime12(l.endTime) : ''),
            mins !== null ? Utils.fmtDuration(mins) : '—',
            String(l.workers || 1),
            l.description || '',
            rs(l.labourAmount || 0)
          ];
        }),
        foot: [['', '', '', '', 'Labour Total', rs(invoice.labourTotal)]],
        theme: 'grid',
        headStyles: { fillColor: [62, 123, 250], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        footStyles: { fillColor: [235, 238, 245], textColor: 20, fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8.3, textColor: 40 },
        columnStyles: { 4: { cellWidth: 150 }, 5: { halign: 'right' } },
        showHead: 'everyPage'
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // ---------- Materials Table ----------
    if (materials && materials.length) {
      ensureSpace(doc, y, 60, pageH) && (y = 40);
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Item', 'Qty', 'Unit', 'Supplier', 'Date', 'Amount']],
        body: materials.map(m => [m.itemName || '', String(m.quantity ?? ''), m.unit || '', m.supplier || '', Utils.fmtDate(m.date), rs(m.amount || 0)]),
        foot: [['', '', '', '', 'Materials Total', rs(invoice.materialsTotal)]],
        theme: 'grid',
        headStyles: { fillColor: [62, 123, 250], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        footStyles: { fillColor: [235, 238, 245], textColor: 20, fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8.3, textColor: 40 },
        columnStyles: { 0: { cellWidth: 150 }, 5: { halign: 'right' } },
        showHead: 'everyPage'
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // ---------- Expenses Table ----------
    if (expenses && expenses.length) {
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Category', 'Description', 'Date', 'Amount']],
        body: expenses.map(x => [x.category || '', x.description || '', Utils.fmtDate(x.date), rs(x.amount || 0)]),
        foot: [['', '', 'Other Expenses Total', rs(invoice.expensesTotal)]],
        theme: 'grid',
        headStyles: { fillColor: [62, 123, 250], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        footStyles: { fillColor: [235, 238, 245], textColor: 20, fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8.3, textColor: 40 },
        columnStyles: { 1: { cellWidth: 200 }, 3: { halign: 'right' } },
        showHead: 'everyPage'
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // ---------- Totals block ----------
    if (y > pageH - 170) { doc.addPage(); y = 40; }
    const totalsX = pageW - marginX - 220;
    const rows = [
      ['Labour Total', rs(invoice.labourTotal)],
      ['Materials Total', rs(invoice.materialsTotal)],
      ['Other Expenses', rs(invoice.expensesTotal)]
    ];
    if (Number(invoice.additionalCharges)) rows.push(['Additional Charges', rs(invoice.additionalCharges)]);
    if (Number(invoice.discount)) rows.push(['Discount', '- ' + rs(invoice.discount)]);
    rows.push(['Total Amount', rs(totalAmount)]);
    rows.push(['Paid Amount', rs(invoice.paidAmount)]);
    rows.push(['Balance Amount', rs(balance)]);

    doc.setFontSize(9.5);
    rows.forEach(([label, val], i) => {
      const isTotalRow = label === 'Total Amount' || label === 'Balance Amount';
      doc.setFont('helvetica', isTotalRow ? 'bold' : 'normal');
      doc.setTextColor(isTotalRow ? 200 : 70, isTotalRow ? 40 : 70, isTotalRow ? 45 : 75);
      doc.text(label, totalsX, y);
      doc.text(val, pageW - marginX, y, { align: 'right' });
      y += 16;
    });

    y += 6;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.7); doc.setTextColor(90, 90, 95);
    const words = 'Amount in words: ' + Utils.amountInWords(totalAmount);
    doc.text(wrapText(doc, words, pageW - marginX * 2), marginX, y);
    y += 12 * lineCount(doc, words, pageW - marginX * 2) + 8;

    // ---------- Notes ----------
    if (invoice.notes) {
      if (y > pageH - 100) { doc.addPage(); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
      doc.text('Notes / Terms', marginX, y); y += 12;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7); doc.setTextColor(80, 80, 85);
      doc.text(wrapText(doc, invoice.notes, pageW - marginX * 2), marginX, y);
      y += 12 * lineCount(doc, invoice.notes, pageW - marginX * 2) + 10;
    }
    // Payment details
    if (business?.upiId || business?.bankDetails) {
      if (y > pageH - 100) { doc.addPage(); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
      doc.text('Payment Details', marginX, y); y += 12;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7); doc.setTextColor(80, 80, 85);
      if (business.upiId) { doc.text('UPI: ' + business.upiId, marginX, y); y += 12; }
      if (business.bankDetails) { doc.text(wrapText(doc, business.bankDetails, pageW - marginX * 2), marginX, y); y += 12 * lineCount(doc, business.bankDetails, pageW - marginX * 2); }
      y += 10;
    }

    // ---------- Signature area ----------
    if (y > pageH - 90) { doc.addPage(); y = pageH - 100; } else { y = Math.max(y, pageH - 100); }
    if (business?.signatureDataUrl) {
      try { doc.addImage(business.signatureDataUrl, 'JPEG', pageW - marginX - 120, y - 40, 110, 40, undefined, 'FAST'); } catch (e) {}
    }
    doc.setDrawColor(150, 150, 155);
    doc.line(pageW - marginX - 140, y, pageW - marginX, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 85);
    doc.text('Authorized Signature', pageW - marginX, y + 12, { align: 'right' });

    // ---------- Footer page numbers ----------
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 155);
      doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 18, { align: 'right' });
      doc.text('Generated by AZEE HARDWARE', marginX, pageH - 18);
    }

    return doc.output('blob');
  }

  function wrapText(doc, text, maxWidth) {
    const lines = doc.splitTextToSize(String(text || ''), maxWidth);
    return lines;
  }
  function lineCount(doc, text, maxWidth) {
    return doc.splitTextToSize(String(text || ''), maxWidth).length;
  }
  function ensureSpace(doc, y, needed, pageH) {
    if (y > pageH - needed) { doc.addPage(); return true; }
    return false;
  }

  global.PdfGen = { buildInvoicePdf };
})(window);
