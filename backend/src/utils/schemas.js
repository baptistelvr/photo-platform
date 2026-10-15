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
  parentId: id.nullable().optional(),
});

const collectionSchema = z.object({
  name: trimmed(120).min(1, 'Nom requis'),
  description: trimmed(1000).optional().or(z.literal('')),
  featured: z.boolean().optional(),
});

// Ids in their new order. Duplicates are refused.
const orderIds = z.array(id).max(20000).refine((ids) => new Set(ids).size === ids.length, 'Identifiants en double');
const orderSchema = z.object({ ids: orderIds });
const albumOrderSchema = z.object({ collectionId: id.nullable(), parentId: id.nullable().optional(), ids: orderIds });

const storagePruneSchema = z.object({
  deleteEmptyAlbums: z.boolean().default(false),
});

// fromAlbumId: the album the photo leaves (by default the one holding its files).
const photoMoveSchema = z.object({
  photoId: id,
  targetAlbumId: id,
  fromAlbumId: id.optional(),
});

const photoAlbumsSchema = z.object({
  albumIds: z.array(id).min(1).max(200),
});

const THEMES = [
  'auto', 'classique', 'minuit', 'argentique', 'ocean', 'terracotta',
  'printemps', 'ete', 'automne', 'hiver', 'halloween', 'noel', 'saint-valentin',
];

const BACKGROUNDS = ['mosaique', 'fondu', 'grille', 'polaroids', 'pellicule', 'uni'];

const siteSettingsSchema = z.object({
  heroTitle: trimmed(120).default(''),
  heroSubtitle: trimmed(160).default(''),
  heroText: trimmed(600).default(''),
  theme: z.enum(THEMES).default('classique'),
  // How the cover shows the photos: 3D wall, slideshow, grid, prints, film strip, or none.
  background: z.enum(BACKGROUNDS).default('mosaique'),
  showcase: z.object({
    mode: z.enum(['all', 'albums']).default('all'),
    albumIds: z.array(id).max(200).default([]),
  }).default({ mode: 'all', albumIds: [] }),
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
  orderSchema,
  albumOrderSchema,
  storagePruneSchema,
  photoMoveSchema,
  photoAlbumsSchema,
  siteSettingsSchema,
  THEMES,
  BACKGROUNDS,
  userSchema,
  resetPasswordSchema,
};
