export interface MassivePagedResponse {
  readonly next_url?: string;
  readonly results?: readonly unknown[];
}

export interface BoundedPaginationOptions<Page extends MassivePagedResponse> {
  readonly maxPages: number;
  readonly isComplete?: (pages: readonly Page[]) => boolean;
  readonly loadNext: (nextUrl: string) => Promise<Page>;
}

/**
 * Follows a provider cursor without allowing an upstream response to create an
 * unbounded request chain. Domain services remain responsible for applying
 * their normalized result limit after deduplication and filtering.
 */
export async function collectBoundedProviderPages<Page extends MassivePagedResponse>(
  first: Page,
  options: BoundedPaginationOptions<Page>,
): Promise<readonly Page[]> {
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
    throw new RangeError("maxPages must be a positive integer.");
  }

  const pages: Page[] = [first];
  const followedUrls = new Set<string>();
  let nextUrl = first.next_url;

  while (
    nextUrl
    && pages.length < options.maxPages
    && !options.isComplete?.(pages)
  ) {
    if (followedUrls.has(nextUrl)) {
      throw new TypeError("Massive returned a repeated pagination URL.");
    }
    followedUrls.add(nextUrl);
    const page = await options.loadNext(nextUrl);
    pages.push(page);
    nextUrl = page.next_url;
  }

  return pages;
}
