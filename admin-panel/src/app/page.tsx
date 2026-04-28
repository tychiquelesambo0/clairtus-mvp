"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import {
  ArrowRightLeft,
  Fingerprint,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import content from "@/locales/fr.json";
import { getWhatsAppBotUrl } from "@/lib/marketing-links";

const FEATURE_ICONS: LucideIcon[] = [
  ShieldCheck,
  Zap,
  Fingerprint,
  Scale,
];
const PROGRAM_ICONS: LucideIcon[] = [Terminal, LockKeyhole, ArrowRightLeft];

const viewportOnce = { once: true as const, margin: "-12% 0px -12% 0px", amount: 0.25 };

const glassCardClass =
  "bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] hover:border-primary/30 transition-all duration-300 backdrop-blur-sm";

export default function Home() {
  const prefersReducedMotion = useReducedMotion();
  const transition = useMemo(
    () =>
      prefersReducedMotion
        ? { duration: 0.01 }
        : { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    [prefersReducedMotion],
  );

  const staggerContainer = useMemo(
    () => ({
      hidden: {},
      visible: {
        transition: {
          staggerChildren: prefersReducedMotion ? 0 : 0.15,
          delayChildren: prefersReducedMotion ? 0 : 0,
        },
      },
    }),
    [prefersReducedMotion],
  );

  const staggerItem = useMemo(
    () =>
      prefersReducedMotion
        ? {
            hidden: { opacity: 1, y: 0 },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.01 },
            },
          }
        : {
            hidden: { opacity: 0, y: 28 },
            visible: {
              opacity: 1,
              y: 0,
              transition,
            },
          },
    [prefersReducedMotion, transition],
  );

  const whatsappBotUrl = getWhatsAppBotUrl();

  const blobTransition = prefersReducedMotion
    ? { duration: 0 }
    : {
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut" as const,
      };

  const blobAnimate = prefersReducedMotion
    ? undefined
    : {
        scale: [1, 1.05, 1],
        opacity: [0.3, 0.5, 0.3],
      };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#020617] text-slate-50 antialiased">
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#020617]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight text-primary">Clairtus</span>
          <a
            href={whatsappBotUrl}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {content.nav.apply}
          </a>
        </div>
      </header>

      <main id="contenu-principal">
        {/* —— Hero —— */}
        <section
          className="relative flex min-h-[min(100dvh,920px)] flex-col justify-center px-4 pb-8 pt-28 sm:px-6"
          aria-labelledby="hero-title"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute left-1/2 top-[18%] h-[min(70vw,560px)] w-[min(120vw,980px)] -translate-x-1/2 rounded-full bg-[hsl(var(--primary)/0.22)] blur-[100px]"
              aria-hidden
              animate={blobAnimate}
              transition={blobTransition}
            />
            <motion.div
              className="absolute bottom-[5%] right-[-10%] h-[420px] w-[420px] rounded-full bg-[hsl(var(--primary)/0.12)] blur-[90px]"
              aria-hidden
              animate={blobAnimate}
              transition={{ ...blobTransition, delay: prefersReducedMotion ? 0 : 1.6 }}
            />
            <motion.div
              className="absolute left-[-15%] top-[40%] h-[320px] w-[320px] rounded-full bg-emerald-400/10 blur-[80px]"
              aria-hidden
              animate={blobAnimate}
              transition={{ ...blobTransition, delay: prefersReducedMotion ? 0 : 3.2 }}
            />
          </div>

          <div className="relative mx-auto w-full max-w-4xl text-center">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={transition}
            >
              <p className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-semibold text-primary backdrop-blur-md">
                {content.hero.badge}
              </p>
            </motion.div>

            <motion.h1
              id="hero-title"
              className="mt-8 text-[clamp(2rem,6vw,3.75rem)] font-bold leading-[1.07] tracking-tight text-white"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ ...transition, delay: prefersReducedMotion ? 0 : 0.06 }}
            >
              {content.hero.title}
            </motion.h1>

            <motion.p
              className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/[0.68] sm:text-xl"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ ...transition, delay: prefersReducedMotion ? 0 : 0.12 }}
            >
              {content.hero.subtitle}
            </motion.p>

            <motion.div
              className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ ...transition, delay: prefersReducedMotion ? 0 : 0.18 }}
            >
              <a
                href={whatsappBotUrl}
                className="inline-flex min-h-[52px] min-w-[220px] items-center justify-center rounded-full bg-primary px-10 text-base font-semibold text-primary-foreground shadow-[0_0_52px_-8px_hsl(var(--primary)/0.85)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {content.hero.primaryCta}
              </a>
              <a
                href="#etapes"
                className="inline-flex min-h-[52px] min-w-[220px] items-center justify-center rounded-full border border-white/20 bg-white/5 px-10 text-base font-semibold text-white backdrop-blur-md transition-colors hover:border-white/35 hover:bg-white/10"
              >
                {content.hero.secondaryCta}
              </a>
            </motion.div>
          </div>

          <div className="flex flex-col items-center justify-center pt-10 pb-20 opacity-70">
            <p className="mb-6 px-4 text-center text-sm font-semibold text-gray-300">
              Vos fonds sont securises par des partenaires de confiance en RDC
            </p>
            <div className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-3 px-2 pt-20 sm:gap-x-6 sm:gap-y-4 md:gap-8">
              <div className="flex h-14 w-[150px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 backdrop-blur-sm sm:h-16 sm:w-[180px]">
                <Image
                  src="/logos/airtel.svg"
                  alt="Airtel Money"
                  width={140}
                  height={40}
                  className="h-6 w-auto object-contain sm:h-7"
                />
              </div>
              <div className="flex h-14 w-[150px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 backdrop-blur-sm sm:h-16 sm:w-[180px]">
                <Image
                  src="/logos/orange.svg"
                  alt="Orange Money"
                  width={48}
                  height={48}
                  className="h-7 w-auto object-contain sm:h-8"
                />
              </div>
              <div className="flex h-14 w-[150px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 backdrop-blur-sm sm:h-16 sm:w-[180px]">
                <Image
                  src="/logos/mpesa.svg"
                  alt="M-Pesa"
                  width={110}
                  height={59}
                  className="h-7 w-auto object-contain sm:h-8"
                />
              </div>
            </div>
          </div>
        </section>

        {/* —— Stats —— */}
        <section
          id="stats-confiance"
          className="border-y border-white/10 bg-white/[0.03]"
          aria-labelledby="stats-heading"
        >
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:grid-cols-3 sm:gap-8 sm:px-6">
            <h2 id="stats-heading" className="sr-only">
              Indicateurs de confiance
            </h2>
            <StatBlock
              value={content.stats.rate}
              label={content.stats.rateLabel}
              prefersReducedMotion={!!prefersReducedMotion}
              delay={0}
              transition={transition}
            />
            <StatBlock
              value={content.stats.salary}
              label={content.stats.salaryLabel}
              prefersReducedMotion={!!prefersReducedMotion}
              delay={0.08}
              transition={transition}
            />
            <StatBlock
              value={content.stats.network}
              label={content.stats.networkLabel}
              prefersReducedMotion={!!prefersReducedMotion}
              delay={0.16}
              transition={transition}
            />
          </div>
        </section>

        {/* —— Features 2×2 —— */}
        <section id="fonctionnalites" className="px-4 py-24 sm:px-6" aria-labelledby="features-heading">
          <div className="mx-auto max-w-6xl">
            <motion.h2
              id="features-heading"
              className="mx-auto max-w-3xl text-center text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight tracking-tight text-white"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={transition}
            >
              {content.features.title}
            </motion.h2>

            <motion.p
              className="mx-auto mt-4 max-w-2xl text-center text-lg text-white/65"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1 }}
              viewport={viewportOnce}
              transition={{ ...transition, delay: 0.06 }}
            >
              {content.features.subtitle}
            </motion.p>

            <motion.div
              className="mt-16 grid gap-6 sm:grid-cols-2"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
            >
              {content.features.items.map((item, i) => (
                <FeatureCard
                  key={item.title}
                  icon={FEATURE_ICONS[i]}
                  title={item.title}
                  description={item.description}
                  variants={staggerItem}
                />
              ))}
            </motion.div>
          </div>
        </section>

        {/* —— How it works —— */}
        <section
          id="etapes"
          className="relative border-t border-white/10 px-4 py-24 sm:px-6"
          aria-labelledby="how-heading"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.12),transparent)]" />
          <div className="relative mx-auto max-w-6xl">
            <motion.h2
              id="how-heading"
              className="mx-auto max-w-3xl text-center text-[clamp(1.75rem,4vw,2.35rem)] font-bold leading-tight tracking-tight text-white"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={transition}
            >
              {content.programs.title}
            </motion.h2>
            <motion.p
              className="mx-auto mt-4 max-w-3xl text-center text-lg text-white/65"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1 }}
              viewport={viewportOnce}
              transition={{ ...transition, delay: 0.06 }}
            >
              {content.programs.subtitle}
            </motion.p>

            <div className="relative mt-20">
              <div
                className="pointer-events-none absolute left-[8%] right-[8%] top-[76px] hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block"
                aria-hidden
              />
              <motion.div
                className="grid gap-12 md:grid-cols-3 md:gap-8"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={viewportOnce}
              >
                {content.programs.items.map((item, i) => (
                  <ProgramStep
                    key={item.title}
                    icon={PROGRAM_ICONS[i]}
                    title={item.title}
                    description={item.description}
                    variants={staggerItem}
                  />
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* —— Final CTA —— */}
        <section
          id="cta-finale"
          className="relative px-4 py-28 sm:px-6"
          aria-labelledby="cta-heading"
        >
          <div className="pointer-events-none absolute inset-0">
            <motion.div
              className="absolute left-1/2 top-1/2 h-[420px] w-[min(100%,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--primary)/0.18)] blur-[100px]"
              aria-hidden
              animate={blobAnimate}
              transition={blobTransition}
            />
          </div>
          <motion.div
            className="relative mx-auto max-w-3xl text-center"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
            whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={transition}
          >
            <h2
              id="cta-heading"
              className="text-[clamp(1.85rem,4.2vw,2.75rem)] font-bold leading-tight tracking-tight text-white"
            >
              {content.cta.title}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/[0.68]">
              {content.cta.subtitle}
            </p>
            <a
              href={whatsappBotUrl}
              className="relative mt-12 inline-flex min-h-[56px] min-w-[min(100%,300px)] items-center justify-center overflow-hidden rounded-full bg-primary px-12 text-lg font-semibold text-primary-foreground shadow-[0_0_60px_-10px_hsl(var(--primary)/0.9)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent motion-reduce:hidden" />
              {content.cta.button}
            </a>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black/40 py-14 text-center backdrop-blur-sm">
        <p className="mx-auto max-w-2xl px-4 text-sm leading-relaxed text-slate-400">
          {content.footer.description}
        </p>
        <p className="mt-3 text-xs text-slate-500">{content.footer.rights}</p>
      </footer>
    </div>
  );
}

