/**
 * Parse and normalize pagination query parameters.
 *
 * Defaults:
 * page = 1
 * limit = 20
 *
 * Maximum limit:
 * 100 records per request
 */
export function getPagination(query = {}) {
  const parsedPage = Number.parseInt(query.page, 10);
  const parsedLimit = Number.parseInt(query.limit, 10);

  const page =
    Number.isInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

  let limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : 20;

  limit = Math.min(limit, 100);

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
}

/**
 * Build pagination metadata for an API response.
 */
export function buildPaginationMeta({
  page,
  limit,
  total,
}) {
  const totalPages =
    total === 0 ? 0 : Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}