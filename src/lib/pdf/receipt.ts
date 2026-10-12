import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { moneyInWords } from "./money-in-words";
import QRCode from "qrcode";

interface ReceiptData {
  receiptNumber: string;
  associationName: string;
  associationAddress: string;
  cacNumber?: string;
  logoUrl?: string;
  memberName: string;
  unitLabel: string;
  amountKobo: number;
  allocations: Array<{ billName: string; amountKobo: number }>;
  method: string;
  payerReference: string;
  paidAt: string;
  verifiedAt: string;
  verificationToken: string;
  appUrl: string;
}

const formatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
});

export async function generateReceiptPDF(data: ReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  let y = height - 50;

  page.drawText("RECEIPT", { x: 50, y, size: 24, font: boldFont, color: rgb(0.1, 0.1, 0.3) });
  y -= 30;
  page.drawText(data.associationName, { x: 50, y, size: 16, font: boldFont });
  y -= 20;
  page.drawText(data.associationAddress, { x: 50, y, size: 10, font });
  if (data.cacNumber) {
    y -= 15;
    page.drawText(`CAC: ${data.cacNumber}`, { x: 50, y, size: 10, font });
  }

  y -= 30;
  page.drawText(`Receipt No: ${data.receiptNumber}`, { x: 50, y, size: 12, font: boldFont });
  y -= 20;
  page.drawText(`Date: ${new Date(data.verifiedAt).toLocaleDateString("en-NG")}`, { x: 50, y, size: 10, font });

  y -= 30;
  page.drawText("Received From:", { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(data.memberName, { x: 50, y, size: 12, font: boldFont });
  y -= 15;
  page.drawText(`Unit: ${data.unitLabel}`, { x: 50, y, size: 10, font });

  y -= 30;
  page.drawText("The Sum of:", { x: 50, y, size: 10, font });
  y -= 15;
  const words = moneyInWords(data.amountKobo);
  page.drawText(words, { x: 50, y, size: 11, font, maxWidth: width - 100 });

  y -= 30;
  page.drawText(`Amount: ${formatter.format(data.amountKobo / 100)}`, { x: 50, y, size: 14, font: boldFont });

  y -= 30;
  page.drawText("Allocations:", { x: 50, y, size: 10, font });
  y -= 15;
  for (const alloc of data.allocations) {
    page.drawText(`• ${alloc.billName}: ${formatter.format(alloc.amountKobo / 100)}`, { x: 60, y, size: 10, font });
    y -= 15;
  }

  y -= 15;
  page.drawText(`Payment Method: ${data.method}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Reference: ${data.payerReference || "N/A"}`, { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText(`Paid Date: ${new Date(data.paidAt).toLocaleDateString("en-NG")}`, { x: 50, y, size: 10, font });

  y -= 40;
  page.drawText("_________________________", { x: 50, y, size: 10, font });
  y -= 15;
  page.drawText("Authorized Signature", { x: 50, y, size: 10, font });

  const qrUrl = `${data.appUrl}/verify/${data.verificationToken}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 100 });
  const qrImage = await pdfDoc.embedPng(qrDataUrl);
  page.drawImage(qrImage, { x: width - 150, y: 100, width: 100, height: 100 });

  y -= 30;
  page.drawText("Verify at:", { x: width - 150, y, size: 8, font });
  y -= 12;
  page.drawText(qrUrl, { x: width - 150, y, size: 7, font, maxWidth: 150 });

  return await pdfDoc.save();
}
