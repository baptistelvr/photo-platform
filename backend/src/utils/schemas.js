const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(128),
});

const albumSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().or(z.literal('')),
  visibility: z.enum(['public', 'protected']).default('public'),
  password: z.string().min(8).max(128).optional(),
  coverPhotoId: z.number().int().positive().optional(),
  accessUserIds: z.array(z.number().int().positive()).optional(),
});

const photoMoveSchema = z.object({
  photoId: z.number().int().positive(),
  targetAlbumId: z.number().int().positive(),
});

const userSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(['user', 'admin', 'main_admin']).default('user'),
  status: z.enum(['active', 'disabled']).default('active'),
  password: z.string().min(8).max(128).optional(),
  permissions: z.array(z.string()).optional(),
  accessibleAlbumIds: z.array(z.number().int().positive()).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  albumSchema,
  photoMoveSchema,
  userSchema,
  resetPasswordSchema,
};
