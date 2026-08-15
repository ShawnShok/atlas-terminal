import { z } from "zod";

const numberish = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite());

const stringish = z.union([z.string(), z.number().transform(String)]);

export const massiveBarSchema = z
  .object({
    o: numberish.optional(),
    h: numberish.optional(),
    l: numberish.optional(),
    c: numberish.optional(),
    v: numberish.optional(),
    vw: numberish.optional(),
    n: numberish.optional(),
    t: numberish.optional(),
  })
  .passthrough();

export const massiveTradeSchema = z
  .object({
    i: stringish.optional(),
    p: numberish.optional(),
    s: numberish.optional(),
    t: numberish.optional(),
    x: numberish.optional(),
    c: z.array(numberish).optional(),
    z: numberish.optional(),
  })
  .passthrough();

export const massiveQuoteSchema = z
  .object({
    p: numberish.optional(),
    s: numberish.optional(),
    P: numberish.optional(),
    S: numberish.optional(),
    t: numberish.optional(),
  })
  .passthrough();

export const massiveSnapshotResponseSchema = z
  .object({
    request_id: z.string().optional(),
    status: z.string().optional(),
    ticker: z
      .object({
        ticker: z.string().optional(),
        todaysChange: numberish.optional(),
        todaysChangePerc: numberish.optional(),
        updated: numberish.optional(),
        day: massiveBarSchema.optional(),
        min: massiveBarSchema.optional(),
        prevDay: massiveBarSchema.optional(),
        lastTrade: massiveTradeSchema.optional(),
        lastQuote: massiveQuoteSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const massiveTickerDetailsResponseSchema = z
  .object({
    request_id: z.string().optional(),
    status: z.string().optional(),
    results: z
      .object({
        ticker: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        active: z.boolean().optional(),
        type: z.string().optional(),
        market: z.string().optional(),
        locale: z.string().optional(),
        currency_name: z.string().optional(),
        primary_exchange: z.string().optional(),
        cik: stringish.optional(),
        composite_figi: z.string().optional(),
        share_class_figi: z.string().optional(),
        sic_code: stringish.optional(),
        sic_description: z.string().optional(),
        homepage_url: z.string().optional(),
        list_date: z.string().optional(),
        market_cap: numberish.optional(),
        weighted_shares_outstanding: numberish.optional(),
        total_employees: numberish.optional(),
        branding: z
          .object({
            icon_url: z.string().optional(),
            logo_url: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const massiveAggregatesResponseSchema = z
  .object({
    request_id: z.string().optional(),
    status: z.string().optional(),
    results: z.array(massiveBarSchema).optional(),
    next_url: z.string().optional(),
  })
  .passthrough();

const massivePublisherSchema = z
  .object({
    name: z.string().optional(),
    homepage_url: z.string().optional(),
    logo_url: z.string().optional(),
    favicon_url: z.string().optional(),
  })
  .passthrough();

export const massiveNewsResponseSchema = z
  .object({
    request_id: z.string().optional(),
    status: z.string().optional(),
    next_url: z.string().optional(),
    results: z
      .array(
        z
          .object({
            id: stringish.optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            article_url: z.string().optional(),
            amp_url: z.string().optional(),
            image_url: z.string().optional(),
            published_utc: z.string().optional(),
            tickers: z.array(z.string()).optional(),
            keywords: z.array(z.string()).optional(),
            publisher: massivePublisherSchema.optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type MassiveBar = z.infer<typeof massiveBarSchema>;
export type MassiveSnapshotResponse = z.infer<
  typeof massiveSnapshotResponseSchema
>;
export type MassiveTickerDetailsResponse = z.infer<
  typeof massiveTickerDetailsResponseSchema
>;
export type MassiveAggregatesResponse = z.infer<
  typeof massiveAggregatesResponseSchema
>;
export type MassiveNewsResponse = z.infer<typeof massiveNewsResponseSchema>;
