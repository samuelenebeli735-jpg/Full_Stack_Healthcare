import { getPagination, buildPaginationMeta } from "./pagination.js";

const SORT_ORDER = {
  asc: "asc",
  desc: "desc",
};

/**
 * Convert a dotted relation path into a nested Prisma filter object.
 * Example: "medicalRecord.profile.firstName" -> { medicalRecord: { profile: { firstName: { ... } } } }
 */
export function nestedField(path, value) {
  const parts = path.split(".");
  const result = {};
  let cursor = result;

  for (let i = 0; i < parts.length - 1; i++) {
    cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }

  cursor[parts[parts.length - 1]] = value;
  return result;
}

export { getPagination, buildPaginationMeta };

export function getSorting(query = {}, allowedFields = []) {
  const rawField = query.sort;
  const rawOrder = query.order;

  if (!rawField || !allowedFields.includes(rawField)) {
    return null;
  }

  const order = SORT_ORDER[rawOrder?.toLowerCase()] || "asc";

  return { [rawField]: order };
}

export function buildPrismaQuery(query = {}, options = {}) {
  const {
    allowedSortFields = [],
    defaultSort = null,
    searchFields = [],
    searchMode = "contains",
  } = options;

  const { page, limit, skip } = getPagination(query);
  const orderBy = getSorting(query, allowedSortFields) || defaultSort;
  const where = {};

  if (query.search && searchFields.length > 0) {
    where.OR = searchFields.map((field) =>
      nestedField(field, {
        [searchMode]: query.search,
        mode: "insensitive",
      })
    );
  }

  Object.entries(query).forEach(([key, value]) => {
    if (
      ["page", "limit", "sort", "order", "search"].includes(key) ||
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }
    if (key.endsWith("Id") || key.endsWith("id")) {
      where[key] = value;
    } else if (key === "isActive") {
      where[key] = value === "true";
    } else if (key === "status") {
      where[key] = value;
    } else if (key === "date" || key === "appointmentDate") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        where[key] = {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lte: new Date(date.setHours(23, 59, 59, 999)),
        };
      }
    }
  });

  return {
    where,
    skip,
    take: limit,
    orderBy,
    page,
    limit,
  };
}

export function responseWithPagination(items, total, { page, limit }) {
  return {
    items,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}
