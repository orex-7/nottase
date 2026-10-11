/**
 * Moedas disponíveis para o formato de número "Moedas" (30 moedas).
 * Código ISO 4217 + símbolo exibido + nome legível.
 */
export interface Currency {
  /** Código ISO 4217 (ex.: "BRL"). */
  code: string;
  /** Símbolo exibido (ex.: "R$"). */
  symbol: string;
  /** Nome legível da moeda (ex.: "Real brasileiro"). */
  name: string;
}

/** As 30 moedas oferecidas no seletor de formato de número. */
export const CURRENCIES: Currency[] = [
  { code: "BRL", symbol: "R$", name: "Real brasileiro" },
  { code: "USD", symbol: "$", name: "Dólar americano" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "Libra esterlina" },
  { code: "JPY", symbol: "¥", name: "Iene japonês" },
  { code: "CNY", symbol: "¥", name: "Yuan chinês" },
  { code: "ARS", symbol: "$", name: "Peso argentino" },
  { code: "CLP", symbol: "$", name: "Peso chileno" },
  { code: "COP", symbol: "$", name: "Peso colombiano" },
  { code: "PEN", symbol: "S/", name: "Sol peruano" },
  { code: "MXN", symbol: "$", name: "Peso mexicano" },
  { code: "UYU", symbol: "$", name: "Peso uruguaio" },
  { code: "PYG", symbol: "₲", name: "Guarani paraguaio" },
  { code: "BOB", symbol: "Bs", name: "Boliviano" },
  { code: "VES", symbol: "Bs", name: "Bolívar venezuelano" },
  { code: "CAD", symbol: "C$", name: "Dólar canadense" },
  { code: "AUD", symbol: "A$", name: "Dólar australiano" },
  { code: "NZD", symbol: "NZ$", name: "Dólar neozelandês" },
  { code: "CHF", symbol: "CHF", name: "Franco suíço" },
  { code: "SEK", symbol: "kr", name: "Coroa sueca" },
  { code: "NOK", symbol: "kr", name: "Coroa norueguesa" },
  { code: "DKK", symbol: "kr", name: "Coroa dinamarquesa" },
  { code: "PLN", symbol: "zł", name: "Zlóti polonês" },
  { code: "RUB", symbol: "₽", name: "Rublo russo" },
  { code: "INR", symbol: "₹", name: "Rupia indiana" },
  { code: "KRW", symbol: "₩", name: "Won sul-coreano" },
  { code: "ZAR", symbol: "R", name: "Rand sul-africano" },
  { code: "TRY", symbol: "₺", name: "Lira turca" },
  { code: "ILS", symbol: "₪", name: "Novo shekel israelense" },
  { code: "AED", symbol: "د.إ", name: "Dirham dos Emirados" },
];

/** Busca uma moeda pelo código ISO (devolve a primeira como padrão). */
export function currencyByCode(code: string | undefined): Currency {
  if (!code) return CURRENCIES[0];
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}
