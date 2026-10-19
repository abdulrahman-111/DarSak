type CountedResult = { count: number | null; error: unknown };

function isRangeError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'PGRST103';
}

export async function readCountedPage<T extends CountedResult>(
  requestedPage: number,
  pageSize: number,
  fetchPage: (page: number) => PromiseLike<T>,
): Promise<{ result: T; page: number }> {
  let result = await fetchPage(requestedPage);
  let page = requestedPage;

  if (isRangeError(result.error) && requestedPage > 1) {
    const firstPage = await fetchPage(1);
    if (!firstPage.error && firstPage.count != null) {
      const pageCount = Math.max(1, Math.ceil(firstPage.count / pageSize));
      page = Math.min(requestedPage, pageCount);
      result = page === 1 ? firstPage : await fetchPage(page);
    }
  } else if (!result.error && result.count != null) {
    const pageCount = Math.max(1, Math.ceil(result.count / pageSize));
    if (page > pageCount) {
      page = pageCount;
      result = await fetchPage(page);
    }
  }

  return { result, page };
}
