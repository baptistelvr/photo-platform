const { z } = require('zod');
const { ALL_PERMISSIONS } = require('../constants/permissions');

const id = z.number().int().positive();
const password = z.string().min(8, 'Au moins 8 caractères').max(128);
const trimmed = (max) => z.string().trim().max(max);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

const albumSchema = z.object({
  name: trimmed(120).min(1, 'Nom requis'),
  description: trimmed(1000).optional().or(z.literal('')),
  visibility: z.enum(['public', 'protected']).default('public'),
  password: password.optional().or(z.literal('')),
  removePassword: z.boolean().optional(),
  coverPhotoId: id.nullable().optional(),
  accessUserIds: z.array(id).optional(),
  collectionId: id.nullable().optional(),
});

const collectionSchema = z.object({
  name: trimmed(120).min(1, 'Nom requis'),
  description: trimmed(1000).optional().or(z.literal('')),
});

const storagePruneSchema = z.object({
  deleteEmptyAlbums: z.boolean().default(false),
});

const photoMoveSchema = z.object({
  photoId: id,
  targetAlbumId: id,
});

const userSchema = z.object({
  name: trimmed(120).min(1, 'Nom requis'),
  email: z.string().trim().email(),
  role: z.enum(['user', 'admin', 'main_admin']).default('user'),
  status: z.enum(['active', 'disabled']).default('active'),
  password: password.optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
  accessibleAlbumIds: z.array(id).optional(),
});

const resetPasswordSchema = z.object({
  password,
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  albumSchema,
  collectionSchema,
  storagePruneSchema,
  photoMoveSchema,
  userSchema,
  resetPasswordSchema,
};
