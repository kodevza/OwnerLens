export function hasSearchExpression(query: string): boolean {
  return query.trim().length > 0;
}

export function matchesSearchExpression(searchText: string, query: string): boolean {
  const expression = query.trim();

  if (expression.length === 0) {
    return true;
  }

  try {
    return new RegExp(expression, "im").test(searchText);
  } catch {
    return false;
  }
}
