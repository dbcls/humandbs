import type { User } from "@/db/types";

export const AUTHOR_ID_1 = "test-user";
export const AUTHOR_ID_2 = "another-user";

export const mockUsers: User[] = [
  {
    id: AUTHOR_ID_1,
    username: "AUTHOR_ID_1",
    name: "Test User",
    email: "test@test.local",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    role: "admin",
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  },
  {
    id: AUTHOR_ID_2,
    username: "AUTHOR_ID_2",
    name: "Test User 2",
    email: "test2@test.local",
    createdAt: new Date("2024-01-02T00:00:00Z"),
    role: "admin",
    updatedAt: new Date("2024-03-01T00:00:00Z"),
  },
];
