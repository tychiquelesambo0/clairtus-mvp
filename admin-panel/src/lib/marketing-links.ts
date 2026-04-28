/**
 * WhatsApp bot entrypoint for landing CTAs.
 * Override with `NEXT_PUBLIC_WHATSAPP_BOT_URL` in production (e.g. Vercel).
 */
const DEFAULT_WHATSAPP_BOT_URL =
  "https://wa.me/243000000000?text=Bonjour%20Clairtus";

export function getWhatsAppBotUrl(): string {
  const raw =
    typeof process.env.NEXT_PUBLIC_WHATSAPP_BOT_URL === "string"
      ? process.env.NEXT_PUBLIC_WHATSAPP_BOT_URL.trim()
      : "";
  if (raw.length > 0) {
    return raw;
  }
  return DEFAULT_WHATSAPP_BOT_URL;
}
