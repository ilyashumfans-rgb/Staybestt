export type BookingEmailDetails = {
  guestName: string; bookingRef: string; propertyName: string; address: string;
  roomName: string; roomsCount: number; guests: number;
  checkIn: string; checkOut: string; checkInTime: string; checkOutTime: string;
  timezone: string; amountMinor: number; paidAt: Date; paymentId: string; invoiceNumber: string;
};
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));
export function bookingEmailTemplate(d: BookingEmailDetails) {
  const date = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const paidAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: d.timezone }).format(d.paidAt);
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(d.amountMinor / 100);
  const dayOut = d.roomsCount === 0 && d.checkIn === d.checkOut;
  const rows = [
    ["Booking reference", d.bookingRef], ["Property", d.propertyName], ["Address", d.address],
    ...(dayOut ? [["Booking type", "Day Out"], ["Visit date", date(d.checkIn)]] : [
      ["Room", `${d.roomsCount} × ${d.roomName}`],
      ["Check-in", `${date(d.checkIn)} · ${d.checkInTime}`],
      ["Check-out", `${date(d.checkOut)} · ${d.checkOutTime}`],
    ]), ["Guests", d.guests], ["Timezone", d.timezone],
    ["Amount paid", amount], ["Payment received", `${paidAt} (${d.timezone})`],
    ["Payment reference", d.paymentId], ["Invoice number", d.invoiceNumber],
  ];
  const subject = `StayBest booking confirmed · ${d.bookingRef}`;
  const text = `Hello ${d.guestName},\n\nYour payment was received and your ${dayOut ? "Day Out visit" : "stay"} is confirmed.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nYour invoice PDF is attached. Keep this email for your arrival.\nFor help, reply to this email.\n\nStayBest`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#17263c">
    <div style="max-width:620px;margin:24px auto;background:white;border-radius:16px;overflow:hidden">
    <div style="background:#0b1d34;padding:28px;color:white"><div style="font-size:28px;font-weight:bold">Stay<span style="color:#ff8a22">Best</span></div><h1 style="font-size:22px">Your booking is confirmed</h1></div>
    <div style="padding:28px"><p>Hello ${escape(d.guestName)},</p><p>Thank you for booking with StayBest. Your payment has been received.</p>
    <table style="border-collapse:collapse;width:100%">${rows.map(([label, value]) => `<tr><th style="text-align:left;padding:12px 8px;border-bottom:1px solid #e8e8e8;font-size:13px;vertical-align:top;width:36%">${escape(label)}</th><td style="padding:12px 8px;border-bottom:1px solid #e8e8e8;font-size:14px;overflow-wrap:anywhere">${escape(value)}</td></tr>`).join("")}</table>
    <p style="background:#fff4e8;padding:16px;border-radius:8px"><strong>Your invoice PDF is attached.</strong><br>Keep this email for check-in.</p>
    <p style="font-size:13px;color:#596579">Need help? Reply to this email. All stay times above are local to the property.</p></div></div></body></html>`;
  return { subject, text, html };
}
