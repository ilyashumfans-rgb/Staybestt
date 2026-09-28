import { Link } from "wouter";
import { Facebook, Instagram, Twitter, MapPin, Mail, Phone, ArrowRight, Star } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-gradient-to-b from-secondary via-[#0a1830] to-[#050d1c] text-white/75">
      {/* Decorative glows, echoing the hero */}
      <div className="pointer-events-none absolute -top-48 -left-40 w-[520px] h-[520px] rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-56 -right-40 w-[560px] h-[560px] rounded-full bg-primary/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.10) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 pt-20 pb-10">
        {/* Brand band */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10 pb-14 mb-14 border-b border-white/10">
          <div className="flex items-center gap-6">
            <Link href="/" className="inline-block shrink-0">
              <span className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-b from-[#fdf8f2] to-white p-4 shadow-[0_20px_50px_rgba(255,107,0,0.18)] ring-1 ring-white/20">
                <BrandLogo alt="StayBest — Choose your own Space" className="h-16 w-auto" />
              </span>
            </Link>
            <div>
              <p className="font-serif text-2xl md:text-3xl text-white font-bold leading-tight">
                Your <span className="text-primary italic">Perfect</span> Stay, Every Time.
              </p>
              <p className="text-sm mt-2 max-w-md leading-relaxed">
                Discover and book the best resorts, hotels, and holiday packages across India.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-2 rounded-full">
              <Star className="w-4 h-4 fill-primary text-primary" />
              <span className="text-sm font-semibold text-white/90">4.9/5 Average Rating</span>
            </div>
            <Link
              href="/search"
              className="group inline-flex items-center gap-2 bg-primary text-white font-semibold px-6 py-3 rounded-full shadow-[0_10px_30px_rgba(255,107,0,0.35)] hover:shadow-[0_14px_36px_rgba(255,107,0,0.45)] hover:-translate-y-0.5 transition-all"
            >
              Explore Stays
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div>
            <h4 className="text-white font-serif text-lg font-semibold mb-6">Discover</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/search" className="hover:text-primary transition-colors">All Properties</Link></li>
              <li><Link href="/search?category=luxury" className="hover:text-primary transition-colors">Luxury Resorts</Link></li>
              <li><Link href="/search?category=budget" className="hover:text-primary transition-colors">Budget Stays</Link></li>
              <li><Link href="/search?category=package" className="hover:text-primary transition-colors">Holiday Packages</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-serif text-lg font-semibold mb-6">Company</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-serif text-lg font-semibold mb-6">Contact</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-primary" />
                </span>
                <span className="pt-1.5">123 Hospitality Avenue, Mumbai, MH 400001, India</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-primary" />
                </span>
                <span>+91 98765 43210</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-primary" />
                </span>
                <span>hello@staybestt.com</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-serif text-lg font-semibold mb-6">Follow Us</h4>
            <p className="text-sm mb-6 leading-relaxed">
              Travel inspiration, new stays, and exclusive offers — straight from StayBest.
            </p>
            <div className="flex gap-4">
              <a href="#" aria-label="Facebook" className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary hover:border-primary hover:text-white hover:-translate-y-0.5 transition-all">
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="https://www.instagram.com/staybestt?igsi=ZmRydm82aTR0NDJj"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow StayBest on Instagram"
                className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary hover:border-primary hover:text-white hover:-translate-y-0.5 transition-all"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" aria-label="Twitter" className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary hover:border-primary hover:text-white hover:-translate-y-0.5 transition-all">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <p>&copy; {new Date().getFullYear()} StayBest. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/admin" className="hover:text-primary transition-colors">Admin Dashboard</Link>
            <span className="hidden md:inline w-1 h-1 rounded-full bg-white/30" />
            <span>Made with precision</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
