import { z } from "zod";

import {
  massiveBarSchema,
  massiveQuoteSchema,
  massiveTradeSchema,
} from "./schemas";

const numberish = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite());

const stringish = z.union([z.string(), z.number().transform(String)]);

export const massiveTickerSearchResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z
      .array(
        z
          .object({
            ticker: z.string().optional(),
            name: z.string().optional(),
            primary_exchange: z.string().optional(),
            type: z.string().optional(),
            currency_name: z.string().optional(),
            active: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const massiveSnapshotTickerSchema = z
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
  .passthrough();

export const massiveSnapshotListResponseSchema = z
  .object({
    request_id: stringish.optional(),
    status: z.string().optional(),
    tickers: z.array(massiveSnapshotTickerSchema).optional(),
  })
  .passthrough();

export const massiveBenzingaNewsResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z
      .array(
        z
          .object({
            author: z.string().optional(),
            benzinga_id: stringish.optional(),
            body: z.string().optional(),
            channels: z.array(z.string()).optional(),
            images: z.array(z.string()).optional(),
            last_updated: z.string().optional(),
            published: z.string().optional(),
            tags: z.array(z.string()).optional(),
            teaser: z.string().optional(),
            tickers: z.array(z.string()).optional(),
            title: z.string().optional(),
            url: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const massiveTmxEventsResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z
      .array(
        z
          .object({
            company_name: z.string().optional(),
            date: z.string().optional(),
            isin: z.string().optional(),
            name: z.string().optional(),
            status: z.string().optional(),
            ticker: z.string().optional(),
            tmx_company_id: stringish.optional(),
            tmx_record_id: stringish.optional(),
            trading_venue: z.string().optional(),
            type: z.string().optional(),
            url: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const massiveOptionQuoteSchema = z
  .object({
    ask: numberish.optional(),
    ask_size: numberish.optional(),
    bid: numberish.optional(),
    bid_size: numberish.optional(),
    midpoint: numberish.optional(),
    last_updated: numberish.optional(),
    timeframe: z.string().optional(),
  })
  .passthrough();

const massiveOptionTradeSchema = z
  .object({
    price: numberish.optional(),
    size: numberish.optional(),
    sip_timestamp: numberish.optional(),
    timeframe: z.string().optional(),
  })
  .passthrough();

export const massiveOptionSnapshotSchema = z
  .object({
    break_even_price: numberish.optional(),
    day: z
      .object({
        close: numberish.optional(),
        volume: numberish.optional(),
        vwap: numberish.optional(),
        last_updated: numberish.optional(),
      })
      .passthrough()
      .optional(),
    details: z
      .object({
        contract_type: z.enum(["call", "put"]).optional(),
        exercise_style: z.string().optional(),
        expiration_date: z.string().optional(),
        shares_per_contract: numberish.optional(),
        strike_price: numberish.optional(),
        ticker: z.string().optional(),
      })
      .passthrough()
      .optional(),
    greeks: z
      .object({
        delta: numberish.optional(),
        gamma: numberish.optional(),
        theta: numberish.optional(),
        vega: numberish.optional(),
      })
      .passthrough()
      .optional(),
    implied_volatility: numberish.optional(),
    last_quote: massiveOptionQuoteSchema.optional(),
    last_trade: massiveOptionTradeSchema.optional(),
    open_interest: numberish.optional(),
    underlying_asset: z
      .object({
        last_updated: numberish.optional(),
        price: numberish.optional(),
        ticker: z.string().optional(),
        timeframe: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const massiveOptionChainResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z.array(massiveOptionSnapshotSchema).optional(),
  })
  .passthrough();

export const massiveOptionContractsResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z
      .array(
        z
          .object({
            contract_type: z.string().optional(),
            exercise_style: z.string().optional(),
            expiration_date: z.string().optional(),
            shares_per_contract: numberish.optional(),
            strike_price: numberish.optional(),
            ticker: z.string().optional(),
            underlying_ticker: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const massiveFinancialRecordSchema = z
  .object({
    cik: stringish.optional(),
    filing_date: z.string().optional(),
    fiscal_quarter: numberish.optional(),
    fiscal_year: numberish.optional(),
    period_end: z.string().optional(),
    timeframe: z.string().optional(),
    tickers: z.array(z.string()).optional(),
  })
  .passthrough();

export const massiveFinancialsResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z.array(massiveFinancialRecordSchema).optional(),
  })
  .passthrough();

export const massiveRatiosResponseSchema = z
  .object({
    request_id: stringish.optional(),
    next_url: z.string().optional(),
    results: z
      .array(
        z
          .object({
            cik: stringish.optional(),
            date: z.string().optional(),
            ticker: z.string().optional(),
            tickers: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type MassiveTickerSearchResponse = z.infer<
  typeof massiveTickerSearchResponseSchema
>;
export type MassiveSnapshotTicker = z.infer<typeof massiveSnapshotTickerSchema>;
export type MassiveSnapshotListResponse = z.infer<
  typeof massiveSnapshotListResponseSchema
>;
export type MassiveBenzingaNewsResponse = z.infer<
  typeof massiveBenzingaNewsResponseSchema
>;
export type MassiveTmxEventsResponse = z.infer<
  typeof massiveTmxEventsResponseSchema
>;
export type MassiveOptionSnapshot = z.infer<typeof massiveOptionSnapshotSchema>;
export type MassiveOptionChainResponse = z.infer<
  typeof massiveOptionChainResponseSchema
>;
export type MassiveOptionContractsResponse = z.infer<
  typeof massiveOptionContractsResponseSchema
>;
export type MassiveFinancialRecord = z.infer<typeof massiveFinancialRecordSchema>;
export type MassiveFinancialsResponse = z.infer<
  typeof massiveFinancialsResponseSchema
>;
export type MassiveRatiosResponse = z.infer<typeof massiveRatiosResponseSchema>;
