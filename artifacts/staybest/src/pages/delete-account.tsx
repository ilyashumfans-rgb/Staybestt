import { useEffect } from "react";
import { Layout } from "@/components/layout/Layout";

const email = "admin@staybestt.com";
const requestLink = `mailto:${email}?subject=${encodeURIComponent("StayBest account and data deletion request")}&body=${encodeURIComponent("Hello StayBest support,\n\nPlease delete my StayBest account and associated personal data.\n\nRegistered email address or username:\n\nPlease confirm any identity verification required, the expected completion date, and any records that must be retained and for how long.\n")}`;

export default function DeleteAccountPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Delete your account and data | StayBest";
    return () => { document.title = previous; };
  }, []);

  return (
    <Layout>
      <main className="container mx-auto px-4 pt-28 pb-16">
        <article className="mx-auto max-w-3xl space-y-8 rounded-2xl border bg-white p-6 md:p-10">
          <header className="space-y-3">
            <h1 className="text-3xl font-bold">Delete your StayBest account and data</h1>
            <p className="text-muted-foreground">STAYBESTT.COM PRIVATE LIMITED</p>
            <p>You can request deletion of your StayBest account and associated personal data without signing in or reinstalling the app.</p>
          </header>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">How to request deletion</h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>Email <a className="text-primary underline" href={requestLink}>{email}</a> with the subject “StayBest account and data deletion request”.</li>
              <li>Send the request from your registered email address and include your account username, if you have one. If you cannot access that email, explain this to support so ownership can be verified.</li>
              <li>Support will verify account ownership and confirm the deletion steps, expected completion date, and any records that must be retained.</li>
            </ol>
            <p>Do not send passwords, one-time codes, or payment-card details.</p>
            <a className="inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href={requestLink}>Email deletion request</a>
            <p className="text-sm text-muted-foreground">This opens your email app. You must send the email to submit your request. If no email app opens, copy the address above into your email service.</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Data covered by your request</h2>
            <p>Your request covers your sign-in account, profile information such as your name, email address and phone number, saved preferences and wishlist, and other personal data associated with your account that is not required to be retained.</p>
            <p>Account deletion removes access to the account. Uninstalling the app alone does not delete your account. Tell support about any active bookings, pending refunds, or disputes so these can be addressed.</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Records that may be retained</h2>
            <p>Booking, invoice, payment and refund records may need to be retained for applicable tax, accounting, legal obligations or unresolved disputes. Information needed for fraud prevention or security may also be retained where legally permitted.</p>
            <p>These records are retained only for the applicable legal period or until the relevant obligation or dispute is resolved. Support will identify the records and applicable retention period when responding to your request. There is no automatic 90-day deletion promise.</p>
          </section>
          <p className="text-sm text-muted-foreground">This page provides a support-assisted deletion request, not an instant account-deletion action.</p>
        </article>
      </main>
    </Layout>
  );
}
