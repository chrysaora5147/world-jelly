import { jellyFortune } from "@/data/fortune";

export function getJellyFortune() {
  return jellyFortune;
}

export function formatFortune(amount: number, currency: string) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}
