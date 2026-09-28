import { db, cmsPagesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";

// Default content for the editable site pages. Inserted the first time a page
// is requested, so the CMS works out of the box; edits are stored in the DB.
const INITIAL_CMS_PAGES: { slug: string; title: string; content: string }[] = [
  {
    slug: "about",
    title: "About Us",
    content: `## Your Perfect Stay, Every Time.

StayBest is a resort and hotel booking platform helping travellers discover and book the best resorts, hotels, and holiday packages across India.

## What we do

From luxury resorts to budget-friendly stays and curated holiday packages, we hand-pick properties so you can book with confidence. Every listing includes verified photos, transparent pricing, real guest reviews, and clear cancellation policies.

## Why StayBest

- Hand-picked properties across India's favourite destinations
- Transparent pricing with no hidden fees — pay at the hotel
- Free cancellation on many stays
- Personalized recommendations based on how you like to travel

## Work with us

Own a property? Email hello@staybestt.com and our team will onboard your resort or hotel.`,
  },
  {
    slug: "contact",
    title: "Contact Us",
    content: `## StayBest Hospitality Pvt. Ltd.

123 Hospitality Avenue, Mumbai, MH 400001, India

## Phone

+91 98765 43210 (9 AM – 9 PM IST, all days)

## Email

hello@staybestt.com — we reply within 24 hours.`,
  },
  {
    slug: "faq",
    title: "FAQ",
    content: `## How do I cancel a booking?

Open Upcoming Bookings and press Cancel on the booking. Hotels with free cancellation can be cancelled any time before check-in; other hotels allow cancellation up to 48 hours before check-in.

## Do I need an account to book?

No — you can book as a guest with your email. An account lets you track bookings, save wishlists, and get personalized recommendations.

## When is my payment charged?

StayBest currently confirms bookings instantly and payment is settled at the property (pay at hotel).

## Can I change my booking dates?

Cancel the existing booking (subject to the hotel's policy) and book again with new dates, or contact our support team for help.

## How do I become a StayBest partner?

Email hello@staybestt.com and our team will onboard your property.`,
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    content: `**Last updated:** August 2026

StayBest collects only the information needed to provide your bookings: your name, email, and stay details. We never sell your personal data.

## What we collect

Account details (name, email), booking information, wishlist items, and the travel preferences you choose to share for personalized recommendations.

## How we use it

To process bookings, personalize your experience, and — only if you opt in — send you offers and reminders. You can switch these off any time in Notifications.

## Your rights

You can update your details from your profile page, and request deletion of your account and data by emailing hello@staybestt.com.`,
  },
  {
    slug: "terms",
    title: "Terms & Conditions",
    content: `**Last updated:** August 2026

## Bookings

A booking is confirmed when you receive a booking reference. Payment is settled at the property unless stated otherwise.

## Cancellations

Subject to each hotel's policy. Properties with free cancellation can be cancelled any time before check-in; all other properties allow cancellation up to 48 hours before check-in.

## Conduct

Guests must comply with property rules. StayBest acts as a booking platform and is not liable for services delivered by the property.

## Accounts

Keep your credentials secure; you are responsible for activity under your account.`,
  },
];

const COMPANY_DETAILS = `## Company Details

**Company name:** STAYBESTT.COM PRIVATE LIMITED

**Mobile number:** +91 90351 13331

**GST Number:** 29ABUCS6788H1Z5

## Address

No. 68/4, 1st Site No 19 Vajarahalli, Kanakapura Doddakallasandra
**District:** Bengaluru Urban
**State:** Karnataka
**PIN Code:** 560062`;

export const CMS_DEFAULTS = INITIAL_CMS_PAGES.map((page) => {
  if (page.slug === "about") {
    return { ...page, content: `${page.content}\n\n${COMPANY_DETAILS}` };
  }
  if (page.slug === "contact") {
    return {
      ...page,
      content: `${COMPANY_DETAILS}\n\n## Email\n\nhello@staybestt.com — we reply within 24 hours.`,
    };
  }
  return page;
});

export const CMS_SLUGS = CMS_DEFAULTS.map((p) => p.slug);

// Match the custom public pages reviewed for this company-details update.
// Only these exact versions are upgraded, so later Admin edits stay untouched.
const COMPANY_UPDATE_SOURCE_HASHES: Record<string, string> = {
  about: "0fc9319046fa5d4b324ead98ff15c780321a749fc36c60a949425270be1eecb3",
  contact: "dba4b8eac35cb5dce5b7908321575eb2a273fc897f81f443b2269592966038ca",
};

let ensured = false;

/** Insert any missing default pages (runs once per process). */
export async function ensureCmsPages(): Promise<void> {
  if (ensured) return;
  await db
    .insert(cmsPagesTable)
    .values(CMS_DEFAULTS)
    .onConflictDoNothing({ target: cmsPagesTable.slug });
  // Upgrade the original seeded content in existing databases as well as new
  // installs. Exact matching preserves any subsequent edits made in Admin.
  for (const original of INITIAL_CMS_PAGES) {
    const updated = CMS_DEFAULTS.find((page) => page.slug === original.slug)!;
    if (updated.content === original.content) continue;
    await db
      .update(cmsPagesTable)
      .set({ content: updated.content, updatedAt: new Date() })
      .where(and(
        eq(cmsPagesTable.slug, original.slug),
        eq(cmsPagesTable.content, original.content),
      ));
  }
  const customPages = await db
    .select()
    .from(cmsPagesTable)
    .where(inArray(cmsPagesTable.slug, Object.keys(COMPANY_UPDATE_SOURCE_HASHES)));
  for (const page of customPages) {
    const sourceHash = createHash("sha256").update(page.content).digest("hex");
    if (sourceHash !== COMPANY_UPDATE_SOURCE_HASHES[page.slug]) continue;
    await db
      .update(cmsPagesTable)
      .set({
        content: `${page.content.trimEnd()}\n\n${COMPANY_DETAILS}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(cmsPagesTable.slug, page.slug),
        eq(cmsPagesTable.content, page.content),
      ));
  }
  ensured = true;
}
