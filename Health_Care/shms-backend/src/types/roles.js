export const ROLES = {
  STUDENT: "student",
  STAFF: "staff",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

export const ROLE_LIST = Object.values(ROLES);

export function hasRole(user, role) {
  return !!user && user.role === role;
}
