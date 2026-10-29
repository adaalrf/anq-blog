import { z } from 'zod';
export const bodyInput = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'Write something first.')
      .max(2000, 'Keep posts under 2,001 characters.'),
  })
  .strict();
export const editInput = bodyInput.extend({ version: z.number().int().positive() });
export type Member = { id: string; username: string; displayName: string; bio: string };
export type SessionMember = Member & { isModerator: boolean };
export type Profile = Member & {
  followerCount: number;
  followingCount: number;
  following: boolean;
};
export type Post = {
  id: string;
  authorId: string;
  username: string;
  displayName: string;
  parentId: string | null;
  body: string;
  version: number;
  deleted: boolean;
  removed: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
};
export type PostPage = { items: Post[]; nextCursor: string | null };
export type MemberPage = { items: Member[]; nextCursor: string | null };
export const reportInput = z
  .object({
    reason: z.enum(['spam', 'abuse', 'other']),
    details: z.string().trim().max(1000).default(''),
  })
  .strict();
export const decisionInput = z
  .object({
    action: z.enum(['dismiss', 'remove']),
    note: z.string().trim().min(1, 'Explain the decision.').max(500),
  })
  .strict();
export type Report = {
  id: string;
  postId: string;
  threadId: string;
  reason: string;
  details: string;
  bodySnapshot: string;
  state: 'open' | 'dismissed' | 'removed';
  decisionNote: string;
  createdAt: string;
  reviewedAt: string | null;
  authorName: string;
  reporterUsername: string;
  reviewerUsername: string | null;
};
export type ReportPage = { items: Report[]; nextCursor: string | null };