function StatBlock({
  value,
  label,
  prefersReducedMotion,
  delay,
  transition,
}: {
  value: string;
  label: string;
  prefersReducedMotion: boolean;
  delay: number;
  transition: { duration: number; ease?: [number, number, number, number] };
}) {
  return (
    <motion.div
      className="text-center"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={viewportOnce}
      transition={{ ...transition, delay: prefersReducedMotion ? 0 : delay }}
    >
      <div className="font-mono text-5xl font-bold tabular-nums tracking-tight text-primary sm:text-6xl">
        {value}
      </div>
      <div className="mt-3 text-[15px] font-medium text-slate-400">{label}</div>
    </motion.div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  variants,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  variants: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number; transition?: object };
  };
}) {
  return (
    <motion.article variants={variants} className={`${glassCardClass} group relative overflow-hidden`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        <Icon size={24} strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-lg font-semibold leading-snug text-white sm:text-xl">{title}</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-white/[0.72]">{description}</p>
    </motion.article>
  );
}

function ProgramStep({
  icon: Icon,
  title,
  description,
  variants,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  variants: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number; transition?: object };
  };
}) {
  return (
    <motion.div
      variants={variants}
      className={`${glassCardClass} relative z-10 flex flex-col items-center text-center`}
    >
      <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        <Icon size={24} strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-lg font-semibold leading-snug text-white">{title}</h3>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/[0.72]">{description}</p>
    </motion.div>
  );
}
