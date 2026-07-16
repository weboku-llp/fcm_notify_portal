import { z } from "zod";

export const CreateTemplateInput = z.object({
  projectId: z.string().nullable().optional(),
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(4000),
  /// May be a real URL or a template expression such as {{imageUrl}}.
  imageUrl: z.string().max(2000).nullable().optional(),
  deepLink: z.string().max(2000).nullable().optional(),
  dataJson: z.record(z.string()).default({}),
  variables: z.array(z.string().min(1).max(80)).max(50).default([]),
});
export type CreateTemplateInput = z.infer<typeof CreateTemplateInput>;

export const UpdateTemplateInput = CreateTemplateInput.partial().omit({ projectId: true });
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateInput>;

export const TemplatePublic = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  name: z.string(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  deepLink: z.string().nullable(),
  dataJson: z.record(z.string()),
  variables: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplatePublic = z.infer<typeof TemplatePublic>;
